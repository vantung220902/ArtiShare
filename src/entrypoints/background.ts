import { createApiShareClient } from '../claude/apiShareClient';
import { createFakeShareClient } from '../claude/fakeShareClient';
import type { ShareClient } from '../claude/shareClient';
import { createConfigController } from '../lib/configController';
import { planArtifact } from '../core/planner';
import { abortableSleep } from '../core/runner';
import type { Envelope, Messages, PreviewResponse, PreviewResult, Reply } from '../lib/messages';
import { createRunManager } from '../lib/runManager';
import { loadConfig, loadRun, saveConfig, saveRun } from '../lib/storage';

const FAKE = import.meta.env.WXT_FAKE_CLAUDE === 'true';
const client: ShareClient = FAKE ? createFakeShareClient() : createApiShareClient();
const configController = createConfigController(loadConfig, saveConfig);

/** Pause between invites (plus up to half again of random jitter), to stay clear of rate limits. */
const INVITE_DELAY_MS = 800;

/**
 * MV3 service workers are shut down after ~30s without extension API activity. Long backoffs
 * would let that happen mid-run, so sleep in short slices with a cheap API call between them.
 */
async function keepAliveSleep(ms: number, signal?: AbortSignal): Promise<void> {
  const slice = 20_000;
  let left = ms;

  // oxlint-disable-next-line eslint/no-unmodified-loop-condition -- `signal.aborted` flips from outside
  while (left > 0 && !signal?.aborted) {
    const step = Math.min(slice, left);
    await abortableSleep(step, signal);
    left -= step;
    if (left > 0) await chrome.runtime.getPlatformInfo();
  }
}

const runManager = createRunManager({
  client,
  load: loadRun,
  save: saveRun,
  delayMs: INVITE_DELAY_MS,
  jitterMs: INVITE_DELAY_MS / 2,
  sleep: keepAliveSleep,
});

async function preview(req: Messages['preview']['req']): Promise<PreviewResponse> {
  const me = await client.whoami();
  const results: PreviewResult[] = [];

  for (const artifact of req.artifacts) {
    try {
      const existing = await client.listSharees(artifact);
      results.push({
        artifact,
        plan: planArtifact({ artifact, desired: req.invites, existing, selfEmail: me.email }),
      });
    } catch (err) {
      results.push({ artifact, error: (err as Error).message });
    }
  }

  return { account: me, results };
}

async function handle(msg: Envelope): Promise<unknown> {
  switch (msg.type) {
    case 'config-get':
      return configController.get();
    case 'config-change':
      return configController.change(msg.change);
    case 'whoami':
      return client.whoami();
    case 'preview':
      return preview(msg);
    case 'sharees':
      return client.listSharees(msg.artifact);
    case 'change-access':
      await client.changeAccess(msg.artifact, msg.inviteId, msg.access);

      return null;
    case 'start':
      await runManager.start(msg.label, msg.plans, msg.accountEmail);

      return null;
    case 'stop':
      runManager.stop();

      return null;
    case 'resume':
      await runManager.resume();

      return null;
    case 'clear':
      await runManager.clear();

      return null;
  }
}

export default defineBackground(() => {
  chrome.runtime.onMessage.addListener((msg: Envelope, sender, sendResponse: (r: Reply<unknown>) => void) => {
    if (sender.id !== chrome.runtime.id) return false;
    handle(msg).then(
      (data) => sendResponse({ ok: true, data }),
      (err: Error) => sendResponse({ ok: false, error: err.message }),
    );

    return true;
  });
});
