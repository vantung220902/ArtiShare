import { describe, expect, it } from 'vitest';
import { createApiShareClient, inviteError, type Transport } from '../src/claude/apiShareClient';
import type { PageRequest, PageResponse } from '../src/claude/pageFetch';
import { parseArtifactRef } from '../src/core/artifactUrl';
import { ShareError } from '../src/core/runner';

// 2PUa7qFdoBcApzhmHVvA4K is the base58 form of this uuid.
const ART = parseArtifactRef('https://claude.ai/artifact/2PUa7qFdoBcApzhmHVvA4K')!;
const UUID = '0b3c7e2a-1f4d-4a8e-9c2b-5d6e7f8a9b0c';
const ACTIVE = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';

const json = (status: number, body: unknown, extra: Partial<PageResponse> = {}): PageResponse => ({
  status,
  body: JSON.stringify(body),
  retryAfter: null,
  ...extra,
});

const ACCOUNT = json(200, {
  email_address: 'Me@Example.com',
  memberships: [
    { organization: { uuid: OTHER, name: 'API org' } },
    { organization: { uuid: ACTIVE, name: 'My org' } },
  ],
});

function transport(route: (req: PageRequest) => PageResponse): Transport & { calls: PageRequest[] } {
  const calls: PageRequest[] = [];

  return {
    calls,
    async fetch(req) {
      calls.push(req);
      if (req.path === '/api/account') return ACCOUNT;

      return route(req);
    },
    async cookie(name) {
      return name === 'lastActiveOrg' ? ACTIVE : null;
    },
  };
}

const invitesPath = (org: string) => `/api/frame/invites/${UUID}?org=${org}`;
const invitePath = (org: string) => `/api/frame/invite/${UUID}?org=${org}`;

describe('ApiShareClient', () => {
  it('reports the account and the org selected in claude.ai', async () => {
    const client = createApiShareClient(transport(() => json(500, {})));
    await expect(client.whoami()).resolves.toEqual({ email: 'me@example.com', orgName: 'My org' });
  });

  it('lists invitations with the Share menu header and maps roles and statuses', async () => {
    const t = transport(() =>
      json(200, {
        invites: [
          { id: '1', email: 'A@x.io', status: 'accepted', role: 'commenter', createdAt: 'x' },
          { id: '2', email: 'b@x.io', status: 'pending', role: 'reader', createdAt: 'x' },
          { id: '3', email: 'c@x.io', status: 'expired', role: 'editor', createdAt: 'x' },
          { id: '4', email: 'd@x.io', status: 'pending', role: 'something-new', createdAt: 'x' },
        ],
      }),
    );
    const sharees = await createApiShareClient(t).listSharees(ART);
    expect(sharees).toEqual([
      { email: 'a@x.io', access: 'comment', status: 'active' },
      { email: 'b@x.io', access: 'view', status: 'pending' },
      { email: 'd@x.io', access: 'unknown', status: 'pending' },
    ]);
    const req = t.calls.find((c) => c.path.startsWith('/api/frame/'))!;
    expect(req).toMatchObject({ method: 'GET', path: invitesPath(ACTIVE), headers: { 'X-Frame-CP': 'go' } });
  });

  it("tries the user's other organizations when the active one doesn't own the artifact", async () => {
    const t = transport((req) =>
      req.path === invitesPath(OTHER)
        ? json(200, { invites: [] })
        : json(403, { error: { message: 'Permission denied.' } }),
    );
    const client = createApiShareClient(t);
    await expect(client.listSharees(ART)).resolves.toEqual([]);

    // The invite then goes to the organization that worked, without looking it up again.
    t.calls.length = 0;
    const ok = transport((req) =>
      req.path === invitePath(OTHER) ? json(200, { invite: { id: 'n' } }) : json(500, {}),
    );
    t.fetch = ok.fetch;
    await client.invite(ART, 'new@x.io', 'comment');
    expect(ok.calls.map((c) => c.path)).toEqual([invitePath(OTHER)]);
    expect(ok.calls[0]).toMatchObject({ method: 'POST', body: { email: 'new@x.io', role: 'commenter' } });
  });

  it('explains a 403 from every organization as not being the owner, and 404 as a bad link', async () => {
    const forbidden = createApiShareClient(transport(() => json(403, {})));
    await expect(forbidden.listSharees(ART)).rejects.toMatchObject({ code: 'forbidden' });
    const missing = createApiShareClient(
      transport(() => ({ status: 404, body: 'not found\n', retryAfter: null })),
    );
    await expect(missing.listSharees(ART)).rejects.toMatchObject({ code: 'not-found' });
  });

  it('finds the organization first when inviting without a preview (resumed run)', async () => {
    const t = transport((req) => {
      if (req.path === invitesPath(ACTIVE)) return json(200, { invites: [] });
      if (req.path === invitePath(ACTIVE)) return json(200, { invite: { id: 'n' }, created: true });

      return json(500, {});
    });
    await createApiShareClient(t).invite(ART, 'new@x.io', 'edit');
    expect(t.calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      'GET /api/account',
      `GET ${invitesPath(ACTIVE)}`,
      `POST ${invitePath(ACTIVE)}`,
    ]);
    expect(t.calls.at(-1)?.body).toEqual({ email: 'new@x.io', role: 'editor' });
  });

  it('accepts an org member being added directly', async () => {
    const t = transport((req) =>
      req.method === 'GET'
        ? json(200, { invites: [] })
        : json(200, { shared_with_member: { account_uuid: 'u', access: 'read' } }),
    );
    await expect(createApiShareClient(t).invite(ART, 'teammate@x.io', 'view')).resolves.toBeUndefined();
  });

  it('treats a signed-out account as an auth error', async () => {
    const t: Transport = { fetch: async () => json(403, {}), cookie: async () => null };
    await expect(createApiShareClient(t).whoami()).rejects.toMatchObject({ code: 'auth' });
  });
});

