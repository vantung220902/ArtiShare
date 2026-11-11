# Harness progress

The memory between long-running sessions, together with `git log`. Newest entry first: each session adds one at the top of **Sessions** before it commits. See `CLAUDE.md` for the routine.

## Sessions

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
- **Notes:** The uuid `e86b11e3-af91-40ad-8816-8deb3031e303` encodes to `VhbnVTrGFVnm271Ufg8VcW`. `project/` pages stay rejected. + Current tab uses the same parser, so F003 should mostly need its e2e spec (route a claude.ai page; nothing may reach claude.ai).

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
