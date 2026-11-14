---
description: One long-running coding session. Get your bearings, check the baseline, finish one feature, verify it like a user, and leave a clean, committed state.
---

You are one session in a series working through `harness/feature_list.json`. You remember nothing from earlier sessions: the progress log, the feature list and git history are the memory. Follow these steps in order.

**Long commands.** `harness/run.sh` runs you headless, and when your reply ends, the session ends. Two sessions in a row lost a finished feature by starting the e2e suite in the background and ending their reply to wait for it. So:

- Run `harness/init.sh`, `npm run e2e` and `npx playwright test` in the foreground, with the Bash timeout at 600000 (10 minutes). Never in the background, and never two at once: each rebuilds `.output/chrome-mv3-fake`, which breaks a run already going.
- Never end your reply to wait for something. Nothing will wake you.
- The full suite normally takes 1–2 minutes. If it's much slower, or tests time out in `launchPersistentContext`, the machine is overloaded: re-run the failing specs on their own with `--workers=1`. If they pass there but the full suite still can't finish, leave `passes` at `false`, write that in the progress entry, and commit your work so the next session starts from it.

## 1. Get your bearings

- Run `pwd` and work only inside it. Run `git status` and `git branch --show-current`. If you're on `develop` or `main`, or not on the branch named in the feature list, stop and say so.
- Read `harness/progress.md` (newest entry first) and `git log --oneline -20`.
- Read `harness/feature_list.json` and take the **first feature whose `passes` is `false`**. Skip one only if the progress log says it's blocked on a human, and say so in your entry.
- If uncommitted changes are left over, find out from the log what they were. Finish them if they belong to your feature, or set them aside with `git stash` and note it.

## 2. Check the baseline before anything new

Run `harness/init.sh`. If it fails, the last session left something broken: fixing that is this session's first job, before your feature. Note what you found.

## 3. Build exactly one feature

- Read the code it touches and follow `CLAUDE.md`'s conventions.
- Write the tests with the change:
  - unit tests in `tests/` for logic in `src/core` and `src/lib`;
  - an end-to-end spec, `e2e/<feature id>.spec.ts`, that performs the feature's `steps` in the popup and asserts what the user should see. Use the `panel` fixture from `e2e/fixtures.ts`.
- Stay inside this one feature. If it turns out bigger than a session, finish a coherent part, leave `passes` at `false`, and write what's left in the progress entry.
- If you run low on context, stop at a point where the checks pass, then go straight to step 5.

## 4. Verify like a user, then flip `passes`

- `npm run check` and `npm run e2e` both pass. If Prettier complains, run `npm run format`.
- Get an independent verdict: run the **feature-verifier** agent with the feature id. Fix what it finds and run it again. It runs the e2e suite itself, so run none of your own until it answers.
- Only after a **PASS**, set that feature's `"passes": true`. That is the only edit you may make to the list. **It is unacceptable to remove features or to edit their description, steps or category, because that leads to missing or buggy functionality.** If a feature seems wrong or impossible, leave it failing and explain why in the progress entry for a human to decide.

## 5. Leave a clean state

Clean means a developer could merge this branch and start the next feature without tidying up.

- Add an entry at the **top** of **Sessions** in `harness/progress.md`:

  ```markdown
  ### <YYYY-MM-DD> · <feature id> · <short title>

  - **Did:** what changed, and where
  - **Verified:** commands run, the verifier's verdict
  - **State:** passes true or false; anything half-done
  - **Next:** what the next session should do first
  - **Notes:** bugs found, decisions, traps (omit if none)
  ```

- Commit everything, the progress entry included, with a message that names the feature, like `F003: Show a skipped count per artifact`. Don't push, open a PR, or switch branches.
- Then stop: one feature per session. Report the feature, the verdict and how many features are left.
