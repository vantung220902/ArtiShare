import { describe, expect, it } from 'vitest';
import { parseArtifactRef } from '../src/core/artifactUrl';
import { planArtifact } from '../src/core/planner';
import type { Sharee } from '../src/core/types';

const artifact = parseArtifactRef('https://claude.ai/artifact/SxyBbcL8qbzwA8FD63WrkK')!;

describe('planArtifact', () => {
  it('skips people who already have access or a pending invite', () => {
    const existing: Sharee[] = [
      { email: 'owner@nimblehq.co', access: 'owner', status: 'active' },
      { email: 'alice@acme.com', access: 'view', status: 'active' },
      { email: 'bob@acme.com', access: 'comment', status: 'pending' },
    ];
    const plan = planArtifact({
      artifact,
      desired: [
        { email: 'alice@acme.com', access: 'edit' },
        { email: 'bob@acme.com', access: 'edit' },
        { email: 'carol@acme.com', access: 'edit' },
      ],
      existing,
    });
    expect(plan.toInvite).toEqual([{ email: 'carol@acme.com', access: 'edit' }]);
    expect(plan.alreadyShared).toEqual([
      { email: 'alice@acme.com', access: 'view', status: 'active' },
      { email: 'bob@acme.com', access: 'comment', status: 'pending' },
    ]);
  });

  it('matches existing sharees ignoring case', () => {
    const plan = planArtifact({
      artifact,
      desired: [{ email: 'alice@acme.com', access: 'view' }],
      existing: [{ email: 'Alice@Acme.com', access: 'view', status: 'active' }],
    });
    expect(plan.toInvite).toEqual([]);
    expect(plan.alreadyShared.map((s) => s.email)).toEqual(['alice@acme.com']);
  });

  it("keeps each invitee's own access", () => {
    const desired = [
      { email: 'a@x.io', access: 'view' as const },
      { email: 'b@x.io', access: 'comment' as const },
      { email: 'c@x.io', access: 'edit' as const },
    ];
    expect(planArtifact({ artifact, desired, existing: [] }).toInvite).toEqual(desired);
  });

  it('never invites the signed-in user', () => {
    const plan = planArtifact({
      artifact,
      desired: [
        { email: 'me@nimblehq.co', access: 'view' },
        { email: 'a@x.io', access: 'view' },
      ],
      existing: [],
      selfEmail: 'Me@NimbleHQ.co',
    });
    expect(plan.self).toEqual(['me@nimblehq.co']);
    expect(plan.toInvite.map((i) => i.email)).toEqual(['a@x.io']);
  });
});
