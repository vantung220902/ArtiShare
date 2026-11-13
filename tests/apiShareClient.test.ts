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
      { id: '1', email: 'a@x.io', access: 'comment', status: 'active' },
      { id: '2', email: 'b@x.io', access: 'view', status: 'pending' },
      { id: '4', email: 'd@x.io', access: 'unknown', status: 'pending' },
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

  it('tries current organizations after a cached organization stops working', async () => {
    let currentOrg = ACTIVE;
    const calls: string[] = [];
    const t: Transport = {
      async cookie() {
        return null;
      },
      async fetch(req) {
        calls.push(req.path);
        if (req.path === '/api/account') {
          return json(200, {
            email_address: 'me@x.io',
            memberships: [{ organization: { uuid: currentOrg } }],
          });
        }
        return req.path === invitesPath(currentOrg) ? json(200, { invites: [] }) : json(403, {});
      },
    };
    const client = createApiShareClient(t);
    await client.listSharees(ART);
    currentOrg = OTHER;
    await client.whoami();
    await expect(client.listSharees(ART)).resolves.toEqual([]);
    expect(calls.slice(-2)).toEqual([invitesPath(ACTIVE), invitesPath(OTHER)]);
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

  it('keeps each invitation id, and leaves it out when claude.ai sends none', async () => {
    const t = transport(() =>
      json(200, {
        invites: [
          { id: 'abc', email: 'a@x.io', status: 'accepted', role: 'reader' },
          { email: 'b@x.io', status: 'pending', role: 'reader' },
        ],
      }),
    );
    await expect(createApiShareClient(t).listSharees(ART)).resolves.toEqual([
      { id: 'abc', email: 'a@x.io', access: 'view', status: 'active' },
      { email: 'b@x.io', access: 'view', status: 'pending' },
    ]);
  });
});

