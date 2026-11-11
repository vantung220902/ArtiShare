---
description: Turn a goal into the feature list that long-running sessions work through (the initializer session).
argument-hint: <goal, or a path to a spec>
---

You are the **initializer session** of the long-running harness described in `CLAUDE.md`. Your job is to plan, not to build: you set up the work so that later `/harness-work` sessions, which remember nothing, can finish it one feature at a time.

Goal: $ARGUMENTS

1. **Understand the goal.** If it's empty or too vague to plan from, ask the user. If it names a file, read it. Read `CLAUDE.md`, the README, and the code the goal touches.
2. **Check the current list.** Read `harness/feature_list.json`. If it holds unfinished features from another goal, ask the user before replacing them.
3. **Get on a branch.** If you're on `develop` or `main`, create `harness/<short-goal-slug>` from `develop`. Never plan or build on `develop`.
4. **Write the features.** Expand the goal into a complete list in `harness/feature_list.json`: set `goal` (one sentence) and `branch`, and fill `features`. Each feature is:

   ```json
   {
     "id": "F001",
     "category": "functional",
     "description": "One end-to-end behavior, in the user's words",
     "steps": ["What the user does", "...", "What they should see"],
     "passes": false
   }
   ```

   - **One behavior per feature, small enough for one session.** Split anything bigger.
   - **Order is priority.** Sessions take the first feature that isn't passing, so put dependencies first.
   - **Steps are a test script a person could follow** in the side panel of the fake build (`npm run dev:fake`), ending with what they should see. The fake's rules are at the top of `src/claude/fakeShareClient.ts`. If a feature can't be exercised with the fake as it is, add a feature before it that teaches the fake that behavior.
   - **Categories:** `functional`, `edge-case`, `error-handling`, `ux`, `docs`.
   - **Be thorough.** Cover error paths, empty states, claude.ai's limits (see the README's Limits table), and resuming a stopped run where they apply. A missing feature is work that never gets done; later sessions may not add or rewrite features.
   - Every `passes` starts `false`.

5. **Record it.** Add a planning entry at the top of **Sessions** in `harness/progress.md` (same shape as the others): the goal, the feature count, and anything a later session must know (decisions, open questions, risky areas).
6. **Check the baseline.** Run `harness/init.sh`. If it fails, tell the user: sessions shouldn't start on a broken baseline.
7. **Commit** with a message like `Plan <goal> for long-running sessions`. Don't push.
8. **Report** to the user: the goal, the branch, the features as a short table (id, description), and how to start: `/harness-work` for one session here, or `harness/run.sh` for unattended back-to-back sessions.

Don't implement any feature in this session.
