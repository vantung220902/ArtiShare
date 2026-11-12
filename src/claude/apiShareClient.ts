import { artifactUuid } from '../core/artifactUrl';
import { ShareError, type ShareErrorCode } from '../core/runner';
import type { AccessLevel, ArtifactRef, Sharee } from '../core/types';
import {
  errorFromResponse,
  pageCookie,
  pageFetch,
  parseJson,
  type PageRequest,
  type PageResponse,
} from './pageFetch';
import type { Account, ShareClient } from './shareClient';

/**
 * Talks to the same endpoints as claude.ai's artifact Share menu. See docs/claude-share-api.md
 * for how they were found and what each returns.
 */

/** The Share menu sends this on every /api/frame request; without it the API answers 404. */
const FRAME_HEADERS = { 'X-Frame-CP': 'go' };

const ROLE_FOR: Record<AccessLevel, string> = { view: 'reader', comment: 'commenter', edit: 'editor' };
const ACCESS_FOR: Record<string, AccessLevel> = { reader: 'view', commenter: 'comment', editor: 'edit' };

/** `reason` values claude.ai returns when it refuses an invite, mapped to how the run should react. */
const REASONS: Record<string, [ShareErrorCode, string]> = {
  invite_cap_reached: ['limit', 'This artifact already has the maximum number of invitations.'],
  people_list_full: ['limit', "This artifact's list of people is full."],
  invite_daily_cap: ['daily-limit', 'Daily invitation limit reached. Try again tomorrow.'],
  external_invites_disabled: [
    'external-disabled',
    'Inviting people outside your organization is turned off for your account or organization.',
  ],
  editor_invites_disabled: [
    'access-unavailable',
    '"Can edit" invitations are turned off. Pick another access level.',
  ],
  plan: ['unshareable', "Your claude.ai plan doesn't allow inviting people to artifacts."],
  plan_required: ['unshareable', "Your claude.ai plan doesn't allow inviting people to artifacts."],
  writer_only: ['forbidden', 'Only the owner can invite people to this artifact.'],
  editor_manage: ['forbidden', 'Only the owner can invite people to this artifact.'],
  address_outside_company: ['invalid', 'This address is outside your organization.'],
  member_refused: ['invalid', "This person can't be given access."],
  member_commenter_unavailable: ['invalid', "This person can't be given Commenter access."],
  member_editor_unavailable: ['invalid', "This person can't be given edit access."],
  // claude.ai is still checking a new version of the artifact; worth retrying.
  upload_window_open: ['not-ready', 'claude.ai is still checking this artifact. Try again in a few minutes.'],
  missing_row: ['not-ready', 'claude.ai is still checking this artifact. Try again in a moment.'],
  missing_row_stale: ['not-ready', 'claude.ai is still checking this artifact. Try again in a moment.'],
  incomplete: ['not-ready', 'claude.ai is still checking this artifact. Try again in a moment.'],
  generation_mismatch: ['not-ready', 'claude.ai is still checking this artifact. Try again in a moment.'],
  perm_changed: ['not-ready', "This artifact's sharing settings just changed. Try again."],
};

interface AccountResponse {
  email_address?: string;
  memberships?: { organization?: { uuid?: string; name?: string } }[];
}

interface InviteRecord {
  id?: unknown;
  email?: unknown;
  status?: unknown;
  role?: unknown;
  effectiveRole?: unknown;
}

interface Org {
  uuid: string;
  name?: string;
}

export interface Transport {
  fetch(req: PageRequest): Promise<PageResponse>;
  cookie(name: string): Promise<string | null>;
}

const pageTransport: Transport = { fetch: pageFetch, cookie: pageCookie };

const ok = (res: PageResponse) => res.status >= 200 && res.status < 300;

function framePath(kind: 'invites' | 'invite', uuid: string, org: string, inviteId?: string): string {
  const id = inviteId === undefined ? '' : `/${encodeURIComponent(inviteId)}`;

  return `/api/frame/${kind}/${encodeURIComponent(uuid)}${id}?org=${encodeURIComponent(org)}`;
}

