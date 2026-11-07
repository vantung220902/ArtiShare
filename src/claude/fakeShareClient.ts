import { ShareError } from '../core/runner';
import type { AccessLevel, ArtifactRef, Sharee } from '../core/types';
import type { Account, ShareClient } from './shareClient';

/**
 * In-memory stand-in for claude.ai, used by `npm run dev:fake` / `npm run build:fake`
 * (WXT_FAKE_CLAUDE=true from .env.fake).
 * Lets you click through the whole flow without sending real invitations.
 *  - an artifact id containing "Forbidden" rejects every invite (not the owner)
 *  - an address starting with "fail" is rejected
 *  - an address starting with "slow" is rate-limited once, then succeeds
 */
export function createFakeShareClient(): ShareClient {
  const shares = new Map<string, Sharee[]>();
  const slowSeen = new Set<string>();
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

  const list = (a: ArtifactRef) => {
    if (!shares.has(a.id))
      shares.set(a.id, [{ email: 'owner@example.com', access: 'owner', status: 'active' }]);

    return shares.get(a.id)!;
  };

  return {
    async whoami(): Promise<Account> {
      return { email: 'owner@example.com', orgName: 'Fake org' };
    },
    async listSharees(artifact) {
      await wait(150);

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

      list(artifact).push({ email, access, status: 'pending' });
    },
  };
}
