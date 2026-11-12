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
    changeAccess: async () => {},
    removeInvite: async () => {},
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
  accountEmail: 'owner@x.io',
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
    await expect(run.start('A', [plan], 'owner@x.io')).rejects.toThrow('storage full');
    expect(invite).not.toHaveBeenCalled();
    fail = false;
    await run.start('A', [plan], 'owner@x.io');
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
    await run.start('A', [plan], 'owner@x.io');
    await run.waitForIdle();
    expect(db.read()).toMatchObject({ status: 'stopped', items: [{ status: 'pending' }] });
    await run.resume();
    await run.waitForIdle();
    expect(invite).toHaveBeenCalledTimes(1);
    expect(db.read()).toMatchObject({ status: 'completed', items: [{ status: 'skipped' }] });
  });

  it('sends once for duplicate representations in a saved run', async () => {
    const db = store();
    const invite = vi.fn(async () => {});
    const run = manager(client({ invite }), db);
    const sameByUuid = parseArtifactRef(
      'https://claude.ai/code/artifact/0b3c7e2a-1f4d-4a8e-9c2b-5d6e7f8a9b0c',
    )!;
    const sameByBase58 = parseArtifactRef('https://claude.ai/artifact/2PUa7qFdoBcApzhmHVvA4K')!;
    const plans = [sameByUuid, sameByBase58].map((ref) =>
      planArtifact({ artifact: ref, desired: [invitee], existing: [] }),
    );
    await run.start('A', plans, 'owner@x.io');
    await run.waitForIdle();
    expect(invite).toHaveBeenCalledTimes(1);
    expect(db.read()?.items.map((item) => item.status)).toEqual(['invited', 'skipped']);
  });

  it('refuses to start when the signed-in account changed after Preview', async () => {
    const db = store();
    const invite = vi.fn(async () => {});
    const run = manager(client({ whoami: async () => ({ email: 'other@x.io' }), invite }), db);
    await expect(run.start('A', [plan], 'owner@x.io')).rejects.toThrow(/previewed as owner@x.io/);
    expect(invite).not.toHaveBeenCalled();
    expect(db.read()).toBeNull();
  });

  it('refuses to resume a run under another account', async () => {
    const db = store(stoppedRun());
    const invite = vi.fn(async () => {});
    const run = manager(client({ whoami: async () => ({ email: 'other@x.io' }), invite }), db);
    await expect(run.resume()).rejects.toThrow(/previewed as owner@x.io/);
    expect(invite).not.toHaveBeenCalled();
    expect(db.read()?.status).toBe('stopped');
  });

  it('does not resume an older run with no recorded account', async () => {
    const old = stoppedRun();
    delete old.accountEmail;
    const db = store(old);
    const invite = vi.fn(async () => {});
    const run = manager(client({ invite }), db);
    await expect(run.resume()).rejects.toThrow(/predates account verification/);
    expect(invite).not.toHaveBeenCalled();
    expect(db.read()?.status).toBe('stopped');
  });

  it('stops before the next POST if the signed-in account changes during a run', async () => {
    const db = store();
    let email = 'owner@x.io';
    const invite = vi.fn(async () => {
      email = 'other@x.io';
    });
    const run = manager(client({ whoami: async () => ({ email }), invite }), db);
    const two = planArtifact({
      artifact,
      desired: [invitee, { email: 'b@x.io', access: 'view' }],
      existing: [],
    });
    await run.start('A', [two], 'owner@x.io');
    await run.waitForIdle();
    expect(invite).toHaveBeenCalledTimes(1);
    expect(db.read()).toMatchObject({
      status: 'stopped',
      items: [{ status: 'invited' }, { status: 'pending' }],
    });
  });
});
