import type { ShareClient } from '../claude/shareClient';
import { type RunItem, runInvites, summarize, type RunOptions } from '../core/runner';
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

  async function reconcile(run: RunState): Promise<void> {
    const groups = new Map<string, RunItem[]>();

    for (const item of run.items) {
      if (item.status !== 'pending') continue;
      const group = groups.get(item.artifact.url) ?? [];
      group.push(item);
      groups.set(item.artifact.url, group);
    }

    let changed = false;

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
      await reconcile(run);
      const summary = await runInvites(run.items, client, {
        delayMs,
        jitterMs,
        signal: current.signal,
        sleep,
        onUpdate: () => save(run),
      });
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
    async start(label: string, plans: readonly ArtifactPlan[]): Promise<void> {
      await ready;
      const current = reserve();

      try {
        if (await load()) throw new Error('Discard the current run before starting a new one.');
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
          { id: crypto.randomUUID(), label, createdAt: Date.now(), status: 'running', items },
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
