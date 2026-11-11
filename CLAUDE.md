# ArtiShare

A Chrome extension (WXT, React 19, TypeScript, Manifest V3) that invites saved lists of email addresses to claude.ai artifacts in bulk. The README explains what it does for users; this file is for working on it.

## Layout

- `src/core/`: pure logic (email parsing, planning who to invite, the run loop). No `chrome.*`; unit-tested in `tests/`.
- `src/claude/`: talking to claude.ai. `apiShareClient.ts` is the real one; `fakeShareClient.ts` is an in-memory stand-in whose rules are at the top of the file.
- `src/lib/`: storage, messages between the side panel and the background, the config and run managers.
- `src/entrypoints/`: `background.ts` (service worker: runs the invites) and `sidepanel/` (the UI). Shared UI pieces are in `src/ui/`.
- `tests/`: Vitest unit tests. `e2e/`: Playwright tests that drive the fake build in Chromium.

## Commands

- `npm run check`: typecheck, lint (Oxlint), format check (Prettier), unit tests. Must pass before every commit.
- `npm run e2e`: builds with the fake claude.ai (`build:fake`) and runs the Playwright tests headless. Nothing is sent anywhere.
- `npm run dev:fake`: opens Chrome with the fake build, to click through by hand.
- `npm run format`: fixes formatting.

## Conventions

- Never send real invitations while developing or testing: use the fake (`dev:fake`, `build:fake`, `e2e`).
- Don't change or remove the manifest `key` in `wxt.config.ts`. It pins the extension ID that users' saved lists depend on.
- Comments say why, not what. Keep the README in step with user-visible changes.
- Work on a branch and merge into `develop` through a PR. Commit messages are short imperative sentences ("Add …", "Fix …").

## Long-running sessions

Large goals are built over many sessions, following Anthropic's [harness for long-running agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents). Each session starts with an empty context, so the state lives in files:

| File                                 | What it holds                                                                                         |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| `harness/feature_list.json`          | The goal, its branch, and every feature with test steps and `passes`. Order is priority.              |
| `harness/progress.md`                | One entry per session, newest first: what was done, verified, left, and next.                         |
| `harness/init.sh`                    | Gets to a known-good baseline: installs, `npm run check`, `npm run e2e`. Fails if anything is broken. |
| `harness/status.sh`                  | Where things stand. Runs at every session start and after compaction (`.claude/settings.json` hook).  |
| `harness/run.sh`                     | Runs `/harness-work` sessions back to back, each with a fresh context, until every feature passes.    |
| `.claude/agents/feature-verifier.md` | A skeptical evaluator that must return PASS before a feature is marked as passing.                    |

- `/harness-plan <goal>` starts a goal: it makes the branch, writes the feature list and commits. It builds nothing.
- `/harness-work` is one session: get your bearings, run `harness/init.sh`, build the first failing feature with unit and e2e tests, get a PASS from the feature-verifier, set `passes: true`, write a progress entry, commit, stop.
- Features are never removed or rewritten by a session; only `passes` changes. One feature per session. Never work on `develop`, and never push.

### Secrets

`.claude/settings.json` (local only, not in git) keeps credentials away from sessions: `CLAUDE_CODE_SUBPROCESS_ENV_SCRUB` strips API keys and tokens from the environment of every command Claude runs, `Read` deny rules block `.env` files, private keys and the credential files in your home folder, and `Bash` deny rules block printing the environment, keychain and token commands, and `curl`/`wget`. Sessions can't edit their own settings. Never put a real secret in `.env.fake` or any committed file.
