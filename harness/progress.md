# Harness progress

The memory between long-running sessions, together with `git log`. Newest entry first: each session adds one at the top of **Sessions** before it commits. See `CLAUDE.md` for the routine.

## Sessions

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
