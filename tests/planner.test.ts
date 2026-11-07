import { describe, expect, it } from 'vitest';
import { parseArtifactRef } from '../src/core/artifactUrl';
import { planArtifact } from '../src/core/planner';
import type { Sharee } from '../src/core/types';

const artifact = parseArtifactRef('https://claude.ai/artifact/SxyBbcL8qbzwA8FD63WrkK')!;

describe('planArtifact', () => {
  it('skips people who already have access or a pending invite', () => {
    const existing: Sharee[] = [
      { email: 'owner@studio.example', access: 'owner', status: 'active' },
      { email: 'alice@acme.com', access: 'view', status: 'active' },
      { email: 'bob@acme.com', access: 'comment', status: 'pending' },
    ];
    const plan = planArtifact({
      artifact,
      desired: ['alice@acme.com', 'bob@acme.com', 'carol@acme.com'],
      access: 'edit',
      existing,
      orgDomains: ['studio.example'],
    });
    expect(plan.toInvite).toEqual([{ email: 'carol@acme.com', access: 'edit', internal: false }]);
    expect(plan.alreadyShared).toEqual([
      { email: 'alice@acme.com', access: 'view', status: 'active' },
      { email: 'bob@acme.com', access: 'comment', status: 'pending' },
    ]);
  });

  it('enforces the outside-invitee cap, counting existing outside sharees', () => {
    const existing: Sharee[] = [
      { email: 'x1@ext.io', access: 'view', status: 'active' },
      { email: 'x2@ext.io', access: 'view', status: 'pending' },
      { email: 'team@studio.example', access: 'view', status: 'active' },
    ];
    const plan = planArtifact({
      artifact,
      desired: ['a@ext.io', 'mate@studio.example', 'b@ext.io', 'c@ext.io'],
      access: 'view',
      existing,
      orgDomains: ['studio.example'],
      externalLimit: 3,
    });
    expect(plan.toInvite.map((i) => i.email)).toEqual(['a@ext.io', 'mate@studio.example']);
    expect(plan.toInvite[1]?.internal).toBe(true);
    expect(plan.overLimit).toEqual(['b@ext.io', 'c@ext.io']);
    expect(plan.externalAfter).toBe(3);
  });

  it('trusts the internal flag from claude.ai over the domain list', () => {
    const plan = planArtifact({
      artifact,
      desired: ['new@ext.io'],
      access: 'view',
      existing: [{ email: 'guest@other.io', access: 'view', status: 'active', internal: true }],
      orgDomains: [],
      externalLimit: 1,
    });
    expect(plan.toInvite.map((i) => i.email)).toEqual(['new@ext.io']);
  });

  it('treats every address as outside when no org domains are known', () => {
    const plan = planArtifact({
      artifact,
      desired: ['a@studio.example'],
      access: 'view',
      existing: [],
      orgDomains: [],
      externalLimit: 0,
    });
    expect(plan.overLimit).toEqual(['a@studio.example']);
  });

  it('never invites the signed-in user', () => {
    const plan = planArtifact({
      artifact,
      desired: ['me@studio.example', 'a@x.io'],
      access: 'view',
      existing: [],
      orgDomains: [],
      selfEmail: 'Me@Studio.example',
    });
    expect(plan.self).toEqual(['me@studio.example']);
    expect(plan.toInvite.map((i) => i.email)).toEqual(['a@x.io']);
  });
});