/** Turns a refused permission change or removal into a ShareError. */
export function manageError(res: PageResponse): ShareError {
  if (res.cfMitigated !== 'challenge') {
    let reason: unknown;

    try {
      reason = (JSON.parse(res.body) as { reason?: unknown } | null)?.reason;
    } catch {
      reason = undefined;
    }

    if (res.status === 409 && reason === 'invitee_joined_org') {
      return new ShareError(
        'This person joined your organization, so their access is managed in claude.ai.',
        'managed-elsewhere',
      );
    }

    if (res.status === 403) return new ShareError('Only the owner can change access', 'forbidden');
    if (res.status === 404) return new ShareError('The invitation no longer exists', 'not-found');
  }

  return errorFromResponse(res, "Couldn't change access");
}

/** Turns a refused invite into a ShareError the runner knows how to handle. */
export function inviteError(res: PageResponse): ShareError {
  let body: { reason?: unknown; plan_required?: unknown } | null;

  try {
    body = JSON.parse(res.body) as { reason?: unknown; plan_required?: unknown } | null;
  } catch {
    body = null;
  }

  const reason =
    body?.plan_required === true
      ? 'plan_required'
      : typeof body?.reason === 'string'
        ? body.reason
        : undefined;

  if (reason) {
    const known = REASONS[reason];
    if (known) return new ShareError(known[1], known[0]);
    // An unknown reason on a 403 is a rule about the artifact or the account, not this address.
    if (res.status === 403)
      return new ShareError(`claude.ai won't share this artifact by email (${reason}).`, 'unshareable');

    return new ShareError(`claude.ai refused the invitation (${reason}).`, 'unknown');
  }

  if (res.status === 400)
    return new ShareError("claude.ai says that isn't a valid email address.", 'invalid');
  if (res.status === 409) return new ShareError("That address can't be invited.", 'invalid');

  return errorFromResponse(res, 'Invite failed');
}

