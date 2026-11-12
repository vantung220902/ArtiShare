# Harness progress

The memory between long-running sessions, together with `git log`. Newest entry first: each session adds one at the top of **Sessions** before it commits. See `CLAUDE.md` for the routine.

## Sessions

### 2026-11-12 · F017 · Docs describe the popup and Manage access (partly done, blocked on `.claude/` edits)

- **Did:** README: flowchart, Install step 5, update note, Use it, 'the popup says so', Develop project layout now say popup; the Manage access section is headed 'Optional: Manage access'. `store/listing.md`: description and test steps say popup, the `sidePanel` permission row is gone, the single-purpose text mentions managing existing invitations, the description has a Manage access bullet and says closing the popup doesn't stop a run. `docs/index.html`: no 'side panel', plus a Manage access line under Good to know. `CLAUDE.md` layout says popup and `popup/`. Icon SVG comments and `docs/site.css` say popup.
- **Verified:** `npm run check` and `npm run e2e` (70 specs) pass. The feature-verifier was **not** run, because the feature is incomplete.
- **State:** F017 stays `passes: false`. Three one-line edits are left, and this session's permission mode refused edits under `.claude/` (sessions can't edit their own config): `.claude/commands/harness-work.md:23` ('in the side panel and asserts' → 'in the popup and asserts'), `.claude/commands/harness-plan.md:27` ('in the side panel of the fake build' → 'in the popup of the fake build') and `.claude/agents/feature-verifier.md:20` ('from the side panel through' → 'from the popup through').
- **Next:** A human makes those three edits (or allows edits under `.claude/`). Then: run `grep -ri 'side panel'` (it should find only `docs/claude-share-api.md:159`, which is claude.ai's own Share UI, the untracked `video/` folder and `harness/`), run the verifier for F017, set `passes: true`. Then F018 (screenshots).
- **Notes:**
  - An e2e run overlapping with a background `harness/init.sh` produced one random failure in each run (F001, F008). Run `npm run e2e` alone: 70/70.
  - `video/` is untracked and still says side panel; left alone.

### 2026-11-12 · F016 · Manage access handles nobody invited, a stale list and repeated clicks

- **Did:** `ManageView.tsx`: 'Only you have access.' plus 'Nobody is invited yet. Use Share to invite people.' when the list is empty (the 'You (owner)' row stays). New **Refresh** button beside Back (shown once a first read succeeded): it re-reads without blanking the list ('Refreshing…' while it runs); a failed refresh keeps the last list and shows 'Could not refresh: …' above it. The first-load error with Retry is unchanged (only while there is no list). `ManageView` takes a new `run` prop from `App.tsx` and shows an `<output>` note 'A share is in progress for this artifact. Refresh shows the latest.' while `run.status === 'running'` with a pending item for this artifact. `PersonRow` got a synchronous `inFlight` ref so a second change or remove can't start before React re-renders the disabled controls. README paragraph extended. `e2e/F016.spec.ts` (4 tests): the empty artifact; Refresh after a second popup sent invitations; the in-progress note during a real run and Refresh after it; repeated change/remove/confirm counting `chrome.runtime.sendMessage` calls by type (exactly 1 `change-access`, 1 `remove-invite`).
- **Verified:** `npm run check` (175 unit tests) and `npm run e2e` (70 specs) pass; F016 spec 3× in a row (12/12). feature-verifier: PASS.
- **State:** F016 passes. 2 features left (F017 docs, F018).
- **Next:** F017: docs sweep (README, store/listing.md, docs/index.html, CLAUDE.md, harness-work.md, feature-verifier.md say popup instead of side panel; the 'never removes anyone' sentence already says Remove + confirm since F015). Start with `grep -ri 'side panel'`.
- **Notes:**
  - The failed-Refresh path ('Could not refresh') has no e2e (not one of the steps); the fake has no way to fail a read of an already-loaded artifact.
  - The hidden run view also lists invited addresses, so `share.getByText('ana@example.com')` matches twice once a run exists; scope assertions to `ul.people > li` rows.
  - A second popup (`context.newPage()` + `goto(panel.url())`) shares the background's fake state and run storage, which is how the spec makes the list go stale on purpose.
  - Lint prefers `<output>` over `role="status"`, and forbids referencing an unbound method like `descriptor.set` in a `.call` chain on a destructured value.

### 2026-11-12 · F015 · Manage access explains refused changes and removals, and a list that can't load

- **Did:** No source change: F013/F014 had already built the row error (`role="alert"`, controls re-enabled, select back to the old value) and F012 the load error with Retry. Added `e2e/F015.spec.ts` (4 tests): the `locked…` change and removal errors on the row with other rows still working and the row kept after reopening; a `ForbiddenSharedArtifact1` artifact listing people while a change and a removal both say 'Only the owner can change access'; a `Missing` artifact showing 'Artifact not found' with Retry and no list, where Retry goes back to loading and fails again, and Back still works. README: one sentence on the errors, and the line that said ArtiShare 'never removes anyone' now says it does so only on Remove + confirm.
- **Verified:** `npm run check` (175 unit tests) and `npm run e2e` (66 specs) pass; the new spec passed 3× in a row. feature-verifier: PASS.
- **State:** F015 passes. 3 features left (F016–F018).
- **Next:** F016: edge cases in Manage access: 'Only you have access.' with a hint that Share invites people when nobody is invited, a Refresh button (new, there is none yet) that re-reads the list, one request per action under repeated clicks (rows already disable while in flight; check the confirm path too), and a note when a run is sending to this artifact.
- **Notes:**
  - To get seeded people and a refusal at once use an id containing both words, e.g. `ForbiddenSharedArtifact1`.
  - `retry.click()` returns before React re-renders, so a test asserting the loading line must wait for it (the spec uses a MutationObserver flag plus `waitForFunction`); the fake answers in 150 ms, too fast to poll.
  - The e2e lint forbids `import('…')` type annotations; use `import type`.
  - Shell heredocs and compound `sed … && …` commands are refused; use Edit/Write.

### 2026-11-12 · F014 · Removing a person's invitation in Manage access asks first, then removes it

- **Did:** New message `remove-invite` (`src/lib/messages.ts`, handled in `background.ts` by `client.removeInvite`). `PersonRow` in `src/entrypoints/popup/ManageView.tsx` has a Remove button (aria-label `Remove <email>`, shown for any row with an `id`) that asks through `useConfirm` ('Remove <email> from this artifact?' / 'Their invitation will stop working.', danger), then disables the row's select and button (`busy`) while in flight and drops the row via `onRemoved`. On failure it re-enables the row and shows the error on it (the `role="alert"` already used for changes; F015 tests it). Style `.people li > button`; README sentence added. `e2e/F014.spec.ts`.
- **Verified:** `npm run check` (175 unit tests) and `npm run e2e` (62 specs) pass. feature-verifier: PASS.
- **State:** F014 passes. 4 features left (F015–F018).
- **Next:** F015: error handling in Manage access: the `locked…` person's change and removal errors on the row, `Forbidden` artifact messages, and a `Missing` artifact showing the error with Retry (the load-error Retry already exists in `ManageView`; check it and add e2e for all four steps).
- **Notes:**
  - The popup code lives in `src/entrypoints/popup/`, not `sidepanel/` as older entries say.
  - The verifier flagged that a plain `.people button` rule would also shrink the confirm dialog's buttons, since the `<dialog>` is rendered inside the `<li>`; the rule is scoped to `.people li > button`. Keep that in mind if more rules go under `.people`.
  - The preview groups are 'Will be invited' (not 'To invite', which is the stat label), and a newly invited person gets the list's permission.

### 2026-11-12 · F013 · Changing a person's permission in Manage access saves it on claude.ai

- **Did:** New message `change-access` (`src/lib/messages.ts`, handled in `background.ts` by `client.changeAccess`). `ManageView.tsx` now has a `PersonRow` per invitee: an `AccessSelect` (new optional `disabled` and `label` props) that is disabled while saving and shows the chosen value, then a short 'Saved' (`.saved`, 2.5 s) on that row only; on success the parent's list is updated in place. On failure it clears `saving`, so the select falls back to the old value, and the error shows as a `role="alert"` on the row (F015 will test and polish that). Rows without an `id` or with an unknown role stay a plain tag. Styles in `src/ui/styles.css`; README sentence updated. `e2e/F013.spec.ts`.
- **Verified:** `npm run check` (175 unit tests) and `npm run e2e` (61 specs) pass. feature-verifier: PASS.
- **State:** F013 passes. 5 features left (F014–F018). There is no Remove button yet.
- **Next:** F014: a Remove button per row with an in-popup confirmation (reuse the F004 confirm component), a `remove-invite` message (background → `client.removeInvite(artifact, inviteId)`), and drop the row on success. Disable the row's controls while in flight.
- **Notes:**
  - The preview only lists people who are also in the addresses being sent, so an e2e that checks 'Existing email access' must include that address in the list.
  - The failure path in `PersonRow` is written but has no e2e yet; F015 covers it.
  - The fake's state is in the background worker's memory, which is what makes 'close and reopen' show the change in e2e.

### 2026-11-12 · F012 · A 'Manage access' link opens the list of people already invited

- **Did:** New message `sharees` (`src/lib/messages.ts`, answered in `background.ts` by `client.listSharees`). New `src/entrypoints/popup/ManageView.tsx`: 'People with access', the artifact link with copy, a Back button, 'You (owner)' always first and not editable (the owner entry claude.ai sends, if any, is filtered out), then each invitee with address, Pending/Accepted and permission as plain text. It has a loading line and, for a failed read, the error with a Retry link (F015 will test and extend that). `App.tsx` reads the active tab's artifact once (`currentTabArtifact`, moved from `ShareView.tsx` to `viewUtils.ts`) and, when there is one, shows a quiet `button.link` 'Manage access' under the Share form or the run view. The form or run stays mounted but `hidden` while Manage access shows, so Back finds it exactly as it was. Styles `.people`, `.manage-link` in `styles.css`. README has a 'Who already has access' section. `e2e/F012.spec.ts` (3 tests): the Shared artifact (link position below Preview, not a tab or primary; the four rows; Back keeps the typed text), under a finished run view, and no link on a non-artifact page.
- **Verified:** `npm run check` (175 unit tests) and `npm run e2e` (60 specs) pass. feature-verifier: PASS, with command output quoted.
- **State:** F012 passes. 6 features left (F013–F018). Manage access is read-only; the permission is text, not a select yet.
- **Next:** F013: replace the permission text with `AccessSelect` per invitee row, calling a new `change-access` message (background → `client.changeAccess(artifact, inviteId, access)`); disable the select while in flight, show 'Saved' on that row, leave other rows alone. Use `Sharee.id` for the row key. Needs an `ArtifactRef` and invite id in the message.
- **Notes:**
  - The Manage access view is not saved across the popup closing (not asked for); reopening shows the Share tab.
  - The link appears for the tab the popup opened over, read once on mount. In e2e that is why the spec brings the artifact tab to the front and reloads the panel, as F003 does.
  - Fake artifact ids containing `Shared` are seeded: don't use that word in an id for a clean artifact in a spec (I hit that once).
  - Shell heredocs and `>>` redirects are refused here; use Edit/Write. A `while`/`until` loop in Bash is refused too; poll with `pgrep`.

### 2026-11-12 · F011 · The claude.ai client can change an invitation's permission and remove it

- **Did:** `ShareClient` (`src/claude/shareClient.ts`) gained `changeAccess(artifact, inviteId, access)` and `removeInvite(artifact, inviteId)`. `apiShareClient.ts` implements them as PATCH `{ role }` and DELETE on `/api/frame/invite/{uuid}/{inviteId}?org=…` with `X-Frame-CP: go`; the org lookup that `invite` did inline is now `orgFor()`, shared by all three. `listSharees` fills `Sharee.id` from the invitation's `id` (omitted if claude.ai sends none). `manageError()` maps 409 `invitee_joined_org` to the 'joined your organization' message, 403 to 'Only the owner can change access', 404 to 'The invitation no longer exists', 429 to rate-limited, and a Cloudflare challenge to `auth`. Added the error code `managed-elsewhere` (`src/core/runner.ts`), which the fake now throws too (it was `unknown`). `FakeShareClient` is gone; the fake returns `ShareClient`. `docs/claude-share-api.md` documents both endpoints and the refusal table. Tests: 12 new in `tests/apiShareClient.test.ts` (stub transport), and `tests/runManager.test.ts`'s client stub got the two methods.
- **Verified:** `npm run check` (175 unit tests) and `npm run e2e` (57 specs) pass. feature-verifier: PASS.
- **State:** F011 passes. 7 features left (F012–F018). No e2e spec for F011: it has no UI, and its steps are about docs, the interface and unit tests.
- **Next:** F012: the 'Manage access' link on an artifact tab and the read-only 'People with access' view. `listSharees` already returns ids and the fake has the `Shared…` artifact to click through.
- **Notes:**
  - The PATCH/DELETE request and response shapes come from the Share menu's code, not a live artifact; the doc's 'Not verified yet' list says so. Whether a pending invitation can have its role changed is unchecked.
  - `changeAccess` and `removeInvite` throw `ShareError`s with the exact messages above, so the UI can show `err.message` and branch on `managed-elsewhere`.

### 2026-11-12 · F010 · The fake claude.ai can change and remove invitations, and has seeded artifacts

- **Did:** `src/claude/fakeShareClient.ts`: ids containing `Shared` start with the owner plus viewer@ (accepted, Can view), commenter@ (pending, Commenter) and locked@example.com; `Missing` makes `listSharees` throw not-found; `changeAccess(artifact, inviteId, access)` and `removeInvite(artifact, inviteId)` (300 ms each) throw 'Only the owner can change access' (forbidden) for `Forbidden`, 'The invitation no longer exists' (not-found) for an unknown id, and 'This person joined your organization, so their access is managed in claude.ai.' for `locked…`. `Sharee` (`src/core/types.ts`) gained an optional `id` (the invitation id, none for the owner); the fake gives every invitation one (`inv-N`), including ones from `invite`. The new methods live on an exported `FakeShareClient` type, not yet on `ShareClient`. Rules are at the top of the file and in the README's fake-mode list. Tests: `tests/fakeShareClient.test.ts` (9) and `e2e/F010.spec.ts` (2: Shared preview lists the three people with permissions; Missing preview says not found).
- **Verified:** `npm run check` (163 unit tests) and `npm run e2e` (57 specs) pass. feature-verifier: PASS on its second run, with real command output (its first run was a FAIL only because Bash was denied).
- **State:** F010 passes. 8 features left (F011–F018).
- **Next:** F011: add `changeAccess` and `removeInvite` to `ShareClient` (src/claude/shareClient.ts) and implement them in `apiShareClient.ts` (PATCH/DELETE `/api/frame/invite/{uuid}/{inviteId}`), make `listSharees` fill `Sharee.id`, document them in `docs/claude-share-api.md`, and then drop `FakeShareClient` in favour of `ShareClient`.
- **Notes:**
  - The fake's methods take an invite id, not an email, to match what F011's real client needs. The id is optional on `Sharee` only because the owner has none.
  - The preview's group is titled 'Existing email access (left unchanged)' and only lists people whose addresses are in the lists being previewed, so the F010 step's 'Already have access' is checked with a list holding the three seeded addresses plus a new one. Manage access (F012+) is what shows everyone.
  - The fake's locked error uses code `unknown`; F011 may add a dedicated code.

### 2026-11-12 · F009 · Closing the popup mid-run doesn't stop the run, and reopening shows live progress

- **Did:** No source change was needed: the run already lives in the background and `chrome.storage.local`, and the run view follows it. Added `e2e/F009.spec.ts` (2 tests): (1) four addresses with a `slow-…` one last, closed (`goto('about:blank')`) once one is invited, reopened 1.5 s later: Running, Stop visible, more invited than before and fewer than 4, and the count keeps rising with the popup open; Stop, close, reopen: Stopped, same invited count (nothing sent while closed), "N left"; Resume ends with "Share finished: 4 invited" and Done. (2) A two-address run that finishes while the popup is closed shows "Share finished: 2 invited" on reopening. README (Run section) says closing doesn't stop the run and reopening shows progress.
- **Verified:** `npm run check` (154 unit tests) and `npm run e2e` (55 specs) pass; F009 `--repeat-each=5` 10/10 passed. feature-verifier: PASS on its second run, with real command output (check, full e2e 55 passed, F009 x3 6 passed).
- **State:** F009 passes. 9 features left (F010–F018).
- **Next:** F010, the fake claude.ai's `changeAccess` and `removeInvite`, plus seeded artifacts ('Shared', 'Missing', `locked…`). That is the base for the Manage access view.
- **Notes:**
  - The verifier's first run was a FAIL only because its Bash was denied (no commands run); I re-ran it and it passed. Check that a PASS quotes real command output.
  - Timing in the spec: the run is ~4.6 s minimum (0.3 s per invite, 0.8 s+ between, 1 s rate limit on the slow address), so reopening at ~2 s still finds it running. The first draft waited 2.5 s and the run had only the last address left, so the chips (hidden once finished) vanished; 1.5 s is the safe wait.
  - Shell heredocs are refused here; use Edit/Write.

### 2026-11-12 · F008 · A preview survives the popup closing, even while it is loading

- **Did:** `PopupState` gained `preview: PreviewState | null` (`src/core/popupState.ts`: `label`, `artifacts`, `invites`, `results` or null while loading, `accountEmail`; `parsePreviewState` validates what is read back). `storage.ts` exports `currentPopupState()` so `ShareView`, which mounts after the App has loaded the state, starts from the stored preview. `ShareView.tsx`: Preview click now stores and shows the preview at once with `results: null` ("Checking current access…", Send disabled); an effect asks the background for any preview without results (so a popup that closed mid-load asks again on reopening) and saves the answer. Back, an error, or Send clears the stored preview; a late answer after Back is ignored (`stale` flag). A failed preview goes back to the form with the error. README (step 4) says what reopening shows.
- **Verified:** `npm run check` (154 unit tests) and `npm run e2e` (53 specs) pass. New `e2e/F008.spec.ts` (3 tests): close mid-load, reopen (preview with both cards, Send 4), reopen again, Back, reopen (form); Back while loading stays on the form after the late answer; Send from a restored preview, then Start a new share and reopen give an empty form. feature-verifier: PASS (ran check, full e2e 53 passed, and F008 `--repeat-each=3` 9 passed).
- **State:** F008 passes. 10 features left (F009–F018).
- **Next:** F009, closing the popup mid-run doesn't stop the run and reopening shows live progress. The run already lives in the background and `chrome.storage.local`, so likely mostly an e2e spec; check Stop/Resume after reopening.
- **Notes:**
  - A preview with `results: null` stored while another view is open (e.g. switching to Lists tab doesn't unmount Share) is fine; only unmounting makes it stale and it re-asks on next mount.
  - The spec doesn't assert the visible "Checking current access…" text on reopen: the fake answers in ~300 ms, too quick to assert without flakiness.
  - Shell heredocs are refused here; use Edit/Write.

### 2026-11-12 · F007 · Verifier verdict for the reconciled restored draft

- **Did:** No code change. The previous session finished F007 (spec `e2e/F007.spec.ts`, README) but couldn't get a verdict because the verifier's Bash was denied. This session re-ran the baseline and the verifier, then flipped `passes`.
- **Verified:** `harness/init.sh` (check: 141 unit tests; e2e: 50 specs) passed. feature-verifier: PASS on the second run, with real output: `e2e/F007.spec.ts` 4 passed, `npm run check` 141 passed, full e2e 50 passed.
- **State:** F007 passes. 11 features left (F008–F018).
- **Next:** F008, a preview survives the popup closing, even while it is loading.
- **Notes:**
  - The verifier's first run this session said PASS but its tool log showed only Grep and Read, so its claims about running commands were unsupported. I discarded it and asked again, requiring Bash output quoted; check the verifier's tool count when its report quotes command results.
  - Popup state is shared by every window, so two popups both editing lists would overwrite each other's `lists` draft. Fine for one popup at a time.

### 2026-11-12 · F007 · A restored draft is reconciled with what changed while the popup was closed

- **Did:** No source change was needed: F005/F006 already drop deleted lists from restored ticks, `open` and `edits` (`reconcileListsDraft`), and a restored edit keeps its `baseline`, so `ListForm`'s existing conflict warning and Reload saved appear when the list changed meanwhile. Added `e2e/F007.spec.ts` (4 tests): (1) Alpha and Beta ticked with an artifact typed, popup closed, Beta deleted from a second popup page, reopen: artifact kept, Alpha ticked, Beta gone, no `.alert`; (2) an unsaved edit of Beta and an open Alpha, Beta deleted meanwhile: no Beta, Alpha still open and untouched, no stray expanded form; (3) an unsaved edit of Alpha, Alpha's addresses changed from another window: draft kept as typed, "This list changed in another window." shown, Save and Delete disabled, Reload saved loads the other window's addresses, clears the warning and the stored edit; (4) an edit of an unchanged list is restored without any warning. 'Close' is `goto('about:blank')`; 'another window' is a second popup page that sends `config-get`/`config-change` (the same messages Save and Delete use), then closes. README (Lists and Share sections) says what happens to drafts of deleted or changed lists.
- **Verified:** `npm run check` (141 unit tests) and `npm run e2e` (50 specs) pass. feature-verifier: **not obtained.** It was run twice and returned FAIL both times only because its Bash calls were denied in this session (it ran no commands; its read-only review of the spec and `ListForm` found no defect). So `passes` was not flipped.
- **State:** F007 passes **false**, though the work is complete and green. 12 features left (F007–F018).
- **Next:** Run the feature-verifier on F007 again (it needs Bash allowed; run `npm run e2e` first so the fake build is current). On PASS, set F007 `passes: true` and commit with `F007: ...`, then go on with F008 (a preview survives the popup closing, even while loading). If the verifier FAILs for a real reason, fix that first.
- **Notes:**
  - A second popup page that merely opens writes nothing to `popupState`, so it doesn't clobber the first. But popup state is shared by every window: a second popup that edits a list would overwrite `lists` for the first. Not a problem for one popup at a time.
  - Shell heredocs, `cp` and `sed -i` are refused here; use Edit.

### 2026-11-12 · F006 · A list being typed or edited, and the open tab, survive the popup closing

- **Did:** New `src/core/popupState.ts` (pure, unit-tested in `tests/popupState.test.ts`): `ListFormDraft` (name, text, access, `baseline`), `ListsDraft` (`adding`, `newList`, `open`, `edits` by list id), `PopupState` (`tab` + `lists`), with `parsePopupState`, `parseListFormDraft`, `reconcileListsDraft` (drops deleted lists) and `sameListFormDraft`. `src/lib/storage.ts`: `loadPopupState` / `patchPopupState` (key `popupState` in `chrome.storage.session`; keeps an in-memory copy and writes in order so pieces patched by different components don't clobber each other). `ListForm` takes `initial` (restored draft, only read on mount) and `onUnsavedChange` (reports `{name,text,access,baseline}` whenever the form is dirty, else null). `App.tsx` loads the popup state before drawing anything (`tab = tabChoice ?? stored.tab`) and saves the tab on change. `ListsView.tsx` keeps `adding`/`newList`/`open`/`edits` and saves them (skipping the first run); each saved list is now a `ListCard` component with a stable callback and a controlled `<details open>`. `ShareDraft` gained optional `creating` and `newList`, so the inline form in Share is saved and cleared with the rest of the Share draft (`ShareView.tsx`). `EmailListSchema` is now exported from `config.ts`. README updated (Lists section, Share section).
- **Verified:** `npm run check` (141 unit tests) and `npm run e2e` (46 specs) pass. New `e2e/F006.spec.ts` (6 tests): new list in Lists (name, two addresses, Can edit, tab) returns after a reload and goes on Cancel and on Save list; an open empty form stays open; an unsaved edit returns expanded with Save/Revert enabled, and goes on Revert and on Save; a collapsed list stays collapsed; the inline Share form returns and goes on Cancel and Save list (also with only a permission picked); with no lists the inline form keeps its text. feature-verifier: PASS.
- **State:** F006 passes. 12 features left (F007–F018).
- **Next:** F007, reconcile a restored draft with changes made while the popup was closed. Much is already in place: deleted lists are dropped from restored ticks (F005) and from `open`/`edits` (`reconcileListsDraft`); a restored edit keeps its `baseline`, so `ListForm`'s existing `conflict` ("This list changed in another window", Reload saved) should already appear when the list changed meanwhile. Write the e2e for the four steps, fix whatever doesn't hold (e.g. a draft whose list was deleted should not leave an empty expanded form), and flip it.
- **Notes:**
  - The popup now reopens on the tab it was closed on. E2E that clicks Lists, reloads, then looks at the Share tab must click Share first (changed in F005's specs).
  - Role-based locators skip the hidden tab panel: to look at the Lists tab while Share is showing, use `panel.locator('details', …)`.
  - Every saved list's form is in the DOM even when collapsed, so a 'no form showing' check must filter `visible: true`.
  - The e2e run must follow `npm run build:fake`; `npx playwright test` alone uses the last build.

### 2026-11-12 · F005 · The Share form survives the popup closing

- **Did:** The Share form's draft (Artifacts text and ticked list ids) is saved to `chrome.storage.session` on every change and restored on open. New `src/core/shareDraft.ts` (`parseShareDraft`, `restoreSelection`, pure and unit-tested in `tests/shareDraft.test.ts`); `loadShareDraft`/`saveShareDraft` in `src/lib/storage.ts`. In `ShareView.tsx`, `ShareView` now only loads the draft and renders `ShareForm` (the old body) with it as `initial`, so the first state is the restored one. The "default selection changed" effect no longer runs on mount (it used to overwrite restored ticks), and the save effect skips its first run so untouched defaults aren't stored as a choice. `Preview.start` clears the draft once `send('start')` succeeds, so the next form is empty with defaults ticked. Deleted lists are dropped from restored ticks. README 'Pick artifacts and lists' updated.
- **Verified:** `npm run check` (122 unit tests) and `npm run e2e` (40 specs) pass. New `e2e/F005.spec.ts` (5 tests): typed links and ticks return after a reload (including unticking everything); a deleted list isn't ticked; after a run and Start a new share the form is empty, also after a reload; a reopened untouched form still follows a changed default; a restored draft isn't overwritten by the tab's artifact (F003 prefill). feature-verifier: PASS on its second run (the first was a FAIL only because Bash was refused).
- **State:** F005 passes. 13 features left (F006–F018).
- **Next:** F006, keep a list being typed or edited (new-list form, an edited saved list, the inline form in Share) and which tab was open. Reuse the `shareDraft` pattern: pure parse in `src/core`, session-storage helpers in `src/lib/storage.ts`, load before mounting, skip the first save. `ListForm` already reports `onDraftChange`.
- **Notes:**
  - 'Close the popup' in e2e is `panel.reload()`. Wait for the draft to be in `chrome.storage.session` (poll `storedDraft(panel)` in F005) before reloading rather than sleeping.
  - Known small gap: the draft is cleared after `send('start')` resolves; if the popup closed in that gap, a stale draft would come back after the next Start a new share. Clearing earlier would lose the draft if the send failed, so left as is.
  - One full e2e run had a one-off F002 real-popup failure that didn't repeat (3 isolated runs and 2 more full runs passed). Watch for flakiness there under load.
  - Shell heredocs and `sed -i` are refused in this environment; use Edit.

### 2026-11-12 · F004 · Confirmations are shown inside the popup

- **Did:** Added `src/ui/useConfirm.tsx` (`useConfirm()` returns `{ ask, dialog }`; `ask` resolves true/false) and `src/ui/ConfirmDialog.tsx` (a modal `<dialog role="alertdialog">`: Cancel is focused, Escape cancels, danger styling via `.confirm` in `styles.css`). Replaced the three `window.confirm` calls: delete list (`ListForm`), Send (`ShareView` Preview), discard a stopped run (`RunView`). The `panel` fixture no longer auto-accepts dialogs: it dismisses any native `dialog` event and fails the test; it also exports `confirmation(page)` and `answer(page, name)`. Existing specs that click Send (smoke, F001, share-ux-fixes F013–F017) now answer the in-popup confirmation; F016/F017 assert on it instead of counting dialogs. New `e2e/F004.spec.ts` covers the three confirmations with Cancel, Escape and confirm.
- **Verified:** `npm run check` (109 unit tests) and `npm run e2e` (35 specs) pass. feature-verifier: PASS.
- **State:** F004 passes. 14 features left (F005–F018).
- **Next:** F005, keep the Share form draft (artifacts typed, lists ticked) across popup closes. `useConfirm` is reusable for F014 (Remove in Manage access): `answer(page, 'Remove')`.
- **Notes:**
  - The dialog's text has no separator between title and detail, so assert them with two `toContainText` calls.
  - Both buttons in a confirmation can share a name with a button behind it ('Delete', 'Send'); scope to `confirmation(page)` / `answer`.
  - oxlint prints a pre-existing 'Unused oxlint-disable directive' warning at `ShareView.tsx:70`; not from this feature.
  - The `useConfirm` hook lives in its own file because oxlint's only-export-components rule warns when a component file also exports a hook.

### 2026-11-12 · F003 · The popup picks up the artifact in the tab it was opened over

- **Did:** No `src/` change: `ShareView.tsx` already prefilled Artifacts from the active tab (`currentTabArtifact`) and had `+ Current tab` from the side-panel days, and `chrome.tabs.query({ active, lastFocusedWindow })` works the same from a popup. The session added `e2e/F003.spec.ts` (artifact tab: prefill, `+ Current tab` once, no duplicate on a second click; non-claude.ai page: empty and the 'not a claude.ai artifact' error; claude.ai home page: same; and the **real action popup** opened over a cowork tab, prefilled). Moved the CDP real-popup helper out of `e2e/F002.spec.ts` into `e2e/realPopup.ts` (`openRealPopup(context)` returns an `evaluate(expression)`), and F002 now uses it. The helper evaluates with `awaitPromise: true`.
- **Verified:** `npm run check` (109 unit tests) and `npm run e2e` (32 specs) pass. Mutation checks: removing the prefill, and removing the dedupe in `addCurrentTab`, each fail F003 tests 1 and 4. feature-verifier: PASS (its first run was a FAIL only because Bash was refused; the second ran everything).
- **State:** F003 passes. 15 features left (F004–F018).
- **Next:** F004, in-popup confirmations instead of `window.confirm` (delete a list, send, discard a stopped run). Remove the `dialog` auto-accept from the `panel` fixture for those specs once the confirmations are in-popup; existing specs that rely on it (smoke, share-ux-fixes F016/F017) will need updating to click the new buttons.
- **Notes:**
  - To wait for an async handler before a negative assertion, query `chrome.tabs` yourself and wait a frame (in the real popup, `evaluate` awaits promises). Don't use fixed sleeps.
  - The non-artifact cases use the popup page as a tab (another tab is active); only the artifact case uses the real popup.
  - Tool permissions in this session refused compound shell commands, `sed -i` and `git checkout`; use Edit for file changes.

### 2026-11-12 · F002 · The popup is laid out like other extensions' popups

- **Did:** `App.tsx` now renders `.popup` > `.popup-top` (header + tabs, fixed), `.popup-body` (both tab panels, the only scroller) and a `<footer className="footer">`. Removed the 'Close ArtiShare' button (and the `CloseIcon` import there). The loading and error states use the same shell. `styles.css`: `html { width: 380px }`, `.popup { max-height: 600px }` as a flex column, `.popup-body { overflow-y: auto; overflow-x: hidden; overflow-wrap: anywhere }`; `.popup-top` and `.footer` are also `position: sticky` as a fallback, see Notes. The old `.panel` rule is gone.
- **Verified:** `npm run check` (109 unit tests) and `npm run e2e` (28 specs) pass. New `e2e/F002.spec.ts` has five tests: 380 × ≤600 with three expanded lists, and header, tabs and footer boxes unchanged after scrolling the body; a short popup (empty Lists tab) with the footer right under the content; a 122-character address, a 110-character artifact ID and a 110-character list name with zero horizontal overflow; no close button and the Tab order; and a measurement of the **real action popup** over CDP. feature-verifier: PASS (its first run was a FAIL only because it could not run node, so the real-popup check moved into the spec).
- **State:** F002 passes. 16 features left (F003–F018).
- **Next:** F003, pick up the artifact in the tab the popup was opened over (`+ Current tab`, and prefill Artifacts). Check what `ShareView` already does with the active tab from the side panel days, since a popup opened over a tab no longer has a "sidebar next to the page".
- **Notes:**
  - The headless Chromium window gives the real popup only about 498 px, not 600, and the popup's `innerWidth` is then 395 (380 + a 15 px scrollbar Chrome reserves when content is taller than the window). The 410 the earlier verifier saw was probably the same thing. The page itself is exactly 380 wide with no horizontal overflow; the spec accepts `innerWidth` 380–395. With a 600 px window it should be 380.
  - Because the window can be shorter than 600 px, the header and footer are sticky: if the window is short the document scrolls as a whole and they stay in view. The real-popup test checks the footer is in view but doesn't scroll the real popup.
  - In the e2e `panel` tab the popup.html target and the real popup share a URL. The real-popup test navigates the tab to `about:blank` first, so the only `popup.html` target is the real one. Playwright's `CDPSession` has no per-target sessions, so it uses `Target.attachToTarget` with `flatten: false` and `Target.sendMessageToTarget` from `browser.newBrowserCDPSession()`. Reusable for later real-popup checks.
  - The header has nothing focusable, so Tab goes tabs → form.
  - `npx oxlint` warns about an unused `oxlint-disable` in `ShareView.tsx:69` (pre-existing, not an error).

### 2026-11-12 · F001 · The toolbar icon opens a popup instead of the side panel

- **Did:** `git mv src/entrypoints/sidepanel src/entrypoints/popup`, so WXT sets `action.default_popup: popup.html`. Removed `sidePanel` from the permissions in `wxt.config.ts` (the `key` is untouched) and the `chrome.sidePanel.setPanelBehavior` call in `background.ts`. Set `body { width: 380px }` in `src/ui/styles.css`, since a popup is sized from its content. Comments in styles.css, messages.ts, configController.ts, App.tsx and tests/configController.test.ts now say popup. The `panel` fixture in `e2e/fixtures.ts` opens `popup.html`. New `e2e/F001.spec.ts` has three tests: the manifest (default_popup, no side_panel or sidePanel, extension ID still the key-pinned `eeihicglfclmofckclcpjleekpddjflg`); `chrome.action.openPopup()` from the worker, then `chrome.runtime.getContexts` lists one POPUP at `/popup.html` and no SIDE_PANEL; and header, account, tabs and version plus list → preview → send → 'Share finished: 1 invited'.
- **Verified:** `harness/init.sh` at start. `npm run check` (109 unit tests) and `npm run e2e` (23 specs: 3 new, plus smoke and e2e/share-ux-fixes/) pass. feature-verifier: PASS. It also opened the real action popup over CDP and ran a whole share in it.
- **State:** F001 passes. 17 features left (F002–F018).
- **Next:** F002, the popup layout. Pin the header and tabs, scroll only the content (max 600 px tall), pin the footer, stop long addresses and links from scrolling sideways, and remove the 'Close ArtiShare' button from `App.tsx`. The verifier saw the real popup's innerWidth at 410 against the 380 px body, so check for extra margin or a scrollbar gutter.
- **Notes:**
  - Playwright doesn't expose an action popup as a page; `context.waitForEvent('page')` never fires. Use `chrome.runtime.getContexts({ contextTypes: [chrome.runtime.ContextType.POPUP] })` from the worker, or the `panel` fixture (the popup page in a tab).
  - In the real popup, Send still uses `window.confirm`, and Chrome showed it without closing the popup in the verifier's run. F004 replaces those dialogs anyway.
  - README, store listing, docs/ and CLAUDE.md still say side panel; F017 updates them.

### 2026-11-12 · Planning · Popup instead of side panel, and Manage access

- **Did:** Planned a new goal on `harness/popup-and-manage-access` (from `develop`), replacing the finished share-ux-fixes list (all 18 passed and merged in PR 13). 18 features, F001–F018. Nothing built.
- **Goal:** Turn the side panel into a toolbar popup laid out like other extensions' popups, keep drafts and runs safe when it closes, and add a secondary 'Manage access' view to change or remove people already invited to the artifact you're on.
- **Decisions (from the user):**
  - **Popup only.** No side panel, no 'Open in side panel' or 'open in a tab' fallback. Drop the `sidePanel` permission and `setPanelBehavior` in `background.ts`; keep the manifest `key` untouched. WXT makes `src/entrypoints/popup/` the `default_popup`; moving `sidepanel/` there is the expected route.
  - **Manage access is secondary.** The user wants it available "when the user is at the artifact page", but "not a core feature so don't confuse user about it". So: a small link shown only when the active tab is an artifact, never a third tab or a primary button.
- **Research (popup patterns):** Grammarly (the user's reference screenshot), 1Password, Bitwarden: a narrow popup (~360–400 px, Chrome caps popups at 800×600) with a fixed header (brand, account), a scrolling body, and a footer; settings that need room go elsewhere, but the user chose popup only. Two popup traps drive F004–F009: a popup closes (and its JS stops) as soon as it loses focus, and `window.alert`/`confirm` in a popup can take focus and close it. Hence in-popup confirmations, and drafts, the preview and the open tab saved to storage (`chrome.storage.session` is a reasonable home for drafts; the run is already in `chrome.storage.local`).
- **Housekeeping:** The previous goal's specs moved from `e2e/F0xx.spec.ts` to `e2e/share-ux-fixes/` so the new F001–F018 specs don't collide with them. They are regression tests: keep them passing.
- **Risky areas:**
  - F001 moves every e2e spec to the popup page. The `panel` fixture can keep its name; only the URL changes. The current-tab trick in F003's spec (bring the claude.ai page to front, reload the panel tab) should keep working.
  - F008: Preview is a `send('preview')` round trip; if the popup closes, the reply is lost. The background probably has to store the preview (or the popup re-sends it on open).
  - F011: PATCH/DELETE `/api/frame/invite/{uuid}/{inviteId}` come from reading the Share menu's code (`docs/claude-share-api.md`), not from a live check. Error messages in F011's steps are the target wording. `Sharee` has no invitation id today; `listSharees` has to carry it. A human must try change and remove on a real artifact before release; sessions must never call the real endpoints.
  - F010 adds fake rules (`Shared` artifacts seeded with three invitees, `locked…` refuses change/removal, `Missing` fails to list). Keep the rules comment at the top of `fakeShareClient.ts` and the README list in step.
- **Next:** `/harness-work` takes F001.

### 2026-11-11 · F007 · The name placeholder stays fixed; the automatic name appears once saved (reworked at the user's request)

- **Did:** The user asked to drop the live preview of the automatic name in the List name placeholder and keep the normal one. F007's description and steps were changed to match (with the user's approval). `src/ui/ListForm.tsx`: the placeholder is always 'List name, e.g. Acme clients'; saving with an empty name still uses the automatic name, which then shows in the list's name field. `e2e/F007.spec.ts` rewritten; README 'Make a list' updated.
- **Verified:** `npm run check` (108 unit tests) and `npm run e2e` (19 specs) pass. feature-verifier: PASS (also checked the Share tab's inline form, a reload, and that nothing else previews the name).
- **State:** F007 passes. All 18 features pass.
- **Next:** Open a PR from `harness/share-ux-fixes` into `develop`. A human should still try Preview on a real cowork artifact link.

### 2026-11-11 · F011 · Empty or invalid lists can't be saved (step reworded by the user)

- **Did:** The user approved rewording F011's steps from `not-an-email` to `not@an-email`, since `parseEmails` ignores tokens without an `@` on purpose (names, CSV headers). No code change: `ListForm.submit` and `ShareView.runPreview` already refuse empty and invalid lists, and `e2e/F011.spec.ts` already used `not@an-email`.
- **Verified:** `npm run check` (108 unit tests) and `npm run e2e` (19 specs) pass. feature-verifier: PASS (ran both suites, `--repeat-each=3` on F011, plus extra edge cases: name only, whitespace, error clears after fixing).
- **State:** F011 passes. All 18 features pass.
- **Next:** The user asked to drop the placeholder preview of the automatic name (F007), so F007 is reworked next.

### 2026-11-11 · F011 · Still blocked on a human (nothing built)

- **Did:** Nothing in the code. Re-checked why F011 can't be flipped: step 3 says to enter `ana@example.com` and `not-an-email` and expect 'Fix or remove the invalid addresses: not-an-email'. `parseEmails` (`src/core/emails.ts`) ignores any token without an `@` on purpose (names and CSV headers), so `not-an-email` is not reported and that list saves. Only a token with an `@` that isn't a valid address (e.g. `not@an-email`) is listed as invalid.
- **Verified:** `harness/init.sh`: baseline OK (`npm run check`, 19 e2e specs pass, including `e2e/F011.spec.ts`). No verifier run: the step as written can't be made to pass without changing either the parser or the step.
- **State:** F011 passes false. 17 of 18 features pass; the feature list was not touched.
- **Next:** A human decides: reword the step to `not@an-email` (then a session only needs a feature-verifier PASS and to flip `passes`), or change the parser to report tokens without `@`, which would break the CSV/name handling. Otherwise the branch is ready to merge into `develop` through a PR.

### 2026-11-11 · F018 · README and API notes describe the new behaviour

- **Did:** `README.md`: 'Make a list' says `*` marks required fields (only Email addresses) next to the existing optional-name text; 'Pick artifacts' marks Artifacts required and says pasted links and + Current tab both work for plain, chat and cowork `?artifact=` links; the Preview and Watch it run sections mention the copy button (Copied / Couldn't copy); the run section describes the finished message, 'Start a new share' with focus in Artifacts, and the confirmation for a stopped run with invites left. 'New share' is now 'Start a new share' in the flowchart and the text. `docs/claude-share-api.md` lists the `claude.ai/cowork/{session}?artifact={uuid}` form beside the chat form.
- **Verified:** `harness/init.sh` at start; `npm run format` then `npm run check` (108 unit tests, Prettier clean). No code changed, so `npm run e2e` was not re-run after the edit. feature-verifier: PASS (checked each claim against the source and ran `npm run check` itself).
- **State:** F018 passes. F011 is the only feature still false, blocked on a human.
- **Next:** A human should settle F011: reword the `not-an-email` step to an address with an `@` (e.g. `not@an-email`; code and spec are green), then a session can flip it after a verifier PASS. Nothing else is left; then the branch can be merged into `develop` through a PR.
- **Notes:** The API doc says the chat form was checked in November 2026 and that the cowork form is parsed the same way; the cowork link has not been checked against live claude.ai by this harness. The README screenshots weren't regenerated.

### 2026-11-11 · F017 · A stopped run with invites left asks before it is discarded

- **Did:** Added `e2e/F017.spec.ts` only; no source change, since `RunView.startNew` already confirms when `pending > 0`. The spec removes the fixture's accept-all dialog handler and records dialogs itself. Five addresses, Send, Stop after the first invite: asserts Stopped, '… left', Resume primary and Start a new share not primary. Dismiss: the dialog says 'Discard this run?', the stopped run and Resume stay (also after a panel reload). Accept: fresh Share form, Artifacts empty and focused. Then a run of five `fail*` addresses stops after the last one (five failures in a row) with nothing pending and no Resume; Start a new share goes straight to the form with no dialog.
- **Verified:** `harness/init.sh` at start; `npm run check` (108 unit tests) and `npm run e2e` (19 specs) pass; the F017 spec also passed with `--repeat-each=4`. feature-verifier: first run had Bash denied (FAIL for lack of evidence only); second ran both suites itself and returned PASS.
- **State:** F017 passes. F011 still false (blocked on a human). 1 feature left besides F011: F018.
- **Next:** A human should still settle F011 (reword `not-an-email` to an address with an `@`; code and spec are green). Otherwise take F018: the README and `docs/claude-share-api.md` updates (optional list name and automatic name, `*` markers, cowork links and + Current tab, copy button, 'Start a new share' replacing 'New share' in the text and the flowchart around lines ~40 and ~114). Finish with `npm run check` for Prettier.
- **Notes:** A 'stopped with nothing left' run is reachable in the fake with five `fail*` addresses (the consecutive-failure stop fires on the last item). A second dialog listener doesn't override the fixture's accept: use `panel.removeAllListeners('dialog')` first.

### 2026-11-11 · F016 · 'Start a new share' after a finished run opens a fresh Share form with focus in Artifacts

- **Did:** The fresh form itself already worked (clearing the run unmounts `RunView` and remounts `ShareView`, which starts empty with the default selection and the current tab's artifact); the missing piece was focus. `App` (`src/entrypoints/sidepanel/App.tsx`) holds `focusArtifacts`, set by `RunView`'s new `onStartNew` prop before the clear is sent (and reset if the clear fails); `ShareView` takes `focusArtifacts` and focuses `#artifacts` when it mounts. A plain panel open doesn't steal focus. `RunView.act` now returns whether it succeeded. New `e2e/F016.spec.ts`: two lists with only Alpha ticked by default, Beta ticked by hand for the run, finish a run, click Start a new share; asserts no dialog, Artifacts empty and focused, Alpha ticked / Beta not, no alert/preview/finished message, then a second run completes.
- **Verified:** `harness/init.sh` at start; `npm run check` (108 unit tests) and `npm run e2e` (18 specs) pass. feature-verifier: PASS (ran both suites itself).
- **State:** F016 passes. F011 still false (blocked on a human). 2 features left besides F011: F017, F018.
- **Next:** A human should still settle F011 (reword `not-an-email` to an address with an `@`; code and spec are green). Otherwise take F017: stopped run with pending invites asks before discarding, Cancel keeps it resumable, nothing-left skips the confirmation. `startNew` already has the confirm logic; mostly an e2e spec (dismiss the dialog with `page.once('dialog', d => d.dismiss())`; the `panel` fixture accepts dialogs by default).
- **Notes:** In e2e, a controlled checkbox in the Lists tab only flips after the config save returns, so `locator.check()` fails ("did not change its state"); use `click()` then `expect(...).toBeChecked()`. Closed `<details>` list forms stay in the DOM, so labels match twice: filter `{ visible: true }`.

### 2026-11-11 · F015 · A finished run says so and offers one primary 'Start a new share'

- **Did:** `RunView` (`src/entrypoints/sidepanel/RunView.tsx`): when `status === 'completed'`, the run card starts with an `<output class="alert ok">` reading 'Share finished: 1 invited, 1 failed' (failed/skipped only when non-zero), and the chips row is hidden (the message carries the same counts). The old 'New share' button is now 'Start a new share' in every non-running state; it is `primary block` (filled, full width) only when finished, so a stopped run keeps Resume as its primary action. `.alert.ok` (with `display:block`, since `<output>` is inline) in `src/ui/styles.css`. New `e2e/F015.spec.ts`: ana + fail → Done; exact message text, first child of the card, one button in the card with class primary, nearly card-wide, background differs from a plain button; same after `panel.reload()`.
- **Verified:** `harness/init.sh` at start; `npm run check` (108 unit tests) and `npm run e2e` (17 specs) pass. feature-verifier: first run had Bash denied (FAIL for lack of evidence only); second ran both suites itself and returned PASS.
- **State:** F015 passes. F011 still false (blocked on a human). 3 features left besides F011: F016–F018.
- **Next:** A human should still settle F011 (reword `not-an-email` to an address with an `@`; code and spec are green). Otherwise take F016: 'Start a new share' after a finished run must land on a fresh Share form with focus in the Artifacts field, Artifacts empty (or the current tab's artifact), Share with ticked per the default selection, no preview/error. Check what `clear` does in `runManager` and how `ShareView` resets on remount; focus is probably the missing piece.
- **Notes:** Lint (jsx-a11y) rejects `role="status"` on a `<p>`, hence `<output>`. `startNew` already keeps the `window.confirm` only when invites are pending, which is F017's behaviour (its e2e is still to write). README still says 'New share' (README line ~40 flowchart and ~114); F018 covers it.

### 2026-11-11 · F014 · Copy button says "Couldn't copy" when the clipboard refuses

- **Did:** `CopyLinkButton` (`src/entrypoints/sidepanel/viewComponents.tsx`) now has three states, idle / copied / failed. A rejected copy (both the async API and the `execCommand` fallback) shows a close icon with the accessible name and tooltip "Couldn't copy" for 2 s, then reverts to 'Copy link'; `.copy-btn.failed` in `src/ui/styles.css` colours it with `--err`. New `e2e/F014.spec.ts` makes `navigator.clipboard.writeText` reject and `document.execCommand` return false, then checks the Preview button (name, title, class, revert timing), that the link still has its `href`/`target=_blank`, that Send still completes ('2 invited'), and that the run view's button reports the failure too.
- **Verified:** `harness/init.sh` at start; `npm run check` (108 unit tests) and `npm run e2e` (16 specs) pass. feature-verifier: PASS (ran both suites itself).
- **State:** F014 passes. F011 is still false (blocked on a human). 4 features left besides F011: F015–F018.
- **Next:** A human should still settle F011 (reword the `not-an-email` step to an address with an `@`; code and spec are green). Otherwise take F015: when a run finishes, the run view says it's finished and offers one primary full-width 'Start a new share' button (see `RunView` in `src/entrypoints/sidepanel/`).
- **Notes:** The failure state reuses `CloseIcon`; no new icon. No unit test: the logic is UI state only, covered by e2e. The README doesn't mention the copy button yet; F018 covers that.

### 2026-11-11 · F013 · Copy button beside each artifact link in the run view

- **Did:** Added `e2e/F013.spec.ts` only. It saves a list (ana + slow), previews two artifacts, sends 4 invitations, and while the run is Running clicks the first row's 'Copy link' (asserts 'Copied', that Running is still shown, the pasted clipboard equals the first link, and the link's `href`/`target=_blank`). After Done ('4 invited') it clicks the second row's button, asserts the pasted clipboard equals the second link and that it reverts to 'Copy link'. No source change: `RunView` already renders the shared `ArtifactLink` (F012).
- **Verified:** `harness/init.sh` at start; `npm run check` (108 unit tests) and `npm run e2e` (15 specs) pass. feature-verifier: the first run had Bash denied and returned FAIL for lack of run evidence only (its static review found nothing wrong); the second ran both suites itself and returned PASS.
- **State:** F013 passes. F011 is still false (blocked on a human, see below). 5 features left besides F011: F014–F018.
- **Next:** A human should still settle F011 (reword the `not-an-email` step to an address with an `@`; code and spec are already committed and green). Otherwise take F014: make the copy button show 'Couldn't copy' when the clipboard write fails (today a failed copy silently stays 'Copy link'; see `CopyLinkButton` in `src/entrypoints/sidepanel/viewComponents.tsx`). In e2e, make `navigator.clipboard.writeText` reject; note the `execCommand('copy')` fallback also has to fail for the error state to show.
- **Notes:** The 'Running' window relies on the fake's one-time 1 s rate-limit backoff for `slow@…`, so the spec uses a `slow` address on purpose. The verifier agent is often denied Bash on its first run: re-run it.

### 2026-11-11 · F012 · Copy button beside each artifact link in the Preview

- **Did:** `ArtifactLink` (`src/entrypoints/sidepanel/viewComponents.tsx`) is now an `.artifact-row` holding the unchanged link plus a new `CopyLinkButton` (`aria-label`/title 'Copy link', 'Copied' with a check icon for 2 s, then back; timer cleared on unmount). It copies with `navigator.clipboard.writeText` from the click, falling back to `execCommand('copy')`, so the manifest is unchanged (no clipboardWrite). `CopyIcon`/`CheckIcon` in `src/ui/icons.tsx`, `.artifact-row` and `.copy-btn.copied` in `styles.css`. `e2e/F012.spec.ts`: two artifacts, each button copies its own link (checked by pasting into a probe textarea), 'Copied' state and check icon, revert timing, link `href`/`target=_blank`, and no clipboard permission in the built manifest.
- **Verified:** `harness/init.sh` at start; `npm run check` (108 unit tests) and `npm run e2e` (14 specs) pass. feature-verifier: the first run had Bash denied and gave no verdict; the second (with my command output in the prompt) ran both suites itself and returned PASS.
- **State:** F012 passes. F011 is still false (blocked, see the entry below). Because the run view shares `ArtifactLink`, it already shows the copy button, so F013 probably needs only an e2e spec (and a check of the run view layout).
- **Next:** A human should settle F011 (reword the `not-an-email` step to an address with an `@`, or decide otherwise). Otherwise take F013: add `e2e/F013.spec.ts` for the run view, while the run is going and after it finishes.
- **Notes:** E2E runs against `.output/chrome-mv3-fake`, so run `npm run e2e` (which rebuilds), not bare `npx playwright test`, or you test a stale bundle. Playwright can't grant clipboard permission to a `chrome-extension://` origin and `readText` needs one, so the spec pastes with Ctrl/Cmd+V into a probe textarea; wait for 'Copied' before pasting, since the copy is async. A failed copy silently leaves the button as 'Copy link'.

### 2026-11-11 · F011 · Empty or invalid lists still can't be saved (BLOCKED on a human decision)

- **Did:** `ShareView.runPreview` now also submits the inline form when it is showing, empty, and nothing is ticked, so Preview shows 'Add at least one email address.' (before, it said 'Tick a list, or create one.' because an empty form is not a draft). Added `e2e/F011.spec.ts`: empty Save list → 'Add at least one email address.'; `ana@example.com` + `not@an-email` → 'Fix or remove the invalid addresses: not@an-email'; no list created; the same two cases through Preview in the Share tab, which doesn't preview and saves nothing.
- **Verified:** `npm run check` (108 unit tests) and `npm run e2e` (12 specs) pass. I did not run the feature-verifier: it would rightly FAIL the literal step below.
- **State:** F011 passes **false**. The code and spec are committed and green, but one step can't be met as written.
- **Next:** A human decides about the step "enter ana@example.com and not-an-email … See 'Fix or remove the invalid addresses: not-an-email'". `parseEmails` (`src/core/emails.ts`) deliberately ignores every token without an `@` (CSV headers and names; tested in `tests/emails.test.ts`), so `not-an-email` is silently dropped and the list saves with just ana. Either reword the step to use an address with an `@` (e.g. `not@an-email`, which my spec uses), or decide that plain words should count as invalid, which would break pasting CSVs with headers. If the step is reworded, the next session can flip F011 to true after a verifier PASS (no more code needed); otherwise take F012.
- **Notes:** The empty-form Preview error shows inside the inline form (its own `.alert`), not in the Share tab's alert. With saved lists ticked, an empty open form still previews them as before.

### 2026-11-11 · F010 · Preview saves an unnamed inline list under its automatic name

- **Did:** Added `e2e/F010.spec.ts` only: saves 'Existing team' in the Lists tab (so the Share tab's inline form sits behind + New list), unticks it in Share, adds an artifact link, opens + New list, leaves the name empty, enters ana + bo, clicks Preview. Asserts the preview header (`.row .hint.truncate`) is `ana@example.com & bo@example.com`, no `.alert`, and after Back that the new list is the one ticked pick, 'Existing team' is not, and the Lists tab has 2 lists, the new one '2 people · Can view'. No source change: `ShareView.runPreview` already calls `form.submit()` for a draft, which applies the automatic name (F006/F008).
- **Verified:** `harness/init.sh` at start; `npm run check` (108 unit tests) and `npm run e2e` (11 specs) pass. feature-verifier: PASS (ran both suites itself).
- **State:** F010 passes. 8 features left.
- **Next:** F011 (a list with neither a name nor addresses, or with invalid addresses, still can't be saved). Likely mostly an e2e spec; check the error messages in `ListForm.submit`.
- **Notes:** With no saved lists the inline form is already shown in the Share tab and there is no + New list button, so the spec creates a list first.

### 2026-11-11 · F009 · Clearing the name of a saved list renames it after its addresses

- **Did:** Added `e2e/F009.spec.ts` only: makes 'Design team' (ana + bo, Commenter), opens it in the Lists tab, clears the name, clicks Save, and asserts the new name `ana@example.com & bo@example.com`, no `.alert`, and that addresses, permission ('2 people · Commenter') and the list count are unchanged. No source change: `ListForm.submit` already does this (F006/F008, `baseline.id` is passed as `exceptId`).
- **Verified:** `harness/init.sh` at start; `npm run check` (108 unit tests) and `npm run e2e` (10 specs) pass. feature-verifier: the first run returned FAIL only because Bash was denied (it found no fault in the feature); the second run could use Bash, ran both suites itself and returned PASS.
- **State:** F009 passes. 9 features left.
- **Next:** F010 (in the Share tab, an unnamed new list typed in the inline form is saved with its automatic name on Preview). Check how `ShareView` calls `form.submit()` and that the name numbering applies there.
- **Notes:** The spec doesn't reload the panel to prove the rename persisted in storage; the card re-renders from the saved config after the `save-list` round trip.

### 2026-11-11 · F008 · An automatic name never clashes; a name of only spaces counts as empty

- **Did:** `uniqueListName(config, base, exceptId)` in `src/core/config.ts` returns `base`, or `base (2)`, `base (3)`, … (first free, case-insensitive). `ListForm.submit` uses it only when the typed name is empty after trimming, so only hand-typed names can raise 'A list called "…" already exists.' (the 'Type a name to tell them apart.' hint from F006 is gone). Unit tests in `tests/config.test.ts`, new `e2e/F008.spec.ts` (`(2)`, `(3)`, spaces-only name, typed clash still errors), and README's "Name it" line mentions the numbering. `e2e/F006.spec.ts`'s last step asserted the old duplicate error; it now expects `ana@example.com (2)` (and 5 lists), since F008 supersedes it.
- **Verified:** `harness/init.sh` at start; `npm run check` (108 unit tests) and `npm run e2e` (9 specs) pass. feature-verifier: the first run had Bash denied and gave no verdict; the second returned PASS from a static read of the code and specs plus my reported test output (it did not run the suites itself).
- **State:** F008 passes. 10 features left.
- **Next:** F009 (clearing the name of an existing list and saving renames it after its addresses). The code path is already `ListForm.submit` with `baseline`, which passes `baseline.id` as `exceptId`; probably only an e2e spec is needed. Check the addresses and permission stay unchanged.
- **Notes:** The server-side `applyConfigChange` still rejects a clashing name, so a race with another window shows that error instead of numbering. The verifier agent is often denied Bash: re-run it and include the command output in the prompt.

### 2026-11-11 · F007 · The name placeholder previews the name the list will get

- **Did:** `ListForm` computes `namePlaceholder` (`useMemo` over `defaultListName(parseEmails(text).valid)`, falling back to 'List name, e.g. Acme clients') and uses it as the name input's placeholder. README's "Name it" line mentions the preview. Added `e2e/F007.spec.ts` (empty form, one address, two, duplicates dropped, cleared, typed name saved). No new unit test: the logic is `defaultListName`, already covered.
- **Verified:** `harness/init.sh` at start; `npm run check` (106 unit tests) and `npm run e2e` (8 specs) pass. feature-verifier: PASS on the second run (the first run had Bash denied and returned FAIL without judging the feature).
- **State:** F007 passes. 11 features left.
- **Next:** F008, the first failing feature in `harness/feature_list.json`.
- **Notes:** The placeholder also previews on edits of an existing list (harmless, since clearing the name renames it after its addresses, see F006).

### 2026-11-11 · F006 · A list saved without a name is named after its addresses

- **Did:** `defaultListName(emails)` in `src/core/config.ts` (one address → it; two → `a & b`; more → `a & b +N email(s)`, singular for 1). `ListForm.submit` parses the addresses first and uses that name when the name field is empty, so 'Give the list a name.' is gone. If the generated name is already taken the error adds 'Type a name to tell them apart.'. README's "Name it" line says the name is optional. Added a unit test in `tests/config.test.ts` and `e2e/F006.spec.ts`.
- **Verified:** `harness/init.sh` at start; `npm run check` (106 unit tests) and `npm run e2e` (7 specs) pass. feature-verifier: PASS.
- **State:** F006 passes. 12 features left.
- **Next:** F007 (the name field's placeholder shows the name the list will get). Reuse `defaultListName(parseEmails(text).valid)` in `ListForm`, falling back to 'List name, e.g. Acme clients' when there are no addresses.
- **Notes:** The generated name applies to edits too: clearing the name of an existing list and saving renames it after its addresses (no test covers this; the feature text only speaks of new lists). In e2e, saved lists render the same labels inside `<details>`, so scope the new-list form with `div.card`, and match names exactly with `.pick-name` (`ana@example.com` is a substring of `ana@example.com & bo@example.com`).

### 2026-11-11 · F005 · Required fields marked with *, list name labelled optional

- **Did:** New `src/ui/RequiredMark.tsx` (a red, `aria-hidden` ` *`; `.required-mark` in `styles.css`). `ListForm` labels are now `List name (optional)` and `Email addresses *`; `EmailInput` takes a `required` prop that sets `aria-required` on the textarea. `ShareView`'s Artifacts label gets the mark and its textarea `aria-required`. The inline + New list form and the Lists tab (new and existing) share `ListForm`, so they all change together. Added `e2e/F005.spec.ts`.
- **Verified:** `harness/init.sh` at start; `npm run check` (105 unit tests) and `npm run e2e` (6 specs) pass. feature-verifier: PASS.
- **State:** F005 passes. 13 features left. The README doesn't mention these labels, so it is unchanged.
- **Next:** F006 (a list saved without a name is named after its addresses). `ListForm.submit` still fails with 'Give the list a name.' for an empty name, even though the label now says optional: F006 is what makes that true. Also check `isNameTaken` for the generated names.
- **Notes:** The Artifacts label's text is `Artifacts *` followed by a space before the count badge, so assert it with `toHaveText` (normalises whitespace), not `textContent`. F002's `label[for="artifacts"] .count` selector still works.

### 2026-11-11 · F004 · + Current tab on a cowork session without an artifact

- **Did:** No source change: `addCurrentTab` already sets 'The current tab is not a claude.ai artifact.' and returns before touching the text when the parser rejects the tab's URL. Added `e2e/F004.spec.ts`: serves a bare cowork session page (no `?artifact=`) with `context.route`, brings it to the front, reloads the panel (Artifacts stays empty, no alert), types a valid artifact link, clicks + Current tab, then asserts the `p.alert` text and that the raw textarea value is still the typed link.
- **Verified:** `harness/init.sh` at start; `npm run check` (105 unit tests) and `npm run e2e` (5 specs) pass. feature-verifier: PASS (it ran both commands itself).
- **State:** F004 passes. 14 features left.
- **Next:** F005 (required `*` markers, list name labelled `List name (optional)`, `aria-required` on the addresses field). Touches `src/ui/ListForm.tsx` and the Share tab's Artifacts label; `e2e/smoke.spec.ts` and earlier specs use substring `getByLabel('List name')` / `getByLabel('Email addresses')`, which should still match, but `getByLabel(/Artifacts/)` and `label[for="artifacts"] .count` in F002/F003 need to keep working with a `*` added.
- **Notes:**
  - The alert is `p.alert`; the assertion on it waits for the async tab query, so a following raw-text assertion runs after the handler has finished.
  - Verifier's minor point, not fixed: the error text is the same for any non-artifact active tab, so F004 alone doesn't prove the cowork tab was the active one; F003's setup does.

### 2026-11-11 · F003 · + Current tab and panel open on a cowork tab

- **Did:** No source change: F001's parser already makes `currentTabArtifact()` work for cowork URLs. Added `e2e/F003.spec.ts`: it serves a cowork page with `context.route` (nothing reaches claude.ai), brings that tab to the front, reloads the panel and checks Artifacts is filled with the matching `claude.ai/artifact/…` link. Then it clears the field, clicks + Current tab (link added once, no error) and clicks again (raw textarea text is still the single link).
- **Verified:** `harness/init.sh` at start; `npm run check` (105 unit tests) and `npm run e2e` (4 specs) pass; F003 passes 8/8 with `--repeat-each=8`. Mutation check: with `addCurrentTab` temporarily always appending, F003 fails ('Received +1'); reverted. feature-verifier: PASS on the third run (the first FAIL found the double-click check vacuous; the second had no Bash and gave no real verdict).
- **State:** F003 passes. 15 features left.
- **Next:** F004 (+ Current tab on a cowork session with no `?artifact=` shows 'The current tab is not a claude.ai artifact.' and leaves the text unchanged). Reuse the route + `bringToFront()` + `panel.reload()` pattern from `e2e/F003.spec.ts`; the source probably already does it.
- **Notes:**
  - `addCurrentTab` awaits `chrome.tabs.query` before it sets state, so an assertion right after the click passes against the old value. Round-trip your own `chrome.tabs.query` and a `requestAnimationFrame` first (see F003), and assert the raw textarea value, not the de-duplicated `.count`.
  - The panel is a normal tab in e2e, so it only sees the claude.ai tab as active if you bring that tab to front and then reload the panel.
  - The verifier agent can be denied Bash and mutating source; if it says so, send it the command output or ask again.

### 2026-11-11 · F002 · Dedupe cowork links, reject bad ones

- **Did:** No source change: F001's parser already de-duplicates by artifact uuid and rejects cowork links without a valid `?artifact=` uuid. Added two unit tests to `tests/artifactUrl.test.ts` (cowork + `claude.ai/artifact` link count once; bare and `not-a-uuid` cowork links land in `invalid`) and the e2e spec `e2e/F002.spec.ts` (count 1 and one preview card for both links; the `Not artifact links: …` hint for each bad link).
- **Verified:** `harness/init.sh` at start; `npm run check` (105 unit tests) and `npm run e2e` (3 specs) pass. feature-verifier: PASS.
- **State:** F002 passes. 16 features left.
- **Next:** F003 (+ Current tab and opening the panel on a cowork tab). Needs an e2e that serves a claude.ai page with `context.route`, brings it to the front, then drives the panel page; the parser should already cover it.
- **Notes:** In the e2e, Back from the preview keeps the Artifacts text, so one spec can go on to the invalid cases.

### 2026-11-11 · F001 · Accept cowork artifact links

- **Did:** `parseArtifactRef()` in `src/core/artifactUrl.ts` now reads `?artifact={uuid}` on `cowork/` pages as well as `chat/` pages, mapping it to the matching `claude.ai/artifact/{base58}` link. Unit tests in `tests/artifactUrl.test.ts` (cowork equals chat for the same uuid; no `?artifact=` and a non-uuid are rejected); e2e spec `e2e/F001.spec.ts`.
- **Verified:** `harness/init.sh` at start; `npm run check` (103 unit tests) and `npm run e2e` (2 specs) pass. feature-verifier: PASS.
- **State:** F001 passes. 17 features left.
- **Next:** F002 (dedupe a cowork link with its `claude.ai/artifact` link, reject bad cowork links in the UI). The parser already does both, so F002 is mostly its e2e spec.
- **Notes:** The uuid `c0ffee00-1234-4abc-8def-000000000001` encodes to `QqHHsBLXBfYKJD5NqJ8PeY`. `project/` pages stay rejected. + Current tab uses the same parser, so F003 should mostly need its e2e spec (route a claude.ai page; nothing may reach claude.ai).

### 2026-11-11 · plan · Share UX fixes

- **Did:** Planned the goal on `harness/share-ux-fixes`: fix + Current tab for `claude.ai/cowork/{session}?artifact={uuid}` links, make list names optional (named after their addresses) with required fields marked `*`, add a copy button beside artifact links, and make starting a new share after a run obvious. 18 features (F001–F018), all `passes: false`.
- **Verified:** `harness/init.sh` passes on the new branch: typecheck, lint, format, unit tests, e2e smoke.
- **State:** Nothing built yet.
- **Next:** `/harness-work` takes F001.
- **Notes:**
  - **Cowork bug:** `parseArtifactRef()` in `src/core/artifactUrl.ts` only reads `?artifact=` on `chat/` paths, so cowork links return null. Accept `cowork/` too (keep rejecting `project/`, which a unit test pins). Whether a cowork artifact's uuid works with `/api/frame/...` like a chat one is unchecked: the fake can't tell. A human should Preview (read-only) a real cowork artifact before release.
  - **Current tab in e2e:** the panel is a normal tab, and `currentTabArtifact()` queries the active tab. Serve the claude.ai page with `context.route` (nothing must reach claude.ai), bring it to the front, then drive the panel page; Playwright clicks don't activate a tab.
  - **Automatic list name** (decision): first two addresses after de-duplication, in entered order. 1 → `a`, 2 → `a & b`, more → `a & b +N emails` (`+1 email` singular). On a clash append ` (2)`, ` (3)`… Store it as the list's name: the config schema doesn't change. Put the naming logic in `src/core/` with unit tests.
  - **Required markers:** `*` on Email addresses (list form) and Artifacts (Share tab); the name label becomes `List name (optional)`. `e2e/smoke.spec.ts` uses `getByLabel('List name')` and `getByLabel('Email addresses')`, which still match substrings.
  - **Copy button:** use `navigator.clipboard.writeText` from the panel's click. Don't add the `clipboardWrite` permission: a new permission makes Chrome disable the extension on update until users approve it. In e2e, grant `clipboard-read`/`clipboard-write` to read it back.
  - **New share** (my reading of "confusing"): the finished run's only action is a plain `New share` button among others. F015–F017 rename it `Start a new share`, make it primary and full-width when the run is finished, add a finished message, and keep the confirmation only for a stopped run with invites left. Ask the user if they meant something else.

### 2026-11-11 · setup · Harness set up

- **Did:** Added the long-running harness: `harness/` (feature list, this log, `init.sh`, `status.sh`, `run.sh`), the `/harness-plan` and `/harness-work` commands, the `feature-verifier` agent, and a Playwright smoke test of the core flow against the fake claude.ai (`npm run e2e`).
- **Verified:** `harness/init.sh` passes: typecheck, lint, format, unit tests, e2e smoke.
- **State:** No goal yet; the feature list is empty.
- **Next:** Run `/harness-plan <goal>` to turn a goal into features.
