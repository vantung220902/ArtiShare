import { createApiShareClient } from '../claude/apiShareClient';
import { createFakeShareClient } from '../claude/fakeShareClient';
import type { Account, ShareClient } from '../claude/shareClient';
import { planArtifact } from '../core/planner';
import { abortableSleep, type RunItem, runInvites, summarize } from '../core/runner';
import type { Envelope, Messages, PreviewResult, Reply } from '../lib/messages';
import { loadRun, type RunState, saveRun } from '../lib/storage';

const FAKE = import.meta.env.WXT_FAKE_CLAUDE === 'true';
const client: ShareClient = FAKE ? createFakeShareClient() : createApiShareClient();

let activeRun: AbortController | null = null;
let account: Account | null = null;

/**
 * MV3 service workers are shut down after ~30s without extension API activity. Long backoffs
 * would let that happen mid-run, so sleep in short slices with a cheap API call between them.
 */
async function keepAliveSleep(ms: number, signal?: AbortSignal): Promise<void> {
  const slice = 20_000;
  let left = ms;
  while (left > 0 && !signal?.aborted) {
    const step = Math.min(slice, left);
    await abortableSleep(step, signal);
    left -= step;
    if (left > 0) await chrome.runtime.getPlatformInfo();
  }
}

async function whoami(): Promise<Account> {
  account ??= await client.whoami();
  return account;
}

async function preview(req: Messages['preview']['req']): Promise<PreviewResult[]> {
  const me = await whoami().catch(() => null);
  const results: PreviewResult[] = [];
  for (const artifact of req.artifacts) {
    try {
      const existing = await client.listSharees(artifact);
      results.push({
        artifact,
        plan: planArtifact({
          artifact,
          desired: req.emails,
          access: req.access,
          existing,
          orgDomains: req.orgDomains,
          selfEmail: me?.email,
        }),
      });
    } catch (err) {
      results.push({ artifact, error: (err as Error).message });
    }
  }
  return results;
}

async function execute(run: RunState): Promise<void> {
  const controller = new AbortController();
  activeRun = controller;
  run.status = 'running';
  run.reason = undefined;
  await saveRun(run);

  try {
    const summary = await runInvites(run.items, client, {
      delayMs: run.delayMs,
      jitterMs: Math.round(run.delayMs / 2),
      signal: controller.signal,
      sleep: keepAliveSleep,
      onUpdate: () => saveRun(run),
    });
    run.status = summary.status;
    run.reason = summary.reason;
  } catch (err) {
    run.status = 'stopped';
    run.reason = `Unexpected error: ${(err as Error).message}`;
  } finally {
    activeRun = null;
    await saveRun(run);
  }
}

async function start(req: Messages['start']['req']): Promise<null> {
  if (activeRun) throw new Error('A run is already in progress.');
  const items: RunItem[] = req.plans.flatMap((plan) =>
    plan.toInvite.map((i) => ({
      artifact: plan.artifact,
      email: i.email,
      access: i.access,
      status: 'pending' as const,
      attempts: 0,
    })),
  );
  if (!items.length) throw new Error('Nobody to invite.');
  const run: RunState = {
    id: crypto.randomUUID(),
    jobName: req.jobName,
    createdAt: Date.now(),
    status: 'running',
    delayMs: req.delayMs,
    items,
  };
  void execute(run);
  return null;
}

async function resume(): Promise<null> {
  if (activeRun) throw new Error('A run is already in progress.');
  const run = await loadRun();
  if (!run || summarize(run.items).pending === 0) throw new Error('There is nothing left to resume.');
  void execute(run);
  return null;
}

async function handle(msg: Envelope): Promise<unknown> {
  switch (msg.type) {
    case 'whoami':
      account = null;
      return whoami();
    case 'preview':
      return preview(msg);
    case 'start':
      return start(msg);
    case 'stop':
      activeRun?.abort();
      return null;
    case 'resume':
      return resume();
    case 'clear':
      if (activeRun) throw new Error('Stop the run before clearing it.');
      await saveRun(null);
      return null;
  }
}

export default defineBackground(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});

  // A fresh worker means any run marked "running" was cut off (browser or extension restart).
  void loadRun().then((run) => {
    if (run?.status === 'running' && !activeRun) {
      run.status = 'stopped';
      run.reason = 'Interrupted because the browser or extension restarted. Resume to continue.';
      void saveRun(run);
    }
  });

  chrome.runtime.onMessage.addListener((msg: Envelope, sender, sendResponse: (r: Reply<unknown>) => void) => {
    if (sender.id !== chrome.runtime.id) return false;
    handle(msg).then(
      (data) => sendResponse({ ok: true, data }),
      (err: Error) => sendResponse({ ok: false, error: err.message }),
    );
    return true;
  });
});
