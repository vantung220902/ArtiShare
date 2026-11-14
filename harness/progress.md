# Harness progress

The memory between long-running sessions, together with `git log`. Newest entry first: each session adds one at the top of **Sessions** before it commits. See `CLAUDE.md` for the routine.

## Sessions

### 2026-11-14 · F011 · Save to a list copes with a long list and with things changing while it's open

- **Did:** `src/ui/styles.css`: new `.action-bar` (sticky at the bottom of the scrolling body, opaque, spans the card) and `SaveToListView.tsx` puts Save/Cancel in it, so 45 checkboxes never push Save out of reach; the header was already fixed (only `.popup-body` scrolls). `ManageView.tsx`: an effect closes Save to a list when nobody unlisted is left (everyone saved in another window), focusing Back; before, `saving` stayed true and the form would have popped back open if a list was deleted later. Everything else in the steps (live drop-out of saved people, truncation with a tooltip, checkboxes not following a finished run, people without an id, owner never offered) already worked and is now covered by `e2e/F011.spec.ts` (9 tests): the 45 in order, header and bar while scrolling (popup), saving 45 as Crowd, the same at 320 px, long address cut with … and a tooltip, drop-out of one person (with a tick kept) and of all, a finished run leaving the boxes alone until Cancel and Refresh, and a person with no id plus a second owner entry.
- **Verified:** `harness/init.sh` OK at the start (191 e2e). `npm run check` (219 unit) passes. feature-verifier **PASS**, with `npm run e2e` at 200 passed.
- **State:** F011 passes true. 11 of 13 features pass. Only docs remain: F012, F013.
- **Next:** F012: README, store/listing.md and docs/index.html describe Use popup instead opening the popup and Manage access's lists and Save to a list, with an e2e spec reading the files (model it on `e2e/side-panel-mode/F017.spec.ts`). The README doesn't mention Save to a list yet.
- **Notes:** "In the popup" is tested by removing the `sidepanel` class from a side panel page at 380×700, because a popup page is itself the front tab and can't see an artifact; the CSS is the real popup CSS. `reshape` in the spec injects extra people into `sharees` replies (an id-less person, an owner entry, a very long address). Lint warns about one unneeded type assertion in `e2e/F011.spec.ts` (same pattern as F010).

### 2026-11-14 · F010 · Save to a list says why it can't save and keeps what I chose

- **Did:** New `add-to-list` change in `src/core/config.ts` (`{ id, emails }`): the background appends to the list as it is stored now, so another window's edit is kept; a deleted list rejects with 'This list no longer exists. It was deleted in another window.'. `SaveToListView.tsx`: adding now sends `add-to-list` instead of `save-list` with `expected`; the picked list is tracked by id and name (set when 'Add to an existing list' is chosen, so the implicit first list is watched too); if it is deleted elsewhere the drop-down drops it and shows 'Pick a list', an alert says 'The list "Team" no longer exists…', the button reads 'Add N people' and is disabled (with no lists left only New list remains); ticks, name and permission are kept. A `useRef` guard (`inflight`) stops a second click before `busy` renders. Errors clear when the choice changes. `plural` in `viewUtils.ts` takes an irregular plural: the drop-down said '3 addresss'. Unit tests in `tests/config.test.ts`; `e2e/F010.spec.ts` (9 tests): taken name, deleted list (drop-down, notice, pick another), deleted only list → New list, the background refusing a deleted list, change elsewhere kept (live and racing), failing `config-change` shows the reason and a second click retries (new list and add), double click saves once.
- **Verified:** `harness/init.sh` OK at the start (182 e2e). `npm run check` (219 unit) passes. feature-verifier **PASS**, with `npm run e2e` at 191 passed and F010 27 of 27 over 3 repeats. Non-blocking: lint warnings in `e2e/F010.spec.ts` (`__saves`/`__fail` underscore names, a few unneeded type assertions).
- **State:** F010 passes true. 10 of 13 features pass. Step 2 differs slightly from its wording: when the list is deleted the window already knows (live config), so the button is disabled with the notice instead of failing on click; the click-time refusal comes from the background and is covered by a test.
- **Next:** F011 (see the feature list); the e2e helpers in `e2e/F010.spec.ts` (`otherWindow`, `interceptSaves`) are reusable.
- **Notes:** To make `config-change` fail in e2e, replace `chrome.runtime.sendMessage` in the page (it is writable). `save-list` with `expected` is now only used by the Lists tab. The README doesn't mention Save to a list yet.

### 2026-11-14 · F009 · Save to a list: choose exactly who, back out by mouse or keyboard

