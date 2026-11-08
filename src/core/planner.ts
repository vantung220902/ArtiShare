import type { Invitee } from './config';
import { inboxKey } from './emails';
import type { ArtifactRef, Sharee } from './types';

export interface ArtifactPlan {
  artifact: ArtifactRef;
  toInvite: Invitee[];
  /** Already has access or a pending invite. Their access level is never changed. */
  alreadyShared: {
    email: string;
    access: Sharee['access'];
    status: Sharee['status'];
    /** The address claude.ai has on file, when it is a Gmail alias of `email`. */
    as?: string;
  }[];
  /** Gmail aliases of an address already in `toInvite`. claude.ai keeps one invitation per inbox. */
  sameInbox: { email: string; as: string }[];
  /** The signed-in user's own address, if it was in the list. */
  self: string[];
}

export interface PlanInput {
  artifact: ArtifactRef;
  /** Normalized, valid, de-duplicated addresses, each with the access to invite them with. */
  desired: readonly Invitee[];
  existing: readonly Sharee[];
  selfEmail?: string;
}

/**
 * Splits the desired invitees into who to invite and who to leave alone. claude.ai enforces its own
 * per-artifact cap; when an invite hits it, the run skips the rest of that artifact.
 */
export function planArtifact({ artifact, desired, existing, selfEmail }: PlanInput): ArtifactPlan {
  const existingByInbox = new Map(existing.map((s) => [inboxKey(s.email), s]));
  const self = selfEmail ? inboxKey(selfEmail) : undefined;
  const planned = new Map<string, string>();
  const plan: ArtifactPlan = { artifact, toInvite: [], alreadyShared: [], self: [], sameInbox: [] };

  for (const { email, access } of desired) {
    const key = inboxKey(email);

    if (key === self) {
      plan.self.push(email);
      continue;
    }

    const current = existingByInbox.get(key);
    const onFile = current?.email.toLowerCase();

    if (current) {
      plan.alreadyShared.push({
        email,
        access: current.access,
        status: current.status,
        ...(onFile !== email.toLowerCase() && { as: onFile }),
      });
    } else if (planned.has(key)) {
      // Inviting both would leave only the last one invited.
      plan.sameInbox.push({ email, as: planned.get(key)! });
    } else {
      planned.set(key, email);
      plan.toInvite.push({ email, access });
    }
  }

  return plan;
}