export function createApiShareClient(transport: Transport = pageTransport): ShareClient {
  let orgsPromise: Promise<Org[]> | undefined;
  let accountEmail: string | undefined;
  /** Which of the user's organizations each artifact (by UUID) belongs to. */
  const orgOf = new Map<string, string>();

  async function loadAccount(): Promise<{ email: string; orgs: Org[] }> {
    const res = await transport.fetch({ method: 'GET', path: '/api/account' });

    if (res.status === 401 || res.status === 403) {
      throw new ShareError('You are signed out of claude.ai. Sign in, then try again.', 'auth');
    }

    if (!ok(res)) throw errorFromResponse(res, "Couldn't read your claude.ai account");
    const account = parseJson<AccountResponse>(res, 'Reading your account');
    if (!account.email_address)
      throw new ShareError('You are signed out of claude.ai. Sign in, then try again.', 'auth');

    const all: Org[] = (account.memberships ?? []).flatMap((m) =>
      m.organization?.uuid ? [{ uuid: m.organization.uuid, name: m.organization.name }] : [],
    );
    // The org selected in claude.ai first; artifacts usually live there.
    const active = await transport.cookie('lastActiveOrg');
    all.sort((a, b) => Number(b.uuid === active) - Number(a.uuid === active));
    if (active && !all.some((o) => o.uuid === active)) all.unshift({ uuid: active });

    const email = account.email_address.toLowerCase();
    if (accountEmail !== undefined && accountEmail !== email) orgOf.clear();
    accountEmail = email;

    return { email, orgs: all };
  }

  function orgs(): Promise<Org[]> {
    orgsPromise ??= loadAccount().then(
      (a) => a.orgs,
      (err: unknown) => {
        orgsPromise = undefined;
        throw err;
      },
    );

    return orgsPromise;
  }

  function uuidOf(artifact: ArtifactRef): string {
    const uuid = artifactUuid(artifact);
    if (!uuid) throw new ShareError(`${artifact.url} isn't a valid artifact link.`, 'not-found');

    return uuid;
  }

  /**
   * Lists invitations, trying each of the user's organizations until one owns the artifact.
   * claude.ai answers 403 for the wrong organization and 404 for an artifact that doesn't exist.
   */
  async function fetchInvites(artifact: ArtifactRef): Promise<{ org: string; res: PageResponse }> {
    const uuid = uuidOf(artifact);
    const known = orgOf.get(uuid);
    const candidates = [...new Set([...(known ? [known] : []), ...(await orgs()).map((o) => o.uuid)])];

    if (candidates.length === 0) {
      throw new ShareError("Couldn't find your claude.ai organization. Open claude.ai and sign in.", 'auth');
    }

    let first: { org: string; res: PageResponse } | undefined;

    for (const org of candidates) {
      const res = await transport.fetch({
        method: 'GET',
        path: framePath('invites', uuid, org),
        headers: FRAME_HEADERS,
      });

      if (ok(res)) {
        orgOf.set(uuid, org);

        return { org, res };
      }

      if (res.status !== 403 && res.status !== 404) return { org, res };
      if (org === known) orgOf.delete(uuid);
      first ??= { org, res };
    }

    return first!;
  }

  function listError(res: PageResponse): ShareError {
    if (res.status === 403 && res.cfMitigated !== 'challenge') {
      return new ShareError("You can't share this artifact. Only its owner can invite people.", 'forbidden');
    }

    if (res.status === 404) return new ShareError('Artifact not found. Check the link.', 'not-found');

    return errorFromResponse(res, "Couldn't read who has access");
  }

  /** The organization that owns the artifact; looks it up when a resumed run or a fresh popup has none cached. */
  async function orgFor(artifact: ArtifactRef): Promise<string> {
    const cached = orgOf.get(uuidOf(artifact));
    if (cached) return cached;
    const found = await fetchInvites(artifact);
    if (!ok(found.res)) throw listError(found.res);

    return found.org;
  }

  return {
    async whoami(): Promise<Account> {
      const { email, orgs: list } = await loadAccount();
      orgsPromise = Promise.resolve(list);

      return { email, orgName: list[0]?.name };
    },

    async listSharees(artifact): Promise<Sharee[]> {
      const { res } = await fetchInvites(artifact);
      if (!ok(res)) throw listError(res);
      const data = parseJson<{ invites?: unknown }>(res, 'Reading who has access');
      if (!Array.isArray(data.invites))
        throw new ShareError('claude.ai sent an unexpected list of people.', 'unknown');

      return (data.invites as InviteRecord[]).flatMap((inv): Sharee[] => {
        if (typeof inv.email !== 'string') return [];
        // Expired or revoked invitations no longer give access; inviting again renews them.
        const status = inv.status === 'accepted' ? 'active' : inv.status === 'pending' ? 'pending' : null;
        if (!status) return [];
        const role =
          typeof inv.role === 'string'
            ? inv.role
            : typeof inv.effectiveRole === 'string'
              ? inv.effectiveRole
              : '';

        return [
          {
            ...(typeof inv.id === 'string' && inv.id ? { id: inv.id } : {}),
            email: inv.email.toLowerCase(),
            access: ACCESS_FOR[role] ?? 'unknown',
            status,
          },
        ];
      });
    },

    async invite(artifact, email, access): Promise<void> {
      const uuid = uuidOf(artifact);
      const org = await orgFor(artifact);

      const res = await transport.fetch({
        method: 'POST',
        path: framePath('invite', uuid, org),
        headers: FRAME_HEADERS,
        body: { email, role: ROLE_FOR[access] },
      });
      if (!ok(res)) throw inviteError(res);

      const data = parseJson<{ invite?: unknown; shared_with_member?: unknown }>(
        res,
        'Sending the invitation',
      );

      if (!data.invite && !data.shared_with_member) {
        throw new ShareError("claude.ai didn't confirm the invitation.", 'unknown');
      }
    },

    async changeAccess(artifact, inviteId, access): Promise<void> {
      const uuid = uuidOf(artifact);
      const res = await transport.fetch({
        method: 'PATCH',
        path: framePath('invite', uuid, await orgFor(artifact), inviteId),
        headers: FRAME_HEADERS,
        body: { role: ROLE_FOR[access] },
      });
      if (!ok(res)) throw manageError(res);
    },

    async removeInvite(artifact, inviteId): Promise<void> {
      const uuid = uuidOf(artifact);
      const res = await transport.fetch({
        method: 'DELETE',
        path: framePath('invite', uuid, await orgFor(artifact), inviteId),
        headers: FRAME_HEADERS,
      });
      if (!ok(res)) throw manageError(res);
    },
  };
}
