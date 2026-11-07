import type { Invitee } from './config';
import type { ArtifactRef, Sharee } from './types';

export interface ArtifactPlan {
  artifact: ArtifactRef;
  toInvite: Invitee[];
  /** Already has access or a pending invite. Their access level is never changed. */
  alreadyShared: { email: string; access: Sharee['access']; status: Sharee['status'] }[];
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
  const existingByEmail = new Map(existing.map((s) => [s.email.toLowerCase(), s]));
  const self = selfEmail?.toLowerCase();
  const plan: ArtifactPlan = { artifact, toInvite: [], alreadyShared: [], self: [] };

  for (const { email, access } of desired) {
    if (email === self) {
      plan.self.push(email);
      continue;
    }
    const current = existingByEmail.get(email);
    if (current) plan.alreadyShared.push({ email, access: current.access, status: current.status });
    else plan.toInvite.push({ email, access });
  }
  return plan;
}
