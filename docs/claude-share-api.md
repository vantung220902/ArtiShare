# claude.ai Share API (as used by the Share menu)

claude.ai has no public sharing API. This is what the artifact page's own Share menu calls, found
by watching its network requests and reading its client code (November 2026). It's internal and
can change without notice. All of it is used from `src/claude/apiShareClient.ts`, so a change on
claude.ai's side should be a one-file fix.

Placeholders: `{uuid}` is the artifact's UUID, `{org}` is an organization UUID, `{inviteId}` is an
invitation's id.

## Calling it

- Requests go to `https://claude.ai` with the user's session cookies (`credentials: 'same-origin'`).
  The extension runs `fetch()` inside a claude.ai tab's isolated world: Chrome sends it with the
  page's origin and cookies, so nothing about the session leaves the page, and the page's own
  scripts can't see or alter the requests.
- Every `/api/frame/...` request needs the header **`X-Frame-CP: go`**. Without it the API answers
  `404` even for a valid artifact. The Share menu also sends `X-Frame-Client-Version` (the page's
  `<meta name="build-timestamp">`), `X-Frame-Session-Id` and sometimes `X-Frame-Surface` /
  `X-Frame-Platform`, but they aren't required.
- Every `/api/frame/...` URL takes `?org={org}`, the organization that owns the artifact.

## Ids

- `claude.ai/artifact/{id}`: `{id}` is the **base58** (Bitcoin alphabet,
  `123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz`) encoding of the UUID's 16 bytes.
  For example `2PUa7qFdoBcApzhmHVvA4K` → `0b3c7e2a-1f4d-4a8e-9c2b-5d6e7f8a9b0c`.
  See `artifactUuid()` in `src/core/artifactUrl.ts`.
- `claude.ai/code/artifact/{uuid}`: already the UUID (not yet checked against a live code artifact).
- Organization: the `lastActiveOrg` cookie (readable from page script) is the org selected in
  claude.ai. `GET /api/account` lists all of the user's orgs under `memberships[].organization.uuid`.
  An artifact in a different org answers `403` for the wrong `org`, so the client tries the active
  org first and then the others.

## Endpoints

### Who am I: `GET /api/account`

`200` → `{ email_address, full_name, display_name, uuid, memberships: [{ organization: { uuid, name, capabilities } }] }`.
Signed out → `401`/`403`.

### Who has access: `GET /api/frame/invites/{uuid}?org={org}`

```json
{
  "invites": [
    {
      "id": "…", "email": "person@example.com",
      "status": "accepted",            // "accepted" | "pending" (others, such as expired, may appear)
      "role": "commenter",             // "reader" | "commenter" | "editor"
      "effectiveRole": "commenter",
      "createdAt": "…", "acceptedAt": "…", "expiresAt": "…"
    }
  ],
  "rolesOffered": ["reader", "commenter", "editor"],
  "editorsKeepAccessWhenPublic": true
}
```

The owner isn't in the list. People added directly as organization members (Team/Enterprise)
are in the artifact's permissions (`GET /api/frame/perm/{uuid}?org={org}`, as account UUIDs),
not in this list.

Errors: wrong org or no permission → `403` (`{"type":"error","error":{"type":"permission_error",…},"code":"permission_denied"}`);
unknown artifact → `404` (`not found`, plain text).

Role names map to the Share menu's labels: `reader` = Can view, `commenter` = Commenter,
`editor` = Can edit.

### Invite: `POST /api/frame/invite/{uuid}?org={org}`

Body (JSON): `{ "email": "person@example.com", "role": "reader" }`. Optional fields the Share
menu can send: `note` (a message for the invitee), `notify: false` (don't send the email; only
sent when the user turns notification off), and `requester`.

`200` responses:

- `{ "invite": { id, email, status, role, createdAt, … }, "created": true }` is a new invitation.
  With `created` false, `invite.status` tells whether the person had already accepted or the
  pending invitation was renewed.
- `{ "shared_with_member": { "account_uuid": "…", "access": "read" | "comment" | "write", "changed": bool } }`
  means the address belongs to a member of the owner's organization, who was given access directly.

Refusals send JSON with a `reason` (and sometimes `plan_required`, `capability`, `cause`).
The status is `403` for rules about the artifact or account, other 4xx otherwise. Reasons that
matter for bulk invites:

| reason | meaning | extension treats it as |
| --- | --- | --- |
| `invite_cap_reached`, `people_list_full` | the artifact is at its invitation limit | `limit` (skip the rest of this artifact) |
| `invite_daily_cap` | the account's daily invitation limit | `daily-limit` (stop the run; resume later) |
| `external_invites_disabled` | outside invitations are off for the account or org | `unshareable` |
| `editor_invites_disabled` | Can edit invitations are off | `unshareable` |
| `plan` / `plan_required: true` | the plan doesn't allow it | `unshareable` |
| `writer_only`, `editor_manage` | only the owner can invite | `forbidden` |
| `address_outside_company`, `member_refused`, `member_*_unavailable` | this address can't get that access | `invalid` (this address only) |
| `upload_window_open`, `missing_row`, `incomplete`, `generation_mismatch`, `perm_changed` | claude.ai is still checking a new version | `server` (retried) |
| `agent_frame`, `legacy_frame`, `live_doc`, `connectors_declared`, `cmek`, `classifier_*`, … | this artifact can't be shared by email | `unshareable` (any other `403` reason) |

Without a `reason`: `400` = not a valid address, `409` = that address can't be invited,
`404` = artifact gone, `429` = rate-limited (`Retry-After`), `502`/`503`/`504` = unavailable
(`Retry-After`). A `403`/`404` with the header `cf-mitigated: challenge` is a Cloudflare human check.

### Other Share menu calls (not used by the extension)

- `POST /api/frame/invite/{uuid}/check?org={org}` with `{ "emails": [...] }` → `{ "company": [bool, …] }`,
  saying which addresses are in the owner's organization.
- `PATCH /api/frame/invite/{uuid}/{inviteId}?org={org}` with `{ "role": "…" }` changes an invitation's access.
- `DELETE /api/frame/invite/{uuid}/{inviteId}?org={org}` removes an invitation
  (`409` with reason `invitee_joined_org` if the person has since joined the org).
- `GET /api/frame/perm/{uuid}?org={org}` returns the artifact's sharing settings, including
  `peopleMax` (200 on a Pro account) and the member lists.

## Not verified yet

- A live `POST …/invite` response. The shape above comes from the Share menu's code.
- The exact per-artifact cap. The help article says 50 people outside the organization, and the
  side panel mentions that; `peopleMax` reads 200. The extension doesn't count toward a cap itself:
  it relies on the server's `invite_cap_reached` and skips the rest of that artifact.
- `claude.ai/code/artifact/{uuid}` links.
