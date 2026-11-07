import { domainOf } from './emails';
import { type AccessLevel, type ArtifactRef, EXTERNAL_INVITE_LIMIT, type Sharee } from './types';

export interface PlannedInvite {
  email: string;
  access: AccessLevel;
  internal: boolean;
}

export interface ArtifactPlan {
  artifact: ArtifactRef;
  toInvite: PlannedInvite[];
  /** Already has access or a pending invite. v1 never changes their access level. */
  alreadyShared: { email: string; access: Sharee['access']; status: Sharee['status'] }[];
  /** Outside addresses that would exceed the per-artifact cap. */
  overLimit: string[];
  /** The signed-in user's own address, if it was in the list. */
  self: string[];
  /** Outside people counted toward the cap after this plan runs. */
  externalAfter: number;
  externalLimit: number;
}

export interface PlanInput {
  artifact: ArtifactRef;
  /** Normalized, valid, de-duplicated addresses. */
  desired: readonly string[];
  access: AccessLevel;
  existing: readonly Sharee[];
  /** Domains of the owner's claude.ai organization; addresses there don't count toward the cap. */
  orgDomains: readonly string[];
  selfEmail?: string;
  externalLimit?: number;
}

export function planArtifact(input: PlanInput): ArtifactPlan {
  const { artifact, desired, access, existing, selfEmail } = input;
  const limit = input.externalLimit ?? EXTERNAL_INVITE_LIMIT;
  const orgDomains = new Set(input.orgDomains.map((d) => d.toLowerCase()));
  const isInternal = (email: string, sharee?: Sharee) => sharee?.internal ?? orgDomains.has(domainOf(email));

  const existingByEmail = new Map(existing.map((s) => [s.email.toLowerCase(), s]));
  let externalUsed = existing.filter((s) => s.access !== 'owner' && !isInternal(s.email, s)).length;

  const plan: ArtifactPlan = {
    artifact,
    toInvite: [],
    alreadyShared: [],
    overLimit: [],
    self: [],
    externalAfter: 0,
    externalLimit: limit,
  };

  for (const email of desired) {
    if (selfEmail && email === selfEmail.toLowerCase()) {
      plan.self.push(email);
      continue;
    }
    const current = existingByEmail.get(email);
    if (current) {
      plan.alreadyShared.push({ email, access: current.access, status: current.status });
      continue;
    }
    const internal = isInternal(email);
    if (!internal) {
      if (externalUsed >= limit) {
        plan.overLimit.push(email);
        continue;
      }
      externalUsed++;
    }
    plan.toInvite.push({ email, access, internal });
  }

  plan.externalAfter = externalUsed;
  return plan;
}
