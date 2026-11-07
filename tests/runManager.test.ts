import { describe, expect, it, vi } from 'vitest';
import type { ShareClient } from '../src/claude/shareClient';
import { parseArtifactRef } from '../src/core/artifactUrl';
import { planArtifact } from '../src/core/planner';
import { ShareError } from '../src/core/runner';
import type { Sharee } from '../src/core/types';
import { createRunManager } from '../src/lib/runManager';
import type { RunState } from '../src/lib/storage';

const artifact = parseArtifactRef('https://claude.ai/artifact/SxyBbcL8qbzwA8FD63WrkK')!;
const invitee = { email: 'a@x.io', access: 'view' as const };
const plan = planArtifact({ artifact, desired: [invitee], existing: [] });

function store(initial: RunState | null = null) {
  let value = initial ? structuredClone(initial) : null;

  return {
    load: async () => (value ? structuredClone(value) : null),
    save: async (run: RunState | null) => {
      value = run ? structuredClone(run) : null;
    },
    read: () => value,
  };
}

function client(overrides: Partial<ShareClient> = {}): ShareClient {
  return {
    whoami: async () => ({ email: 'owner@x.io' }),
    listSharees: async () => [],
    invite: async () => {},
    ...overrides,
  };
}

function manager(api: ShareClient, db: ReturnType<typeof store>) {
  return createRunManager({ client: api, load: db.load, save: db.save, delayMs: 0, jitterMs: 0 });
}

const stoppedRun = (): RunState => ({
  id: 'run-1',
  label: 'A',
  createdAt: 1,
  status: 'stopped',
  items: [{ artifact, ...invitee, status: 'pending', attempts: 0 }],
});

describe('run manager', () => {
  it('allows only one concurrent Resume request', async () => {
    const db = store(stoppedRun());
    const invite = vi.fn(async () => {});
    const run = manager(client({ invite }), db);
    const results = await Promise.allSettled([run.resume(), run.resume()]);
    await run.waitForIdle();
    expect(results.map((result) => result.status).toSorted()).toEqual(['fulfilled', 'rejected']);
    expect(invite).toHaveBeenCalledTimes(1);
    expect(db.read()?.status).toBe('completed');
  });

  it('reports an initial storage failure and releases the run reservation', async () => {
    const db = store();
    const originalSave = db.save;
    let fail = true;

    db.save = async (run) => {
      if (fail) throw new Error('storage full');
      await originalSave(run);
    };

    const invite = vi.fn(async () => {});
    const run = manager(client({ invite }), db);
    await expect(run.start('A', [plan])).rejects.toThrow('storage full');
    expect(invite).not.toHaveBeenCalled();
    fail = false;
    await run.start('A', [plan]);
    await run.waitForIdle();
    expect(invite).toHaveBeenCalledTimes(1);
  });

  it('reconciles an uncertain POST before Resume instead of sending it twice', async () => {
    const db = store();
    const shared: Sharee[] = [];
    const invite = vi.fn(async () => {
      shared.push({ email: invitee.email, access: 'view', status: 'pending' });
      throw new ShareError('response lost', 'network');
    });
    const run = manager(client({ invite, listSharees: async () => shared }), db);
    await run.start('A', [plan]);
    await run.waitForIdle();
    expect(db.read()).toMatchObject({ status: 'stopped', items: [{ status: 'pending' }] });
    await run.resume();
    await run.waitForIdle();
    expect(invite).toHaveBeenCalledTimes(1);
    expect(db.read()).toMatchObject({ status: 'completed', items: [{ status: 'skipped' }] });
  });
});
