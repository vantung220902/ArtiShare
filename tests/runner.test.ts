import { describe, expect, it, vi } from 'vitest';
import { parseArtifactRef } from '../src/core/artifactUrl';
import { abortableSleep, type InviteClient, type RunItem, runInvites, ShareError } from '../src/core/runner';

const A = parseArtifactRef('https://claude.ai/artifact/SxyBbcL8qbzwA8FD63WrkK')!;
const B = parseArtifactRef('https://claude.ai/artifact/8yG35MD9DnNsBsgu5yATZC')!;

function items(spec: [typeof A, string][]): RunItem[] {
  return spec.map(([artifact, email]) => ({ artifact, email, access: 'view', status: 'pending', attempts: 0 }));
}

function fakeClient(behavior: (email: string, call: number) => void): InviteClient & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    async invite(_artifact, email) {
      calls.push(email);
      behavior(email, calls.filter((c) => c === email).length);
    },
  };
}

const noSleep = vi.fn(async (_ms: number) => {});

describe('runInvites', () => {
  it('invites every pending item, pausing between requests', async () => {
    const sleep = vi.fn(async (_ms: number) => {});
    const list = items([[A, 'a@x.io'], [A, 'b@x.io'], [B, 'a@x.io']]);
    const client = fakeClient(() => {});
    const summary = await runInvites(list, client, { delayMs: 800, jitterMs: 200, sleep, random: () => 0.5 });
    expect(summary).toEqual({ status: 'completed', reason: undefined, invited: 3, failed: 0, skipped: 0, pending: 0 });
    expect(sleep.mock.calls.map((c) => c[0])).toEqual([900, 900]);
    expect(list.every((i) => i.status === 'invited' && i.finishedAt)).toBe(true);
  });

  it('only processes pending items, so a stopped run can resume', async () => {
    const list = items([[A, 'a@x.io'], [A, 'b@x.io']]);
    list[0]!.status = 'invited';
    const client = fakeClient(() => {});
    await runInvites(list, client, { delayMs: 0, sleep: noSleep });
    expect(client.calls).toEqual(['b@x.io']);
  });

  it('retries rate limits with backoff, honoring retry-after', async () => {
    const sleep = vi.fn(async (_ms: number) => {});
    const client = fakeClient((_e, call) => {
      if (call === 1) throw new ShareError('slow down', 'rate-limited', 5_000);
      if (call === 2) throw new ShareError('oops', 'server');
    });
    const list = items([[A, 'a@x.io']]);
    const summary = await runInvites(list, client, { delayMs: 0, baseBackoffMs: 1_000, sleep });
    expect(summary.invited).toBe(1);
    expect(list[0]!.attempts).toBe(3);
    expect(sleep.mock.calls.map((c) => c[0])).toEqual([5_000, 2_000]);
  });

  it('gives up after maxRetries and records the error', async () => {
    const client = fakeClient(() => {
      throw new ShareError('network down', 'network');
    });
    const list = items([[A, 'a@x.io']]);
    const summary = await runInvites(list, client, { delayMs: 0, maxRetries: 2, sleep: noSleep });
    expect(summary.failed).toBe(1);
    expect(list[0]).toMatchObject({ status: 'failed', errorCode: 'network', attempts: 3 });
  });

  it('does not retry a rejected address and carries on', async () => {
    const client = fakeClient((e) => {
      if (e === 'bad@x.io') throw new ShareError('rejected', 'invalid');
    });
    const list = items([[A, 'bad@x.io'], [A, 'ok@x.io']]);
    const summary = await runInvites(list, client, { delayMs: 0, sleep: noSleep });
    expect(client.calls).toEqual(['bad@x.io', 'ok@x.io']);
    expect(summary).toMatchObject({ invited: 1, failed: 1, status: 'completed' });
  });

  it('skips the rest of an artifact after an artifact-level error, then continues with others', async () => {
    const client = fakeClient((e) => {
      if (e === 'a@x.io') throw new ShareError('You do not own this artifact', 'forbidden');
    });
    const list = items([[A, 'a@x.io'], [A, 'b@x.io'], [B, 'c@x.io']]);
    const summary = await runInvites(list, client, { delayMs: 0, sleep: noSleep });
    expect(client.calls).toEqual(['a@x.io', 'c@x.io']);
    expect(list[1]).toMatchObject({ status: 'skipped', errorCode: 'forbidden' });
    expect(summary).toMatchObject({ invited: 1, failed: 1, skipped: 1, status: 'completed' });
  });

  it('stops the run when signed out', async () => {
    const client = fakeClient(() => {
      throw new ShareError('401', 'auth');
    });
    const list = items([[A, 'a@x.io'], [A, 'b@x.io']]);
    const summary = await runInvites(list, client, { delayMs: 0, sleep: noSleep });
    expect(client.calls).toEqual(['a@x.io']);
    expect(summary.status).toBe('stopped');
    expect(summary.reason).toMatch(/signed out/);
    // The address wasn't at fault, so Resume sends it again.
    expect(list[0]).toMatchObject({ status: 'pending' });
    expect(summary.pending).toBe(2);
  });

  it('stops at the daily invitation limit and keeps the item for Resume', async () => {
    const client = fakeClient((email) => {
      if (email === 'b@x.io') throw new ShareError('daily cap', 'daily-limit');
    });
    const list = items([[A, 'a@x.io'], [A, 'b@x.io'], [B, 'c@x.io']]);
    const summary = await runInvites(list, client, { delayMs: 0, sleep: noSleep });
    expect(client.calls).toEqual(['a@x.io', 'b@x.io']);
    expect(summary).toMatchObject({ status: 'stopped', invited: 1, failed: 0, pending: 2 });
    expect(summary.reason).toMatch(/daily invitation limit/);
  });

  it('stops after too many failures in a row', async () => {
    const client = fakeClient(() => {
      throw new ShareError('weird', 'unknown');
    });
    const list = items([[A, '1@x.io'], [A, '2@x.io'], [A, '3@x.io'], [A, '4@x.io']]);
    const summary = await runInvites(list, client, { delayMs: 0, maxConsecutiveFailures: 3, sleep: noSleep });
    expect(client.calls).toHaveLength(3);
    expect(summary).toMatchObject({ status: 'stopped', failed: 3, pending: 1 });
  });

  it('stops before the next item when aborted', async () => {
    const controller = new AbortController();
    const client = fakeClient((e) => {
      if (e === 'a@x.io') controller.abort();
    });
    const list = items([[A, 'a@x.io'], [A, 'b@x.io']]);
    const summary = await runInvites(list, client, { delayMs: 0, sleep: noSleep, signal: controller.signal });
    expect(client.calls).toEqual(['a@x.io']);
    expect(summary).toMatchObject({ status: 'stopped', reason: 'Stopped by you.', invited: 1, pending: 1 });
  });

  it('does not send the next invite when stopped during the pause', async () => {
    const controller = new AbortController();
    const sleep = vi.fn(async (_ms: number) => controller.abort());
    const client = fakeClient(() => {});
    const list = items([[A, 'a@x.io'], [A, 'b@x.io']]);
    const summary = await runInvites(list, client, { delayMs: 800, sleep, signal: controller.signal });
    expect(client.calls).toEqual(['a@x.io']);
    expect(summary).toMatchObject({ status: 'stopped', reason: 'Stopped by you.', invited: 1, pending: 1 });
  });

  it('leaves an item pending, not failed, when stopped while waiting to retry', async () => {
    const controller = new AbortController();
    const sleep = vi.fn(async (_ms: number) => controller.abort());
    const client = fakeClient(() => {
      throw new ShareError('slow down', 'rate-limited');
    });
    const list = items([[A, 'a@x.io'], [A, 'b@x.io']]);
    const summary = await runInvites(list, client, { delayMs: 0, sleep, signal: controller.signal });
    expect(client.calls).toEqual(['a@x.io']);
    expect(list[0]).toMatchObject({ status: 'pending', attempts: 1 });
    expect(summary).toMatchObject({ status: 'stopped', reason: 'Stopped by you.', pending: 2 });
  });

  it('abortableSleep returns as soon as the signal aborts', async () => {
    const controller = new AbortController();
    const started = Date.now();
    setTimeout(() => controller.abort(), 10);
    await abortableSleep(60_000, controller.signal);
    expect(Date.now() - started).toBeLessThan(1_000);
  });

  it('reports every change through onUpdate', async () => {
    const onUpdate = vi.fn();
    const list = items([[A, 'a@x.io'], [B, 'b@x.io']]);
    await runInvites(list, fakeClient(() => {}), { delayMs: 0, sleep: noSleep, onUpdate });
    expect(onUpdate.mock.calls.map((c) => c[1])).toEqual([0, 1]);
  });
});
