import type { ShareClient } from '../claude/shareClient';
import { artifactUuid } from '../core/artifactUrl';
import { type RunItem, runInvites, ShareError, summarize, type RunOptions } from '../core/runner';
import { inboxKey } from '../core/emails';
import type { ArtifactPlan } from '../core/planner';
import type { RunState } from './storage';

interface Dependencies {
  client: ShareClient;
  load: () => Promise<RunState | null>;
  save: (run: RunState | null) => Promise<void>;
  delayMs: number;
  jitterMs: number;
  sleep?: RunOptions['sleep'];
}

/** Owns the one active run and persists it before acknowledging Start or Resume. */
export function createRunManager({ client, load, save, delayMs, jitterMs, sleep }: Dependencies) {
  let state: 'idle' | 'starting' | 'running' | 'clearing' = 'idle';
  let controller: AbortController | null = null;
  let task: Promise<void> | null = null;

  const ready = (async () => {
    const run = await load();

    if (run?.status === 'running') {
      run.status = 'stopped';
      run.reason = 'Interrupted because the browser or extension restarted. Resume to continue.';
      await save(run);
    }
  })();

  function reserve(): AbortController {
    if (state !== 'idle') throw new Error('A run is already in progress.');
    state = 'starting';
    controller = new AbortController();

    return controller;
  }

  function release(candidate: AbortController) {
    if (controller === candidate) {
      controller = null;
      state = 'idle';
    }
  }

  async function assertAccount(expected: string): Promise<void> {
    const actual = (await client.whoami()).email.trim().toLowerCase();
    if (actual !== expected) {
      throw new ShareError(
        `Signed in as ${actual}, but this share was previewed as ${expected}.`,
        'account-changed',
      );
    }
  }

  async function reconcile(run: RunState): Promise<void> {
    const groups = new Map<string, RunItem[]>();
    const seen = new Set<string>();
    let changed = false;

    for (const item of run.items) {
      const artifactKey = artifactUuid(item.artifact) ?? item.artifact.url;
      const key = `${artifactKey}:${inboxKey(item.email)}`;
      if (seen.has(key)) {
        if (item.status === 'pending') {
          item.status = 'skipped';
          item.error = 'Duplicate artifact and address in this run; no invitation repeated.';
          item.finishedAt = Date.now();
          changed = true;
        }
        continue;
      }
      seen.add(key);
      if (item.status !== 'pending') continue;
      const group = groups.get(artifactKey) ?? [];
      group.push(item);
      groups.set(artifactKey, group);
    }

    for (const group of groups.values()) {
      const artifact = group[0]!.artifact;
      const existing = await client.listSharees(artifact);
      const shared = new Set(existing.map((person) => inboxKey(person.email)));

      for (const item of group) {
        if (shared.has(inboxKey(item.email))) {
          item.status = 'skipped';
          item.error = 'Already has access or a pending invitation; no invitation repeated.';
        } else {
          continue;
        }

        item.finishedAt = Date.now();
        changed = true;
      }
    }

    if (changed) await save(run);
  }

  async function execute(run: RunState, current: AbortController): Promise<void> {
    try {
      const expected = run.accountEmail;
      if (!expected) throw new Error('This run has no verified account. Start a new share.');
      await assertAccount(expected);
      await reconcile(run);
      const summary = await runInvites(
        run.items,
        {
          invite: async (artifact, email, access) => {
            await assertAccount(expected);
            await client.invite(artifact, email, access);
          },
        },
        {
          delayMs,
          jitterMs,
          signal: current.signal,
          sleep,
          onUpdate: () => save(run),
        },
      );
      run.status = summary.status;
      run.reason = summary.reason;
    } catch (err) {
      run.status = 'stopped';
      run.reason = `Could not continue safely: ${err instanceof Error ? err.message : String(err)}`;
    } finally {
      try {
        await save(run);
      } catch (err) {
        console.error('Could not save invitation progress', err);
      }

      release(current);
    }
  }

  async function begin(run: RunState, current: AbortController): Promise<void> {
    run.status = 'running';
    run.reason = undefined;
    await save(run);
    state = 'running';
    task = execute(run, current);
  }

  return {
    async start(label: string, plans: readonly ArtifactPlan[], accountEmail: string): Promise<void> {
      await ready;
      const current = reserve();

      try {
        if (await load()) throw new Error('Discard the current run before starting a new one.');
        const expected = accountEmail.trim().toLowerCase();
        if (!expected) throw new Error('Preview again to verify your signed-in account.');
        await assertAccount(expected);
        const items: RunItem[] = plans.flatMap((plan) =>
          plan.toInvite.map((invite) => ({
            artifact: plan.artifact,
            email: invite.email,
            access: invite.access,
            status: 'pending' as const,
            attempts: 0,
          })),
        );
        if (!items.length) throw new Error('Nobody to invite.');
        await begin(
          {
            id: crypto.randomUUID(),
            label,
            createdAt: Date.now(),
            accountEmail: expected,
            status: 'running',
            items,
          },
          current,
        );
      } catch (err) {
        release(current);
        throw err;
      }
    },
    async resume(): Promise<void> {
      await ready;
      const current = reserve();

      try {
        const run = await load();

        if (!run || run.status !== 'stopped' || summarize(run.items).pending === 0) {
          throw new Error('There is nothing left to resume.');
        }

        if (!run.accountEmail) {
          throw new Error('This run predates account verification. Start a new share to continue safely.');
        }
        await assertAccount(run.accountEmail);

        await begin(run, current);
      } catch (err) {
        release(current);
        throw err;
      }
    },
    stop() {
      controller?.abort();
    },
    async clear(): Promise<void> {
      await ready;
      if (state !== 'idle') throw new Error('Stop the run before clearing it.');
      state = 'clearing';

      try {
        await save(null);
      } finally {
        state = 'idle';
      }
    },
    /** Also lets tests wait for a fire-and-forget run to finish. */
    async waitForIdle(): Promise<void> {
      await task;
    },
  };
}