- **Did:** `SaveToListView.tsx`: Enter in the Name field now saves (an `onKeyDown` on the input, since the view isn't a `<form>`; `submit` already ignores nobody-ticked and a second press, and the handler skips IME composition). `src/ui/styles.css`: a `:indeterminate` checkbox style with a `--dash` image (light and dark), because `appearance: none` left the mixed Select all looking empty. `e2e/F009.spec.ts` (9 tests): untick one (2 of 3, indeterminate, 'Save 2 people', placeholder), Select all on/off and the disabled save, saving just one person, Cancel (nothing saved, focus back on Save to a list, fresh on reopening), Back from the Share and the Lists tab, the keyboard-only flow with focus rings and Enter in Name, Enter with nobody ticked, the radios and List drop-down in tab order, and a reload mid-choice.
- **Verified:** `harness/init.sh` is blocked in this session (the permission prompt can't be answered headless), so I ran its steps by hand: `npm run check` (217 unit) and `npm run e2e` (173 passed) at the start. After the change `npm run check` passes. feature-verifier **PASS**, with `npm run e2e` at 182 passed.
- **State:** F009 passes true. 9 of 13 features pass.
- **Next:** F010: stale-list handling. The 'delete Team in another window then Add' case needs the drop-down to drop the deleted list and say so (today `target` silently falls back to the first list), the 'changed elsewhere' case should merge into the list as it is now (or ask to try again) rather than lose the other window's change, a failing `config-change` must show its reason and a second click retries, and the double click saves once (button already reads 'Saving…' and is disabled).
- **Notes:** The dash test only proves the indeterminate style applies (a `background-image` is set), not what it looks like. Keyboard order with lists saved: Select all, people, the checked radio (arrows switch between New list and Add to an existing list), then Name or List, Save, Cancel.

### 2026-11-14 · F008 · Save to a list can add the people to an existing list

- **Did:** `src/entrypoints/popup/SaveToListView.tsx`: when at least one list is saved, 'New list' / 'Add to an existing list' radios; the existing choice shows a **List** drop-down (`byName` order, options like 'Team (1 address)'), the line 'They'll get Team's permission (Can edit) when you share with Team. Their access to this artifact doesn't change.', and the button 'Add N people to Team'; Name and Permission are hidden then. It saves `mergeEmails(target.emails, chosen)` with the list's own permission via `save-list` with `expected` set to the list as the view read it. `onSaved` gets a third argument `added`, and `ManageView.tsx` says 'Added N people to X.' instead of 'Saved'. With no lists the radios aren't drawn. `e2e/F008.spec.ts` (3 tests). No new `src/core` logic, so no unit test.
- **Verified:** `harness/init.sh` OK at the start (170 e2e). `npm run check` (217 unit) passes. feature-verifier **PASS**, with `npm run e2e` at 173 passed.
- **State:** F008 passes true. 8 of 13 features pass.
- **Next:** F009: checkbox choices and Cancel are in already; it needs `e2e/F009.spec.ts` (indeterminate Select all, 0 of 3 disables save, save only one person, Cancel returns focus and saves nothing, keyboard-only flow incl. Enter in Name saving, closing mid-choice changes nothing). Check Enter in the Name field actually saves: `SaveToListView` has no `<form>`, so it likely doesn't yet. Also check the new radios and drop-down are in tab order with a visible focus ring.
- **Notes:** F010's stale-list case is half in place: a list deleted or changed elsewhere makes `save-list` reject with 'This list changed in another window…' and the view shows it, but the drop-down falls back to the first list automatically (`listId` not found) rather than telling the user, and nothing merges against the changed list yet. The verifier found no keyboard or conflict coverage in this spec (both belong to F009/F010).

### 2026-11-14 · F007 · Save to a list puts people in no list into a new list

- **Did:** New `src/entrypoints/popup/SaveToListView.tsx`: replaces the People with access card in place (heading focused, Back stays above), a ticked checkbox per unlisted person labelled 'address · permission', Select all (indeterminate when mixed), 'N of M selected', Name (placeholder `defaultListName` of the ticked addresses), Permission (preset to the one everybody has, else Can view, until the user picks), 'Save N people' (→ 'Saving…') and Cancel. Saves with `config-change` `save-list`, `expected: null`; an empty name gets `uniqueListName`; a clashing typed name or a failed save shows an alert and keeps the form. `ManageView.tsx` holds `saving`/`saved`, shows 'Saved N people to X.' with an **Open list** link (an `<output class="alert ok">`) on coming back, and returns focus to Save to a list after Cancel. `App.tsx` gives ManageView `onOpenList` (Lists tab + a `reveal` request); `ListsView.tsx` expands the revealed list. `sharedAccess` in `src/core/membership.ts` with a unit test. `e2e/F007.spec.ts` (5 tests).
- **Verified:** `harness/init.sh` OK at the start (165 e2e). `npm run check` (217 unit) passes. feature-verifier **PASS**, with `npm run e2e` at 170 passed.
- **State:** F007 passes true. 7 of 13 features pass. Cancel, Select all and the save error handling already exist (they were needed to make the view usable) but F009/F010 still need their own specs and keyboard/close checks.
- **Next:** F008: 'Add to an existing list' in `SaveToListView` (radio choices New list / Add to an existing list, a List drop-down in `byName` order with counts, the 'They'll get Team's permission…' line, 'Add N people to Team', appended after the existing addresses via `save-list` with `expected` set to the current list). `SaveToListView` takes `config` and `save` already.
- **Notes:** Two step texts disagree with the code's own rules, for a human to amend: the UI calls the level **'Commenter'**, not 'Can comment'; and F007 step 2/3 list the people in alphabetical order (commenter, locked, viewer) while the fake's People with access order is viewer, commenter, locked and F011 says 'in the order People with access shows them'. I sort the checkboxes alphabetically by address, which makes F007's examples (and the placeholder) true and still equals People with access order for the Crowded artifact. The Share form stays mounted (hidden) under Manage access, so e2e must scope `Name`/`Permission` lookups to the Save to a list section (`saveView` in `e2e/F007.spec.ts`). The verifier's nit: step 6 is tested on one artifact with a seeded clashing list rather than on a second artifact.

### 2026-11-14 · F006 · People with access offers to save people who aren't in any list

- **Did:** `unlistedNote(count)` in `src/core/membership.ts` ("N people aren't in any of your lists.", singular for 1). `ManageView.tsx` computes `unlisted` (people whose `inboxKey` is in no list; nobody until the config has loaded) and, when there are any, draws a quiet `<p className="hint">` with the note and a **Save to a list** button under the people. Unit test in `tests/membership.test.ts`; `e2e/F006.spec.ts` (5 tests: counts and singular and gone, reopened, empty artifact, Missing artifact, quiet styling).
- **Verified:** `harness/init.sh` OK at the start (160 e2e). `npm run check` (216 unit) passes. feature-verifier **PASS**, with `npm run e2e` at 165 passed.
- **State:** F006 passes true. 6 of 13 features pass. **The Save to a list button has no handler yet** (it is a plain `<button>` in `ManageView.tsx`); F007 wires it up.
- **Next:** F007: the Save to a list view that replaces People with access in place (checkboxes, Select all, New list with Name and Permission, save through `config-change` `save-list` with `expected: null`, then 'Saved N people to X.' with Open list). `unlisted` in `ManageView` is the list of people to offer; `defaultListName` is in the Lists tab code.
- **Notes:** F006's e2e drives the side panel page (as F005 does); both entrypoints share `ManageView`.

### 2026-11-14 · F005 · People with access shows which lists each person is in

- **Did:** New `src/core/membership.ts` (`listNamesByInbox` keyed by `inboxKey`, `membershipNote`: 'Not in a list' / 'In A, B' / 'In A, B +N'). `ManageView.tsx` reads `useConfig()` (live, so a list saved in another window updates rows at once) and `PersonRow` appends ' · <note>' to the status hint, with every list name in a `title` tooltip; nothing is shown while the config is still loading; the owner row is untouched. Unit tests in `tests/membership.test.ts`; `e2e/F005.spec.ts` (4 tests). `e2e/F004.spec.ts` now strips the ' · …' suffix when checking the Pending/Accepted statuses.
- **Verified:** `harness/init.sh` at the start: one unit test (`fakeShareClient`) and four e2e specs timed out on the loaded machine (load average 8–13) but all passed alone with `--workers=1`. `npm run check` (215 unit) passes; F004 and F005 6 of 6. feature-verifier: first run **FAIL** (list order), after the fix **PASS**, with `npm run e2e` at 159 passed and 1 load timeout (`side-panel-mode/F011`) that passes alone.
- **State:** F005 passes true. 5 of 13 features pass.
- **Next:** F006: when some people with access aren't in any list, offer to save them (the "N people aren't in any of your lists." note and the Save to a list button in `ManageView.tsx`). `listsByInbox` in `ManageView` already tells who isn't in a list.
- **Notes — two of F005's step examples contradict their own rules; for a human to amend the step text.** I followed the rules:
  - Step 3 says list names appear "in the Lists tab's order" but its example, 'In Team, Reviewers', is creation order. The Lists tab sorts by name (`byName` in `viewUtils.ts`), so Team + Reviewers reads **'In Reviewers, Team'**, and with Ops added **'In Ops, Reviewers +1'**.
  - Step 4 says to match "the way lists match them" (`inboxKey`), but its example has janedoe@gmail.com counting for jane.doe+work@gmail.com. `inboxKey` ignores `+tag`s on Gmail and keeps dots as written (claude.ai keeps separate invitations; checked November 2026), so the dotted address is **not** matched; janedoe+work@gmail.com is. Matching dots would call someone "In a list" while sending to that list invites them again.
  - To run a single e2e spec by hand, run `npm run build:fake` first; `npx playwright test` uses the stale `.output/chrome-mv3-fake`.

### 2026-11-14 · F004 · The fake claude.ai has a Crowded artifact with 45 people invited

- **Did:** `src/claude/fakeShareClient.ts`: new rule at the top (an id containing "Crowded" starts with `crowd01@example.com` … `crowd45@example.com`; odd numbers pending Can view, even numbers accepted comment), `FAKE_CROWDED_PEOPLE` and a `seedPeople(id)` helper replacing the inline Shared seed. Crowded wins if an id has both "Crowded" and "Shared". Unit tests added in `tests/fakeShareClient.test.ts` (the 45 people, change/remove still work, Shared and plain unchanged). `e2e/F004.spec.ts` (2 tests): Manage access over `ExampleCrowdedArtifact1` lists You (owner) then the 45 in order with their statuses and permissions; Shared and plain artifacts as before.
- **Verified:** `harness/init.sh` OK at the start (154 e2e). `npm run check` (211 unit) passes; F004 6 of 6 over 3 repeats. feature-verifier **PASS**, with `npm run e2e` at 156 passed.
- **State:** F004 passes true. 4 of 13 features pass.
- **Next:** F005: People with access shows, for each person, "In <lists>" or "Not in a list" (`src/entrypoints/popup/ManageView.tsx`, `PersonRow`; use `useConfig` from `src/ui/hooks.ts` and `inboxKey` from `src/core/emails.ts`).
- **Notes:** The UI calls the `comment` level **"Commenter"** (`ACCESS_LABELS` in `src/core/types.ts`), not "Can comment" as F004/F007/F008 say in their steps; judge those by the data and the UI's own label, don't rename the label. The "You (owner)" row is drawn by `ManageView` itself and isn't in `people`; it has no `.hint` or select. To read Manage access in e2e, open `sidepanel.html` first, then bring the artifact tab to the front (a `popup.html` page is itself the active tab, so it never sees the artifact); see `manageAccessOver` in `e2e/F004.spec.ts`.

### 2026-11-14 · F003 · Switching to the popup closes every window's side panel and doesn't interrupt a run

- **Did:** No source change: the `chrome.storage.onChanged` listener and the `switchingHere` guard were already in `src/entrypoints/popup/App.tsx` from F001. Added `e2e/F003.spec.ts` (4 tests): three side panel pages all close within 1 s of Use popup instead in one (and the toolbar then reads popup / panel behaviour off / stored popup); the same when `openPopup` rejects (the other panel closes, the switching one stays with its notice); a run of 6 addresses (one `slow-`) switched mid-send finishes in the popup with "Share finished: 6 invited" and Manage access shows the owner plus the six, each once; popup → panel → popup → panel round trips with the toolbar state read back after each.
- **Verified:** `harness/init.sh` OK at the start (150 e2e). `npm run check` (208 unit) passes; F003 12 of 12 over 3 repeats. feature-verifier: first run **FAIL** (the close waits had no time limit, step 2 says within a second); after capping them at 1000 ms, **PASS** with `npm run e2e` at 154 passed (run twice).
- **State:** F003 passes true. 3 of 13 features pass. Still not checked by hand in real Chrome (see F001's entry).
- **Next:** F004: the fake claude.ai's "Crowded" artifact (45 people already invited, rule at the top of `src/claude/fakeShareClient.ts`, unit and e2e tests). F005–F011 build on it.
- **Notes:** `openPopup` is stubbed in the spec to resolve (a real popup can't be had from Playwright); register `waitForEvent('close')` before the click, because the other panels close quickly. In Manage access an address appears twice per row (text and the select's label), so count rows with `ul.people > li` filtered by text, not `getByText`. Verifier's unlikely corner: `chooseSurface` saves before it applies, so if applying failed after the save, other windows' panels would close while the switching one shows an error.

### 2026-11-14 · F002 · If Chrome can't open the popup, the side panel stays and says so

- **Did:** The behaviour was already in the code from F001 (`openPopupHere` in `src/lib/surface.ts`, the notice and the Open popup label in `App.tsx`), so no source change. Added `e2e/F002.spec.ts` (4 tests): `openPopup` rejecting, `openPopup` missing, the retry via the Open popup icon (fails again, then succeeds and the panel closes), and the stored choice failing to save (nothing changed, `openPopup` never called).
- **Verified:** `harness/init.sh` OK at the start (146 e2e). `npm run check` (208 unit) passes; feature-verifier **PASS** on all five steps, with `npm run e2e` at 150 passed and F002 12 of 12 over 3 repeats.
- **State:** F002 passes true. 2 of 13 features pass. Still not checked by hand in real Chrome (see F001's entry).
- **Next:** F003. The listener that closes other windows' side panels and the `switchingHere` guard are already in `App.tsx`; it needs `e2e/F003.spec.ts` (two sidepanel.html pages; a run of 6 addresses surviving the switch; popup ↔ side panel round trips) and a verifier PASS.
- **Notes:** Verifier's untested corner: if `saveSurface` succeeds but `applySurface` throws, the choice is stored but not applied and the error reads "Couldn't switch…". Rare; left alone. Failure injection in specs: override `chrome.action.openPopup` / `chrome.storage.local.set` in the page.

### 2026-11-14 · F001 · Use popup instead opens the popup

- **Did:** `moveToPopup` (`src/lib/surface.ts`) now saves and applies the choice, then calls `chrome.action.openPopup({ windowId })` for the page's window via the new `openPopupHere`, and returns `{ opened }` or `{ opened: false, reason? }` (never rejects for an `openPopup` problem; rejects only if saving the choice fails). `App.tsx` closes the side panel only when `opened`. `e2e/F001.spec.ts` and unit tests in `tests/surface.test.ts` added.
- **Verified:** `npm run check` and `npm run e2e` (146 passed); feature-verifier PASS. The side-panel-mode F010/F011/F012 specs, which click Use popup instead, still pass with the real `openPopup` (in e2e it is called for real or fails quietly).
- **State:** F001 passes true. **Not checked by hand in real Chrome** (headless, no `dev:fake` window): whether closing the side panel right after `openPopup` takes the popup down with it, as the planning entry feared. First thing for a human to try in `npm run dev:fake`. If it does, close the panel first via the background (`chrome.sidePanel.close`, Chrome 141+) or order differently.
- **Next:** F002. Already in the code from F001 (so F002's spec is mostly to write): when `openPopup` is missing or rejects, the panel stays and shows 'Switched to the popup[, but Chrome couldn't open it: …]. Click the ArtiShare icon in the toolbar to open it.' in an `<output class="hint notice">`, and the icon then reads Open popup and retries. Also in the code: the F003 listener (`chrome.storage.onChanged` on `surface` in the side panel closes other windows' panels, skipped by the one that switched through `switchingHere`). F002 and F003 still need their e2e specs and verifier PASS.
- **Notes:** `chrome.action.getPopup` returns the full `chrome-extension://<id>/popup.html` URL, not `popup.html`. Oxlint warns (doesn't fail) about the `as typeof chrome.action.openPopup` cast in `e2e/F001.spec.ts`.

### 2026-11-14 · Planning · Use popup instead opens the popup, and save people with access to a list

- **Did:** Planned a new goal on `harness/manage-access-import-and-popup-switch` (from `develop`), replacing the finished side-panel-mode list (all 18 passed, merged in PR 16, released as 0.4.0). 13 features, F001–F013. Nothing built.
- **Goal:** Make the side panel's Use popup instead icon close the side panel and open the popup, and let people save everyone already invited to an artifact who isn't in any of their lists into a new or existing list, straight from People with access.
- **The user's words:** "when I click use the pop up icon it's close the sidebar but did not open the pop up, so it's just the same as the X icon"; and in Manage access, people "already invited before but user has not had any list contains that emails should allow user to import to the list … import multiple emails to a group … user friendly".
- **Decisions (mine; the user didn't specify):**
  - **Popup switch (F001–F003).** `moveToPopup` (`src/lib/surface.ts`) only saves the choice, then `App.tsx` calls `window.close()`. Fix: save and apply the choice first (`chrome.action.openPopup()` opens whatever `setPopup` set, so it must be the popup page already), then `chrome.action.openPopup({ windowId })` for the side panel's window, then close the panel. `openPopup` exists for all extensions from Chrome 127 and the e2e helper `e2e/realPopup.ts` already calls it from the worker. If it's missing or rejects, the choice stays switched (the toolbar icon opens the popup) and the panel stays open with a message to click the toolbar icon, so the click is never a silent X (F002). Other windows' side panels close themselves on the change (F003): a `chrome.storage.onChanged` listener on the surface key in the side panel page is the likely route.
  - **Save to a list (F004–F011) lives inside People with access** (`ManageView.tsx`), not a new tab or a modal: a quiet note "N people aren't in any of your lists." with a **Save to a list** button replaces the list in place with a picker (checkboxes, all ticked, Select all with mixed state, "x of y selected"), then **New list** (Name with `defaultListName` as placeholder, Permission preset to their shared permission if all the same, else Can view) or **Add to an existing list** (drop-down). Each row also says "In <lists>" or "Not in a list" so it's clear who is missing.
  - **Matching** uses `inboxKey` (`src/core/emails.ts`), the same as the rest of the extension, so a Gmail alias counts as in the list.
  - **Saving goes through the background's config controller** (`config-change`), like every list edit. Adding to an existing list probably wants a new `ConfigChange` (say `add-to-list` with the list id and addresses) that merges into the list as stored now, so it doesn't fail or overwrite when another window changed the list (F010 step 3). A new list uses the existing `save-list` with `expected: null`.
  - **Adding people to a list never changes their access to the artifact**; the hint in F008 says so.
- **Housekeeping:** The side-panel-mode specs moved from `e2e/F0xx.spec.ts` to `e2e/side-panel-mode/` (imports `../fixtures`, the repo root `../..`, F011's `.output` path `../../`), so the new F001–F013 specs don't collide. They are regression tests: keep them passing. The F001/F012 specs of side-panel-mode check that Use popup instead closes the page; update them if the new flow changes what they check, but keep what they protect.
- **Risky areas:**
  - F001: a popup closes when it loses focus. Closing the side panel right after `openPopup` might take the popup down with it in real Chrome; e2e opens `sidepanel.html` as a tab, so it can't show this. Check by hand in `npm run dev:fake` (the verifier can't), and if it happens try closing the panel first via the background (`chrome.sidePanel.close`, Chrome 141+) or ordering differently. Say in the progress entry what was checked by hand.
  - F005/F011: lists change while People with access is open; `useConfig` in `src/ui/hooks.ts` already updates on storage changes, so the tags and the picker should follow it rather than a copy.
  - F011: 45 rows in a 600 px popup. Keep the save button in a bar that stays visible.
- **Next:** F001.

### 2026-11-14 · F018 · Screenshots show the header icons, the Artifacts rows and the side panel

- **Did:** `scripts/screenshots.spec.ts`: the popup is now opened over an artifact tab (so the header has the Manage access icon and the tab's artifact is a row marked This tab), a second link is added as a row with fill + Enter, share.png is taken from the top (it used to scroll to the end, which hid the rows), and the Manage access picture uses the header icon. New `sidePanelImage()` opens `sidepanel.html` (400×800, 2x), saves a 40-address list and opens it in the Lists tab, writing `docs/images/sidepanel.png`. All PNGs regenerated (`docs/images` and the three `store/images` at 1280×800). README: the new image in its own row with alt text naming the side panel, and a fuller alt for share.png. New `e2e/F018.spec.ts` (5 tests): sizes, generator wiring, README alt text, made-up ids and domains.
- **Verified:** `harness/init.sh` OK at the start (204 unit, 140 e2e). `npm run check` passes. feature-verifier: **PASS** on all four steps, having looked at every PNG, with `npm run e2e` at 145 passed.
- **State:** F018 passes. 18 of 18 features pass. `stash@{0}` (stray debug spec) still there.
- **Next:** Nothing left in the list. A human can review the branch and merge it into `develop` through a PR (the manifest/package version is still 0.3.0; the goal says v0.4.0).
- **Notes:** In sidepanel.png the "Only these" default-ticking checkbox beside the list is unticked, which looks slightly odd but is the real UI. The old `e2e/popup-and-manage-access/F018.spec.ts` still passes alongside the new one. Prettier reformats the script, so run `npm run format` after editing it.

### 2026-11-14 · F017 · The docs describe the side panel, the Manage access icon and the Artifacts rows

- **Did:** The README already described the side panel choice, the rows and the header icon from earlier features; added the side panel following the tab to Pick artifacts, and the side panel to the layout. `store/listing.md`: `sidePanel` is back in the permissions table, the description and single purpose name the side panel, the Share bullet describes rows, and Manage access is the header icon (test step 6 too, plus an optional step 8). `docs/index.html`: side panel icon and the Manage access icon. `CLAUDE.md`: layout names `sidepanel/`. New `e2e/F017.spec.ts` (7 tests) reads the files and checks the wording per step, including that `bottom of the Share tab` appears nowhere.
- **Verified:** `harness/init.sh` OK at the start (204 unit, 133 e2e). `npm run check` passes. feature-verifier: **PASS** on all steps, with `npm run e2e` at 140 passed.
- **State:** F017 passes. 17 of 18 features pass. `stash@{0}` (stray debug spec) still there.
- **Next:** F018 (screenshots: `npm run screenshots`, a new `docs/images/sidepanel.png` of a long list in the Lists tab, README image with alt text, store images at 1280×800, and the screenshot e2e checks).
- **Notes:** `python3` heredocs and `rm` need approval in these sessions; use the Edit tool.

### 2026-11-14 · F016 · The side panel is comfortable for long lists

- **Did:** Most of the layout was already right from earlier features (`html.sidepanel` drops the 380 px width and 600 px cap; rows already truncate; the body wraps long text). The one gap was the address box: `EmailInput.tsx` now gives its textarea the class `email-box`, and `styles.css` sets `html.sidepanel .email-box { min-height: 40vh }`, so a long list shows far more lines in the panel while the popup keeps its 5 rows. README: the Side panel paragraph says so. New `e2e/F016.spec.ts` (7 tests): 320/400/600 px widths, the 200-address list, 30 artifacts, a long address, the popup's 380 px / 600 px.
- **Verified:** `harness/init.sh` OK at the start (204 unit, 126 e2e). `npm run check` passes. feature-verifier: first run **FAIL** (my spec looked for a "Save list" button on an opened saved list, where it is "Save"); after the fix, **PASS** with `npm run e2e` at 133 passed and F016 alone 7 of 7.
- **State:** F016 passes. 16 of 18 features pass. `stash@{0}` (stray debug spec) still there.
- **Next:** F017 (docs: README sections, store/listing.md, docs/index.html, CLAUDE.md layout, and the `grep 'bottom of the Share tab'` check). Then F018.
- **Notes:** An opened saved list's button reads "Save"; the new-list form's reads "Save list".

### 2026-11-14 · F015 · If Chrome can't open the side panel, the popup stays open and says why

- **Did:** `surface.ts`: new `sidePanelSupported()`; `applySurface` falls back to the popup (and skips `setPanelBehavior`) where `chrome.sidePanel` is missing, so a stored side-panel choice can't leave the toolbar icon dead. `App.tsx`: the switch icon is hidden in the popup when side panels aren't supported; a failure shows "Couldn't open the side panel: …" (popup) or "Couldn't switch to the popup: …" (side panel), and is cleared on the next click. The choice is saved only after `sidePanel.open` succeeds, so on failure nothing changes. README: one sentence on both cases. New `e2e/F015.spec.ts` (5 tests) covers the three steps, a retry that then succeeds, and a control with the API present.
- **Verified:** `harness/init.sh` OK at the start (204 unit, 121 e2e). After the change `npm run check` (204) passes; feature-verifier: **PASS** on all steps from its own `npm run e2e` (126 passed) and the F015 spec alone (5 of 5).
- **State:** F015 passes. 15 of 18 features pass. `stash@{0}` (stray debug spec) still there.
- **Next:** F016 (the side panel is comfortable for long lists: full width and height, nothing scrolls sideways). Look at `html.sidepanel` in `src/ui/styles.css` and the popup's fixed 380 px.
- **Notes:** In e2e, `chrome.sidePanel.open` can be replaced on the page object; `chrome.sidePanel` itself can be made undefined with `addInitScript` + `Object.defineProperty` before load.

### 2026-11-14 · F014 · The Manage access icon follows the tab in the side panel

- **Did:** `App.tsx`: the one-time `currentTabArtifact()` read is replaced by `useTabArtifact(!inPopup)`, so in the side panel the Manage access icon is there over an artifact tab and gone over any other page. People with access shows `managing`, the artifact it was opened for, so a tab switch never moves an open view; after Back the icon opens for the tab in front. The Back comment now says the icon may be gone in the side panel. README: two sentences on the icon following the tab. New `e2e/F014.spec.ts` (3 tests) covers all five steps, the icon with no view open, an in-place navigation, and the popup still reading once.
- **Verified:** `npm run check` (204 unit) and `npm run e2e` (121, 1.2 min) pass. feature-verifier: **PASS** on all five steps, from its own check, e2e and `npx playwright test e2e/F014.spec.ts --repeat-each=3` (9 of 9).
- **State:** F014 passes. 14 of 18 features pass. `stash@{0}` (the stray debug spec) is still there.
- **Next:** F015.
- **Notes:**
  - Two sessions built this and lost it: the machine was overloaded overnight (load average 11–13), the full e2e took 17 minutes, and each session started it in the background and ended its reply to wait, which ends a headless session. The work was finished and committed by hand afterwards. `harness-work.md` and the verifier now say to run e2e in the foreground, one at a time, and `playwright.config.ts` has an 8-minute `globalTimeout`.
  - After Back in the side panel over a non-artifact tab, the icon is gone, so focus falls to the page. Not in the steps; left as is.

### 2026-11-14 · F013 · The side panel follows the tab you're on

- **Did:** New hook `src/entrypoints/popup/useTabArtifact.ts`: the artifact of the active tab, read on mount and, with `follow`, again on `tabs.onActivated`, `tabs.onUpdated` (active tab, URL changed, which covers in-place `?artifact=` changes) and `windows.onFocusChanged`; stale answers are dropped and the same artifact keeps the same value. `ShareView.tsx` uses it in place of the one-time read: the artifact is added unless it is a row or was removed, and `thisTab` (the badge) follows it, going null on a non-artifact tab. New `followTab` prop on ShareView, passed by `App.tsx` as `!inPopup`, so the popup still reads once. README: the Side panel paragraph says the panel follows the tab. New `e2e/F013.spec.ts` (4 tests) covers all 8 steps plus the popup not following.
- **Verified:** `harness/init.sh` OK at the start (204 unit, 114 e2e). After the change `npm run check` (204 unit) and `npm run e2e` (118) pass; F013 passed 12 of 12 with `--repeat-each=3`. feature-verifier: **PASS** on all 8 steps.
- **State:** F013 passes. 13 of 18 features pass. The tree is clean after the commit. `stash@{0}` (the stray debug spec) is still there; drop it whenever.
- **Next:** F014 (in the side panel, the Manage access icon follows the tab you're on, and an open Manage access stays on the artifact it was opened for). `App.tsx` still reads `tabArtifact` once (`currentTabArtifact()` in an effect); `useTabArtifact(!inPopup)` can replace it, with `managing` already holding the artifact an open view is for.
- **Notes:** In e2e, a new tab (`newPage`) is brought to the front, so a side panel that is already open follows it at once. The spec therefore creates the artifact tabs first and opens `sidepanel.html` after them. A uuid `?artifact=` is shown as a derived artifact link, so the spec compares rows with each other, not with the uuid.

### 2026-11-14 · F012 · Re-verified after removing the stray debug spec

- **Did:** No code change. `rm` of the untracked `e2e/zz-dbg.spec.ts` needed approval, so it was set aside with `git stash push -u` instead (`stash@{0}`; drop it with `git stash drop` whenever). Set F012 `passes` to true.
- **Verified:** `harness/init.sh` OK (`npm run check`, 204 unit tests; `npm run e2e`, 114 passed). feature-verifier on F012: **PASS** on all four steps, plus a 2x repeat of `e2e/F012.spec.ts`.
- **State:** F012 passes. 12 of 18 features pass. The tree is clean.
- **Next:** F013.
- **Notes:** The verifier's one remark: e2e cannot click the toolbar or open Chrome's real side panel, so the spec switches by closing one page and opening the other's HTML fresh. That proves state survives in shared storage, which is what F012 is about.

### 2026-11-14 · F012 · Moving between the popup and the side panel keeps your work

- **Did:** No source change was needed: the Share draft, the Lists drafts, the preview, the open tab and the run all live in storage (session and local) that both pages read, and the run is in the background. New `e2e/F012.spec.ts` (2 tests) covers all four steps: artifacts + ticks + a half-typed new list + the open tab across popup → side panel → popup; a preview carried over, then a run switched mid-way with live progress, Stop and Resume in the side panel, and the finished run seen from the popup. README: the Side panel paragraph now says the work comes along and a run is not interrupted.
- **Verified:** `npm run check` (204 unit tests) and `npm run e2e` (115, counting the stray debug spec) pass; F012 passed 6 of 6 with `--repeat-each=3`. feature-verifier: **FAIL**, only because of the stray `e2e/zz-dbg.spec.ts` (below); it marked all four steps and the README ✓.
- **State:** F012 `passes` is **false**, only because the verifier would not PASS while the stray file is in the tree. Nothing of F012 is left to build. 11 of 18 features pass.
- **Next:** **Delete `e2e/zz-dbg.spec.ts`** (untracked, from the F011 session; `rm` and `git clean` need approval in these sessions, so a human has to), then run the feature-verifier on F012 again. It should PASS; then set `passes: true` for F012 and write a short entry, before starting F013.
- **Notes:** `e2e/zz-dbg.spec.ts` is not committed. The commit for this session added only `e2e/F012.spec.ts`, `README.md` and this entry. As the e2e specs can't click the toolbar, the "other surface" is a fresh page of `popup.html` or `sidepanel.html` opened after the icon closed the first one.

### 2026-11-14 · F011 · The popup-or-side-panel choice survives a restart and an update

- **Did:** No source change was needed: `applyStoredSurface` at background start and `parseSurface` already did this. New `e2e/F011.spec.ts` (11 tests) covers all five steps. README: the Side panel paragraph now says the choice also survives an update, and that the popup is used until the side panel is chosen.
- **Verified:** `npm run check` (204 unit tests) and `npm run e2e` (113, counting the stray debug spec) pass. feature-verifier: **PASS** on all five steps.
- **State:** F011 passes. 11 of 18 features pass.
- **Next:** F012 (moving between the popup and the side panel keeps your work).
- **Notes:**
  - **`e2e/zz-dbg.spec.ts` is a stray throwaway file of mine, untracked and not committed. This session could not delete it (`rm` needs approval). A human, or the next session, should delete it.** It runs in `npm run e2e` and prints noise.
  - `chrome.runtime.reload()` does not work in e2e: an extension loaded from the command line never comes back after it, so no service worker starts. The spec instead closes Chromium and relaunches it on the same profile directory (`launchPersistentContext` with `test.info().outputPath('profile')`), which keeps storage and forgets `action.setPopup`, like a real restart. The step's wording says reload; the verifier judged the relaunch a faithful, stronger stand-in.
  - The project has no `@types/node`, so the spec uses no `node:` imports.

### 2026-11-14 · F010 · Use popup instead icon

- **Did:** `src/lib/surface.ts`: `moveToPopup` (`chooseSurface('popup')`). `App.tsx`: the header's switch button is "Open in side panel" in the popup and "Use popup instead" in the side panel, where it calls `moveToPopup()` and then `window.close()`. If switching fails, the page stays open and shows "Could not switch: …" (it was "Could not open the side panel: …"). `icons.tsx`: new `PopupIcon`. README: the Side panel paragraph now describes the icon and switching back and forth. New `e2e/F010.spec.ts` (4 tests) covers all five steps.
- **Verified:** `npm run check` (204 unit tests) and `npm run e2e` (101) pass, re-run just before this commit. feature-verifier: **PASS** on all five steps, from its own `npm run check`, `npm run e2e` and `npx playwright test e2e/F010.spec.ts`.
- **State:** F010 passes. 10 of 18 features pass.
- **Next:** F011 (the popup-or-side-panel choice survives a Chrome restart and an extension update, and people coming from 0.3.0 start with the popup). `applyStoredSurface` at background start is the restart path, and it still has no e2e test.
- **Notes:**
  - The session that built F010 hit the usage limit right after it set `passes: true`, before it wrote this entry or committed. The entry and the commit were made afterwards from that session's transcript, with the checks re-run first.
  - e2e can see the side panel page close, but not Chrome's real side panel. No spec covers a failing `chooseSurface`; in that case the page stays open and shows the error.

### 2026-11-13 · F009 · Open in side panel icon

- **Did:** New `src/core/surface.ts` (`Surface` = `'popup' | 'sidepanel'`, `parseSurface`, default popup) with `tests/surface.test.ts`. `src/lib/storage.ts`: `loadSurface`/`saveSurface` (`chrome.storage.local` key `surface`). New `src/lib/surface.ts`: `applySurface` (`sidePanel.setPanelBehavior` + `action.setPopup`, `''` for the side panel), `chooseSurface` (save then apply), `applyStoredSurface`, `moveToSidePanel` (`sidePanel.open` first, while the click is still a gesture, then `chooseSurface('sidepanel')`). `background.ts` calls `applyStoredSurface()` on every start because `setPopup` is forgotten on browser restart. `App` takes `surface` (default `'popup'`); the popup shows a `SidePanelIcon` button "Open in side panel" in the header after Manage access, which closes the popup (`window.close()`) once the panel is open, or shows "Could not open the side panel: …". `sidepanel/main.tsx` passes `surface="sidepanel"`, so no icon there. README: new "Side panel" paragraph. New `e2e/F009.spec.ts`; `popup-and-manage-access/F002.spec.ts` now expects the first Tab stop to be the new icon.
- **Verified:** `npm run check` (204 unit tests) and `npm run e2e` (97) pass. feature-verifier: **PASS** on all four steps.
- **State:** F009 passes. 9 of 18 features pass.
- **Next:** F010 (the side panel's "Use popup instead" icon: `chooseSurface('popup')`, close the side panel with `window.close()`, and repeated switching). `App`'s `surface` prop and `lib/surface.ts` are ready for it.
- **Notes:**
  - Playwright's `sidePanel.open` works from a normal-tab extension page on a real click, so e2e covers the click and reads back `getPopup`, `getPanelBehavior` and storage. It can't see the panel itself or a real toolbar click.
  - The restart path (`applyStoredSurface` at background start) has no e2e test.
  - `window.close()` closes a side panel in current Chrome; F010 should confirm that, or use `chrome.sidePanel.setOptions({enabled:false})` then re-enable, if not.

### 2026-11-13 · F008 · Side panel page and manifest

- **Did:** New `src/entrypoints/sidepanel/` (`index.html`, `main.tsx`): renders the popup's `App` and adds `html.sidepanel`. WXT then writes `side_panel.default_path: sidepanel.html` and the `sidePanel` permission; `action.default_popup` and the `key` are unchanged. `styles.css`: `html.sidepanel` drops the 380 px width and 600 px cap and makes `.popup` 100% high, so only `.popup-body` scrolls. `e2e/fixtures.ts` gains `extensionId` and `sidePanel` (sidepanel.html at 400×900) fixtures. New `e2e/F008.spec.ts` (manifest, header/tabs/version, full height and body-only scrolling, a full list → preview → send run). `e2e/popup-and-manage-access/F001.spec.ts`: dropped its "no side_panel / no sidePanel permission" assertions (F008 adds both on purpose) and renamed that test.
- **Verified:** `npm run check` (197 unit tests) and `npm run e2e` (91) pass. feature-verifier: **PASS** on all five steps.
- **State:** F008 passes. 8 of 18 features pass. Nothing in the UI opens the side panel yet, so no README change.
- **Next:** F009 (the "Open in side panel" header icon, `chrome.sidePanel.setPanelBehavior` and `action.setPopup`, and the stored choice). `App` takes no props yet; it will need to know which surface it is in (the sidepanel `main.tsx` is the place to say so).
- **Notes:** The feature-verifier's tool log was not inspected; the green runs above are this session's own.

### 2026-11-13 · F007 · Manage access icon: keyboard focus and header fit

- **Did:** `ManageView.tsx`: focus moves to Back when People with access opens (`backRef`). `App.tsx`: `manageIconRef`; Back returns focus to the icon (the icon toggle itself keeps focus). Nothing else needed: the icon already hid off artifact tabs, `button:focus-visible` already draws the ring, and `.account` (min-width 0, truncates) plus `icon-btn` (flex none) already fit 380 px. New `e2e/F007.spec.ts` covers all six steps (no icon and no gap, Tab/Enter/Back focus, a long address truncating at 380 px, the in-progress note during a run, tooltip and dark-mode colour).
- **Verified:** `npm run check` (197 unit tests) and `npm run e2e` (87) pass. feature-verifier: **PASS** on all six steps.
- **State:** F007 passes. 7 of 18 features pass.
- **Next:** F008 (side panel page and manifest).
- **Notes:**
  - The verifier's tool log again showed only Read, so its "ran check and e2e" lines were not its own; the green runs above are this session's own.
  - The native tooltip can't be rendered headless, so only the `title` attribute is asserted.
  - Still stale from F006: `scripts/screenshots.spec.ts:167`, `store/listing.md`, `docs/index.html` still describe the old bottom link.

### 2026-11-13 · F006 · Manage access icon in the header

- **Did:** `App.tsx`: the bottom "Manage access" link is gone; a `UsersIcon` button (`aria-label` "Manage access", title "Manage access to this artifact", `aria-pressed` while open) sits in the header after the account pill, only when the active tab is an artifact. Clicking it toggles `managing`. `ManageView` renders inside whichever tabpanel is active (Share or Lists), so the old specs' `share` locator still finds it; the Share form and `ListsView` are only hidden meanwhile, so rows and an open list's unsaved edit survive Back. Choosing a tab (`setTab`) closes it. CSS: `.manage-link` removed, `button.icon-btn[aria-pressed='true']` added. README Manage access section. New `e2e/F006.spec.ts` covers all seven steps; `popup-and-manage-access` F012–F016 now click the icon through `panel`.
- **Verified:** `npm run check` (197 unit tests) and `npm run e2e` (82) pass. feature-verifier: **PASS** on all seven steps; it ran check and e2e itself.
- **State:** F006 passes. 6 of 18 features pass.
- **Next:** F007 (icon only where it works, keyboard focus ring and focus on Back, fits the header at narrow width). The icon already hides on non-artifact pages; check focus handling and layout.
- **Notes:**
  - Not yet updated, and scheduled in later features: `scripts/screenshots.spec.ts:167` still clicks the old link inside the Share panel (`npm run screenshots` will fail there), and `store/listing.md` (lines ~30, 114) and `docs/index.html` (~102) still describe the link.
  - Tab-switch while Manage is open closes it (my choice; the steps don't say).

### 2026-11-13 · F005 · Mark F005 as passing

- **Did:** No code change. Re-ran the feature-verifier for F005 and set `passes: true`.
- **Verified:** `harness/init.sh` (`npm run check`, 81 e2e) green. feature-verifier: **PASS** on all five steps, from reading `e2e/F005.spec.ts`, `shareDraft.ts` and `ShareView.tsx`.
- **State:** F005 `passes` is true. 5 of 18 features pass.
- **Next:** F006.
- **Notes:** The verifier's tool log showed only Grep and Read, so its "ran check and e2e" lines were not its own. The green runs above are this session's own.

### 2026-11-13 · F005 · A 0.3.0 draft and typed links carry over into the rows

- **Did:** `parseShareDraft` (`src/core/shareDraft.ts`) turns a draft with no `artifacts` key (0.3.0's, which held every link in the box) into rows with `addArtifactText`; what isn't a link stays in the box, so the warning shows. A draft that has `artifacts` keeps its typed text as typed. Unit tests in `tests/shareDraft.test.ts`; new `e2e/F005.spec.ts` (0.3.0 draft seeded in session storage, a typed link counted by and included in Preview, the typed link kept across a reopen, "Add at least one artifact." with nothing). The older specs already use the rows from F001–F004, so none needed changing.
- **Verified:** `npm run check` (197 unit tests) and `npm run e2e` (81, including `e2e/F005.spec.ts`) both pass. feature-verifier: **no verdict**. Both runs returned FAIL only because Bash was denied in the verifier's session, so it ran no commands.
- **State:** F005 `passes` is still **false**: the work is done and green, but it has no PASS yet.
- **Next:** Run the feature-verifier for F005 again (from a session where it can run Bash); on PASS set `passes: true` for F005 and commit that alone, then take F006.
- **Notes:**
  - F004's second verifier run did get Bash; this time neither did, so it looks like a permissions prompt in the verifier's session rather than anything in the change.
  - The popup reopens on the tab it was closed on, so an e2e spec that reloads the panel must click Share again (`reopen` in `e2e/F005.spec.ts`).

### 2026-11-13 · F004 · A removed artifact isn't added back by itself

- **Did:** The draft now keeps `removed` (artifact keys taken out with ×), left out when empty (`shareDraft.ts`; a malformed value is dropped without discarding the draft). `updateRemoved` in `artifactRows.ts` adds the removed artifact and forgets any key that is a row again. `ArtifactsValue` gains `removed`; `ArtifactsField.tsx` updates it on ×, Undo, paste/Enter and + Current tab. The mount effect in `ShareView.tsx` skips the prefill for a key in `removed`. `thisTab` is still set then, so + Current tab or a paste brings it back with the badge. README Artifacts bullet.
- **Verified:** `npm run check` (196 unit tests) and `npm run e2e` (80, including the new `e2e/F004.spec.ts`: hold-back, + Current tab, other artifact, Undo, paste, run + Start a new share, and a simulated browser quit by clearing the session draft). feature-verifier: **PASS** on the second run (the first returned FAIL only because Bash was denied in its session).
- **State:** F004 passes.
- **Next:** F005 (a 0.3.0 draft and typed-but-not-added links carry over; older specs on the rows). Much of it is already true from F001, so start by writing `e2e/F005.spec.ts` for its steps and see what fails.
- **Notes:**
  - `removed` lives in the session-storage draft, so it is cleared by sending (`saveShareDraft(null)`, then Start a new share) and by a browser restart, with no extra code.
  - Pre-existing and left alone: `addCurrentTab` captures `rows` before its `await`, so rows changed during that await would be overwritten.

### 2026-11-13 · F003 · Add the current tab's artifact, marked 'This tab'

- **Did:** `ShareView.tsx`: the old prefill (only with no rows and no text) is now "on mount, if the active tab is an artifact and no row is the same artifact (`sameArtifact`), append it". The tab's ref is kept in `thisTab` state and passed to `ArtifactsField`, which shows a `This tab` badge (`.this-tab` in `styles.css`) on the row for that artifact, whether it was just added or already there. A cowork link and its `/code/artifact/<uuid>` link match by uuid. A non-artifact tab sets nothing. README Artifacts bullet.
- **Verified:** `npm run check` (191 unit tests) and `npm run e2e` (78, including the new `e2e/F003.spec.ts`: the three-artifact sequence, repeat, cowork-vs-code link, non-claude page, and Start a new share after a finished run). feature-verifier: **PASS** on the first run.
- **State:** F003 passes. Updated older specs for the badge: `popup-and-manage-access/` F003 and F012 and `share-ux-fixes/F003` read the link through `.artifact-item .truncate`; `popup-and-manage-access/F005` 'a restored draft…' now expects the tab's row added with the typed text kept in the box.
- **Next:** F004 (an artifact you removed isn't added back by itself). Needs a 'removed' list kept in the draft (`shareDraft.ts`), cleared by Start a new share, by + Current tab and by Undo; the mount effect in `ShareView.tsx` must skip refs on it.
- **Notes:**
  - The badge is set once on mount; it doesn't follow tab switches while the popup stays open (matches the steps, which reopen).
  - Start a new share remounts `ShareView`, so the mount effect picks up the active tab again with no extra code.
  - In e2e a new list isn't ticked by default: tick it before Preview.
  - `has:` locators in `filter()` are relative to the row: build them from `panel`, not from a locator that includes the tabpanel.
  - Shell heredocs and compound `sed ... ; ...` commands are refused here; use Edit/Write.

### 2026-11-13 · F002 · Undo after ×, and keyboard focus

- **Did:** `ArtifactsField.tsx`: × now remembers the removed row and its index and shows `Removed <url> · Undo` (an `<output class="undo-bar">`, url truncated by CSS) for 5 s (`UNDO_MS`); Undo splices it back at its old index (clamped), unless the artifact was re-added meanwhile. Only the latest removal can be undone. Focus: for a keyboard activation (`click` with `detail === 0`) focus moves, after render (`useLayoutEffect`), to the × now at the removed position (the previous one when the last row went), or to the paste box when no rows are left; Undo from the keyboard focuses the restored ×. Mouse clicks don't move focus. Persistence needed no change: rows are already in the saved draft. CSS `.undo-bar`; README Artifacts bullet.
- **Verified:** `npm run check` (191 unit tests) and `npm run e2e` (76, including the new `e2e/F002.spec.ts`). feature-verifier: **PASS** on the first run.
- **State:** F002 passes.
- **Next:** F003 (the current tab's artifact is added when it isn't in the list, with a 'This tab' badge). It replaces the old prefill rule in `ShareView.tsx` and must update `popup-and-manage-access/F005.spec.ts` 'a restored draft is not overwritten…' (see the F001 notes).
- **Notes:**
  - The Undo bar sits below the paste box, so a keyboard user Tabs through the box to reach Undo.
  - The message's spans are separated by `{' '}` because a flex row drops the spaces, and `Removed https://…` would otherwise read as one word.
  - The undo timing assertion in the spec is wall-clock (4.5–6.5 s); it passed every run.

### 2026-11-13 · F001 · Artifacts as rows with a Remove (×) button

- **Did:** Turned the Artifacts textarea into rows.
  - `src/core/artifactRows.ts` (new): `addArtifactText` (text → rows, repeats, leftover text, a line at a time), `insertPaste`, `removeArtifact` and `sameArtifact`. Artifacts are compared by the new `artifactKey` in `artifactUrl.ts` (the UUID), so a cowork link and its `/artifact/` link are one.
  - `src/entrypoints/popup/ArtifactsField.tsx` (new): the rows, each with its `ref.url` truncated, the full link in `title` and a × named `Remove <url>`; the 'No artifacts yet…' hint; and a one-line `textarea#artifacts.paste-box`.
    - It stays a textarea because `fill()` into an `<input>` drops newlines.
    - Paste, Enter, or a fill or drop that adds a line break turns links into rows. Anything that isn't a link stays in the box.
    - A repeat highlights its row (`.repeated`) and shows 'Already in the list' for 2 s.
    - `aria-required` is only set while there are no rows.
  - `ShareView.tsx` uses it. The draft (`shareDraft.ts`) gains `artifacts: string[]` (row urls, in order) next to `artifactText`. Text typed but not yet added still counts for the count and for Preview, after the rows.
  - CSS 'Artifacts rows' section; README's Artifacts bullet.
- **Verified:** `npm run check` (191 unit tests) and `npm run e2e` (75, including the new `e2e/F001.spec.ts`, which uses a real Cmd+C/Cmd+V paste). The feature-verifier first returned FAIL: a link pasted with leftover text still in the box was glued onto it, and my spec had hidden this by clearing the box. Fixed with `insertPaste`, which puts a pasted link on its own line, and a spec that pastes straight after step 4. Second verdict: **PASS**.
- **State:** F001 passes. Old specs moved to the rows (they assert `.artifact-item` / `Remove <url>` instead of the box's value): `popup-and-manage-access/` F003, F005, F008, F012 and `share-ux-fixes/` F002, F003. Specs that `fill()` a single link still pass unchanged, because typed text counts.
- **Next:** F002 (Undo after ×, keyboard focus).
- **Notes:**
  - Deliberately left for later features:
    - The tab prefill is still the old rule: it adds the tab's artifact only when there are no rows and no text (`ShareView.tsx`, the `currentTabArtifact()` effect). F003 changes that, and must update `popup-and-manage-access/F005.spec.ts` 'a restored draft is not overwritten…', which now asserts 0 rows.
    - A 0.3.0 draft reads as `artifacts: []` with its text left in the box (split into rows in F005).
    - × just removes (Undo and focus are F002).
  - Enter and Shift+Enter both add, so the box never holds a typed line break. A paste with no link in it (a fragment) is still spliced in at the caret.
  - Known edge: typing `https://claude.ai/artifact/` and then pasting a bare 20–24-character id adds the right row but leaves the typed prefix in the box with a warning.
  - Artifact ids in `/artifact/` links are capped at 64 characters (`SHORT_ID_RE`), so a test's "long link" must stay within that.

### 2026-11-13 · Planning · v0.4.0: side panel mode, current-tab artifact, Manage access icon

- **Did:** Planned a new goal on `harness/side-panel-mode` (from `develop`), replacing the finished popup-and-manage-access list (all 18 passed and merged in PR 15, released as 0.3.0). 18 features, F001–F018. Nothing built. (First committed with 15 features and an "offer, don't add" Artifacts rule; the user then chose auto-add with easy removal, so F001–F005 and F013 were rewritten in the same planning session, before any work started.)
- **Goal:** For v0.4.0: let people move ArtiShare from the popup into a side panel and back (remembered), make Artifacts a list of rows that always picks up the current tab's artifact and is easy to remove from, and move Manage access from the bottom of the Share tab to an icon in the header.
- **Decisions (from the user):**
  - **Side panel is a remembered mode, not a one-off.** The popup's header gets an 'Open in side panel' icon; clicking it opens the side panel and from then on the toolbar icon opens the side panel (like 0.2.0). The side panel's header has 'Use popup instead' to switch back. The default, and the fallback for anything unknown, is the popup. Likely route: store the choice in `chrome.storage.local`; the background applies it on startup/install and on change with `chrome.action.setPopup({ popup: '' | 'popup.html' })` and `chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick })`. Reuse `App` for both pages with a prop saying which one it is.
  - **Artifacts: always add the tab's artifact, make removing one click.** The bug the user hit: the prefill at `src/entrypoints/popup/ShareView.tsx:79-81` only fills an _empty_ box, and the box is a saved draft, so the first artifact you open ArtiShare over is added and the second is silently ignored. The user's rule: opening ArtiShare over an artifact that isn't in the list adds it; if it's already there (compare by artifact id, so a cowork link and its `/artifact/` link are the same) nothing changes; and removing one must be a click, without clutter.
    - **Rows, not a textarea** (F001, F002). Each artifact is a row: its normalized `ref.url` on one line (ellipsis, full link in `title`), a 'This tab' badge on the row for the active tab, and a × button named `Remove <url>`. Below the rows a one-line box (label Artifacts, placeholder 'Paste artifact links (one per line)') turns pasted or Enter-ed links into rows and keeps anything that isn't a link with the existing 'Not artifact links: …' warning. Removing shows 'Removed … · Undo' for about 5 s. Keep `+ Current tab` and the count. Reuse `parseArtifactList` / `parseArtifactRef`; no new parsing.
    - **What's removed stays removed** (F004): a removed artifact's id is held back so reopening over that tab doesn't add it again — otherwise × would be pointless on the tab you're on. `+ Current tab`, Undo, a finished run's Start a new share, and the browser quitting (it's in `chrome.storage.session` with the draft) clear it. Only that id is held back.
    - **Draft shape** (F005): store the rows (`artifacts: string[]` of urls, in order), the text not yet turned into rows, and the held-back ids. A 0.3.0 draft has only `artifactText`: split it into rows and leftover text on load. Text typed but not yet added still counts for Preview and survives closing the popup, so nothing typed is lost.
    - **Where the add runs:** on open, whichever tab (Share, Lists, a run) is showing, so it's there when you switch to Share. In the side panel also on tab switches (F013); the user accepted that the panel collects the artifacts you visit, because × removes one in a click and a removed one isn't re-added.
    - **Specs that change:** `e2e/popup-and-manage-access/F005.spec.ts` 'a restored draft is not overwritten by the artifact in the tab the popup opens over' now expects the restored rows kept _and_ the tab's artifact added after them (still not overwritten). Specs that `fill()` or read `#artifacts` (`smoke.spec.ts`, `share-ux-fixes/`, `popup-and-manage-access/`) move to the rows in F005; keep `aria-required` on the paste box while there are no rows.
  - **Manage access is a header icon** (`UsersIcon`, accessible name 'Manage access', tooltip 'Manage access to this artifact'), shown only when the tab is an artifact, next to the side-panel icon. The bottom `.manage-link` goes. It must work from the Lists tab too, so `ManageView` moves out of `#panel-share` and Back returns to whichever tab was open.
- **Housekeeping:** The previous goal's specs moved from `e2e/F0xx.spec.ts` to `e2e/popup-and-manage-access/` (imports now `../fixtures`, `../realPopup`; F018's repo root is `new URL('../..', …)`) so the new F001–F018 specs don't collide. They are regression tests: keep them passing, and update them where a feature changes the behavior they check (e.g. F006 removes the bottom link that `popup-and-manage-access/F012`–`F016` click; F001–F005 replace the textarea).
- **Risky areas:**
  - `chrome.sidePanel.open()` needs a user gesture and a `windowId`/`tabId`. Awaiting `chrome.windows.getCurrent()` inside the click handler may lose the gesture: read the window id when the popup mounts. Whether headless Chromium in Playwright can really open a side panel is unknown; if not, e2e checks the stored choice, `chrome.action.getPopup` and `chrome.sidePanel.getPanelBehavior`, and opens `sidepanel.html` as a tab (a `sidepanel` fixture next to `panel`). Say in the progress entry what could only be checked by hand in `npm run dev:fake`.
  - Re-adding the `sidePanel` permission: it has no install warning, so updating from 0.3.0 shouldn't disable the extension, but check `chrome://extensions` by hand once. Don't touch the manifest `key`.
  - The side panel stays open across tab switches, unlike the popup, so `currentTabArtifact()` read once at mount (`App.tsx`, `ShareView.tsx`) isn't enough there: listen to `chrome.tabs.onActivated`, `chrome.tabs.onUpdated` (URLs are only visible for claude.ai tabs, via the host permission, with no `tabs` permission) and `chrome.windows.onFocusChanged`. Don't add the `tabs` permission (install warning).
  - Popup and side panel share drafts in `chrome.storage.session` and the run in `chrome.storage.local`. In side-panel mode the toolbar opens the panel, so only one ArtiShare per window edits them; two windows each with a side panel is the same known limitation as two popups.
  - F018 rewrites the screenshots; don't run `npm run screenshots` before that feature.
  - F001 is the biggest change (the textarea becomes rows) and touches many old specs. If it doesn't fit in one session, land the rows with every old spec passing and leave `passes: false` with a clear note, rather than half-migrating the specs.
- **Not in scope:** bumping `version` to 0.4.0 and releasing; a human does that after the PR.
- **Next:** `/harness-work` takes F001.

### 2026-11-12 · F017 · Docs describe the popup and Manage access (done)

- **Did:** Made the three `.claude/` edits that unattended sessions were not allowed to make (from the interactive session): `.claude/commands/harness-work.md:23`, `.claude/commands/harness-plan.md:27` and `.claude/agents/feature-verifier.md:20` now say popup instead of side panel. The rest of F017 was done in 214a445, 477e280 and 22c47be.
- **Verified:** `grep -rIi 'side panel'` finds only `docs/claude-share-api.md` (claude.ai's own Share UI) and `e2e/F001.spec.ts` (asserts there is no side panel) outside `harness/`. `npm run check` (175 unit tests) and `npm run e2e` (74 specs) pass. feature-verifier: PASS.
- **State:** F017 passes. All 18 features pass; the goal is done.
- **Next:** Review the branch and open a PR into `develop`. Before release, check the real claude.ai PATCH/DELETE invite endpoints by hand, since they were only tested against the fake and a stub transport.
- **Notes:** `harness/run.sh` stopped at its 20-session cap; sessions 17–20 were spent on this blocked feature. A feature that needs `.claude/` edits needs a human or the interactive session.

### 2026-11-12 · F017 · Still blocked on the three `.claude/` edits (nothing else left)

- **Did:** Re-tried the edit to `.claude/commands/harness-work.md:23`; refused again, so no workaround was used and the other two were not tried. Found and fixed one more leftover: the comment in `docs/site.css:168` said 'side-panel captures', now 'popup captures'. F018 is already done, so no other feature is open.
- **Verified:** Searched the repo for 'side panel' (case-insensitive, excluding `node_modules`, `.git`, build output, untracked `video/`). What is left: the three `.claude/` lines, `docs/claude-share-api.md:159` (claude.ai's own Share UI, correct), `e2e/F001.spec.ts` (asserts there is no side panel, correct), and `harness/` history. The verifier was not run: F017 step 4 would fail. `npm run check` passes (175 unit tests); `e2e` was not re-run for a comment-only CSS change.
- **State:** F017 `passes: false`. 1 feature left.
- **Next:** A human makes the three edits: `.claude/commands/harness-work.md:23` ('in the side panel and asserts' → 'in the popup and asserts'), `.claude/commands/harness-plan.md:27` ('in the side panel of the fake build' → 'in the popup of the fake build'), `.claude/agents/feature-verifier.md:20` ('from the side panel through' → 'from the popup through'). Then a session runs `npm run check`, the verifier for F017, and flips `passes`.

### 2026-11-12 · F018 · README and store screenshots show the popup

- **Did:** F017 is still blocked on a human (the three `.claude/` edits; an edit to `.claude/commands/harness-work.md` was refused again), so this session took F018 as the log allows. New `scripts/screenshots.spec.ts` (+ `scripts/playwright.config.ts`, `npm run screenshots`) drives the fake build's popup at 380×600, 2x, with made-up addresses and ids (`Ex4mple…`), and writes `docs/images/share|preview|done|manage.png` (760 px wide) and `store/images/screenshot-1-share|2-preview|3-done.png` (1280×800, headline left, popup in a frame right, rendered in a separate 1x browser). README: four images with alt text naming the popup (manage.png is new), a `npm run screenshots` line under Develop, the fake-mode sentence mentions the script. `e2e/F018.spec.ts` checks the PNG sizes, the README tags and alt text, and that the generator only uses made-up ids and addresses. `e2e/node-shims.d.ts` declares the few `node:fs`/`node:url` calls, because the project has no `@types/node`.
- **Verified:** `npm run check` (175 unit tests) and `npm run e2e` (74 specs incl. F018's 4) pass; I looked at every image. feature-verifier: PASS (it could not run commands, so it read files and viewed the images).
- **State:** F018 passes. F017 still `passes: false`, blocked on the three `.claude/` edits: `.claude/commands/harness-work.md:23` ('in the side panel and asserts' → 'in the popup and asserts'), `.claude/commands/harness-plan.md:27` ('in the side panel of the fake build' → 'in the popup of the fake build'), `.claude/agents/feature-verifier.md:20` ('from the side panel through' → 'from the popup through'). 1 feature left.
- **Next:** A human makes those three edits, then a session runs the verifier for F017 and flips `passes`.
- **Notes:**
  - The Share screenshots are scrolled to the bottom so the Preview button shows (the form is taller than a 600 px popup); the top shows a cut-off bit of the Artifacts box.
  - Don't run `npm run screenshots` casually: it rewrites the PNGs (they are not byte-identical between runs).
  - A freshly saved list starts unticked in Share; tick it before Preview.
  - Heredocs and `python3 -` are refused here; use Edit/Write.

### 2026-11-12 · F017 · Still blocked on the three `.claude/` edits (nothing changed)

- **Did:** Nothing in the code or docs. Re-tried the edit to `.claude/commands/harness-work.md:23`; the permission was refused again, so the other two were not tried and no workaround (shell `sed`) was used, since sessions are not meant to edit their own config.
- **Verified:** Only that `grep -rIi 'side panel'` still finds exactly the three `.claude/` lines above (plus `docs/claude-share-api.md`, `video/`, `harness/`, `e2e/F001.spec.ts`). The verifier was not run: step 4 of F017 would fail.
- **State:** F017 `passes: false`. F018 is untouched and also still `false`; it is next in order, but it is not started because F017 is first.
- **Next:** A human makes the three edits listed in the entry below (or lets a session edit `.claude/`), then a session runs the verifier for F017 and flips `passes`.

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