describe('inviteError', () => {
  const codeOf = (res: PageResponse) => inviteError(res).code;

  it("maps claude.ai's refusal reasons", () => {
    expect(codeOf(json(403, { reason: 'invite_cap_reached' }))).toBe('limit');
    expect(codeOf(json(403, { reason: 'invite_daily_cap' }))).toBe('daily-limit');
    expect(codeOf(json(403, { reason: 'external_invites_disabled' }))).toBe('unshareable');
    expect(codeOf(json(403, { reason: 'anything', plan_required: true }))).toBe('unshareable');
    expect(codeOf(json(403, { reason: 'writer_only' }))).toBe('forbidden');
    expect(codeOf(json(409, { reason: 'member_refused' }))).toBe('invalid');
    expect(codeOf(json(409, { reason: 'upload_window_open' }))).toBe('not-ready');
    expect(codeOf(json(403, { reason: 'editor_invites_disabled' }))).toBe('access-unavailable');
  });

  it('treats an unknown 403 reason as about the artifact, and other unknown reasons as about the item', () => {
    expect(codeOf(json(403, { reason: 'agent_frame' }))).toBe('unshareable');
    expect(codeOf(json(422, { reason: 'brand_new' }))).toBe('unknown');
  });

  it('falls back to the HTTP status', () => {
    expect(codeOf(json(400, {}))).toBe('invalid');
    expect(codeOf(json(409, {}))).toBe('invalid');
    expect(codeOf(json(404, {}))).toBe('not-found');
    expect(codeOf(json(502, {}))).toBe('server');
    const limited = inviteError(json(429, {}, { retryAfter: '7' }));
    expect(limited).toBeInstanceOf(ShareError);
    expect(limited).toMatchObject({ code: 'rate-limited', retryAfterMs: 7000 });
    expect(codeOf({ status: 403, body: '', retryAfter: null, cfMitigated: 'challenge' })).toBe('auth');
  });
});