describe('ApiShareClient changing and removing invitations', () => {
  const invitePathFor = (org: string, id: string) => `/api/frame/invite/${UUID}/${id}?org=${org}`;

  it.each([
    ['view', 'reader'],
    ['comment', 'commenter'],
    ['edit', 'editor'],
  ] as const)('sends PATCH with role %s as %s', async (access, role) => {
    const t = transport((req) =>
      req.method === 'GET' ? json(200, { invites: [] }) : json(200, { invite: { id: 'i-1', role } }),
    );
    await createApiShareClient(t).changeAccess(ART, 'i-1', access);
    const patch = t.calls.at(-1)!;
    expect(patch).toMatchObject({
      method: 'PATCH',
      path: invitePathFor(ACTIVE, 'i-1'),
      headers: { 'X-Frame-CP': 'go' },
      body: { role },
    });
  });

  it('sends DELETE to the invitation with the Share menu header and no body', async () => {
    const t = transport((req) => (req.method === 'GET' ? json(200, { invites: [] }) : json(200, {})));
    await createApiShareClient(t).removeInvite(ART, 'i-1');
    const del = t.calls.at(-1)!;
    expect(del).toMatchObject({
      method: 'DELETE',
      path: invitePathFor(ACTIVE, 'i-1'),
      headers: { 'X-Frame-CP': 'go' },
    });
    expect(del.body).toBeUndefined();
  });

  it("uses the organization that owns the artifact, and doesn't look it up twice", async () => {
    const t = transport((req) => {
      if (req.path === invitesPath(OTHER)) return json(200, { invites: [] });
      if (req.method === 'GET') return json(403, {});

      return json(200, {});
    });
    const client = createApiShareClient(t);
    await client.listSharees(ART);
    t.calls.length = 0;
    await client.changeAccess(ART, 'i-1', 'view');
    await client.removeInvite(ART, 'i-2');
    expect(t.calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      `PATCH ${invitePathFor(OTHER, 'i-1')}`,
      `DELETE ${invitePathFor(OTHER, 'i-2')}`,
    ]);
  });

  it("escapes the invitation id so it can't change the path", async () => {
    const t = transport((req) => (req.method === 'GET' ? json(200, { invites: [] }) : json(200, {})));
    await createApiShareClient(t).removeInvite(ART, '../x?y');
    expect(t.calls.at(-1)?.path).toBe(`/api/frame/invite/${UUID}/..%2Fx%3Fy?org=${ACTIVE}`);
  });

  describe('refusals', () => {
    const refuse = (res: PageResponse) =>
      transport((req) => (req.method === 'GET' ? json(200, { invites: [] }) : res));

    it.each([
      ['PATCH', (c: ReturnType<typeof createApiShareClient>) => c.changeAccess(ART, 'i', 'view')],
      ['DELETE', (c: ReturnType<typeof createApiShareClient>) => c.removeInvite(ART, 'i')],
    ] as const)('%s: maps claude.ai’s answers to messages the popup can show', async (_m, act) => {
      const joined = act(createApiShareClient(refuse(json(409, { reason: 'invitee_joined_org' })))).catch(
        (e: unknown) => e,
      );
      expect(await joined).toMatchObject({
        message: 'This person joined your organization, so their access is managed in claude.ai.',
        code: 'managed-elsewhere',
      });

      const forbidden = act(createApiShareClient(refuse(json(403, { reason: 'writer_only' })))).catch(
        (e: unknown) => e,
      );
      expect(await forbidden).toMatchObject({
        message: 'Only the owner can change access',
        code: 'forbidden',
      });

      const gone = act(createApiShareClient(refuse(json(404, {})))).catch((e: unknown) => e);
      expect(await gone).toMatchObject({ message: 'The invitation no longer exists', code: 'not-found' });

      const limited = await act(createApiShareClient(refuse(json(429, {}, { retryAfter: '7' })))).catch(
        (e: unknown) => e,
      );
      expect(limited).toBeInstanceOf(ShareError);
      expect(limited).toMatchObject({ code: 'rate-limited', retryAfterMs: 7000 });
    });

    it('reports a Cloudflare check as a sign-in problem, not as a refusal', async () => {
      const challenged = refuse({ status: 403, body: '', retryAfter: null, cfMitigated: 'challenge' });
      await expect(createApiShareClient(challenged).removeInvite(ART, 'i')).rejects.toMatchObject({
        code: 'auth',
      });
    });

    it('treats a server error as ambiguous, and a 409 without the reason as unexplained', async () => {
      await expect(createApiShareClient(refuse(json(503, {}))).removeInvite(ART, 'i')).rejects.toMatchObject({
        code: 'server',
      });
      await expect(
        createApiShareClient(refuse(json(409, {}))).changeAccess(ART, 'i', 'edit'),
      ).rejects.toMatchObject({ code: 'unknown' });
    });

    it('finds nothing to change when the artifact itself is not found', async () => {
      const t = transport(() => ({ status: 404, body: 'not found\n', retryAfter: null }));
      await expect(createApiShareClient(t).changeAccess(ART, 'i', 'view')).rejects.toMatchObject({
        code: 'not-found',
      });
      expect(t.calls.some((c) => c.method === 'PATCH')).toBe(false);
    });
  });
});

describe('inviteError', () => {
  const codeOf = (res: PageResponse) => inviteError(res).code;

  it("maps claude.ai's refusal reasons", () => {
    expect(codeOf(json(403, { reason: 'invite_cap_reached' }))).toBe('limit');
    expect(codeOf(json(403, { reason: 'invite_daily_cap' }))).toBe('daily-limit');
    expect(codeOf(json(403, { reason: 'external_invites_disabled' }))).toBe('external-disabled');
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
    const date = new Date(Date.now() + 60_000).toUTCString();
    const dated = inviteError(json(429, {}, { retryAfter: date }));
    expect(dated.retryAfterMs).toBeGreaterThan(58_000);
    expect(dated.retryAfterMs).toBeLessThanOrEqual(60_000);
    expect(codeOf({ status: 403, body: '', retryAfter: null, cfMitigated: 'challenge' })).toBe('auth');
  });
});
