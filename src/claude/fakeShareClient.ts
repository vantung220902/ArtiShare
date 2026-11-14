import { inboxKey } from '../core/emails';
import { ShareError } from '../core/runner';
import type { AccessLevel, ArtifactRef, Sharee } from '../core/types';
import type { Account, ShareClient } from './shareClient';

/**
 * In-memory stand-in for claude.ai, used by `npm run dev:fake` / `npm run build:fake`
 * (WXT_FAKE_CLAUDE=true from .env.fake).
 * Lets you click through the whole flow without sending real invitations.
 *  - an artifact id containing "Forbidden" rejects every invite, change and removal (not the owner)
 *  - an artifact id containing "Shared" starts with three people invited: an accepted Can view
 *    (viewer@example.com), a pending Commenter (commenter@example.com) and locked@example.com,
 *    who joined the organization, so their permission can't be changed or removed
 *  - an artifact id containing "Crowded" starts with 45 people invited, to try a long list:
 *    crowd01@example.com … crowd45@example.com, the odd numbers Pending with Can view, the even
 *    numbers Accepted with Can comment (it wins over "Shared" if an id has both words)
 *  - an artifact id containing "Missing" can't be found: listing its people fails
 *  - an address starting with "fail" is rejected
 *  - an address starting with "slow" is rate-limited once, then succeeds
 *  - an address starting with "locked" can't be changed or removed (the person joined the org)
 */
export const FAKE_SHARED_PEOPLE: readonly Omit<Sharee, 'id'>[] = [
  { email: 'viewer@example.com', access: 'view', status: 'active' },
  { email: 'commenter@example.com', access: 'comment', status: 'pending' },
  { email: 'locked@example.com', access: 'view', status: 'active' },
];

export const FAKE_CROWDED_PEOPLE: readonly Omit<Sharee, 'id'>[] = Array.from(
  { length: 45 },
  (_, i): Omit<Sharee, 'id'> => {
    const n = i + 1;

    return {
      email: `crowd${String(n).padStart(2, '0')}@example.com`,
      access: n % 2 === 1 ? 'view' : 'comment',
      status: n % 2 === 1 ? 'pending' : 'active',
    };
  },
);

/** The people a fake artifact starts with besides its owner, by what its id says. */
const seedPeople = (id: string) =>
  id.includes('Crowded') ? FAKE_CROWDED_PEOPLE : id.includes('Shared') ? FAKE_SHARED_PEOPLE : [];

export function createFakeShareClient(): ShareClient {
  const shares = new Map<string, Sharee[]>();
  const slowSeen = new Set<string>();
  let nextId = 1;
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const newInvite = (p: Omit<Sharee, 'id'>): Sharee => ({ id: `inv-${nextId++}`, ...p });

  const list = (a: ArtifactRef) => {
    if (!shares.has(a.id)) {
      shares.set(a.id, [
        { email: 'owner@example.com', access: 'owner', status: 'active' },
        ...seedPeople(a.id).map(newInvite),
      ]);
    }

    return shares.get(a.id)!;
  };

  /** The invitation a change or removal is about, or why claude.ai would refuse it. */
  const editable = (artifact: ArtifactRef, inviteId: string) => {
    if (artifact.id.includes('Forbidden'))
      throw new ShareError('Only the owner can change access', 'forbidden');
    const people = list(artifact);
    const index = people.findIndex((p) => p.id === inviteId);
    if (index === -1) throw new ShareError('The invitation no longer exists', 'not-found');

    if (people[index]!.email.startsWith('locked')) {
      throw new ShareError(
        'This person joined your organization, so their access is managed in claude.ai.',
        'managed-elsewhere',
      );
    }

    return { people, index };
  };

  return {
    async whoami(): Promise<Account> {
      return { email: 'owner@example.com', orgName: 'Fake org' };
    },
    async listSharees(artifact) {
      await wait(150);
      if (artifact.id.includes('Missing')) throw new ShareError('Artifact not found', 'not-found');

      return structuredClone(list(artifact));
    },
    async invite(artifact, email, access: AccessLevel) {
      await wait(300);
      if (artifact.id.includes('Forbidden'))
        throw new ShareError('You can only share artifacts you own', 'forbidden');
      if (email.startsWith('fail')) throw new ShareError('This address was rejected', 'invalid');

      if (email.startsWith('slow') && !slowSeen.has(email)) {
        slowSeen.add(email);
        throw new ShareError('Too many requests', 'rate-limited', 1_000);
      }

      // Like claude.ai, one invitation per person: a Gmail alias replaces the earlier invitation.
      const people = list(artifact);
      const same = people.findIndex((p) => inboxKey(p.email) === inboxKey(email));
      if (same !== -1) people.splice(same, 1);
      people.push(newInvite({ email, access, status: 'pending' }));
    },
    async changeAccess(artifact, inviteId, access) {
      await wait(300);
      const { people, index } = editable(artifact, inviteId);
      people[index]!.access = access;
    },
    async removeInvite(artifact, inviteId) {
      await wait(300);
      const { people, index } = editable(artifact, inviteId);
      people.splice(index, 1);
    },
  };
}
