# Harness progress

The memory between long-running sessions, together with `git log`. Newest entry first: each session adds one at the top of **Sessions** before it commits. See `CLAUDE.md` for the routine.

## Sessions

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
