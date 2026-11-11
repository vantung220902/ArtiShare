#!/usr/bin/env bash
# Prints where the long-running work stands: goal, feature count, next feature, last session.
# Runs as a SessionStart hook (.claude/settings.json), so every session and every compaction
# starts with this in context. Prints nothing while no goal is set.
set -euo pipefail
cd "$(dirname "$0")/.."

node -e '
const { goal, branch, features } = require("./harness/feature_list.json");
if (!goal) process.exit(0);
const left = features.filter((f) => !f.passes);
const next = left[0];
console.log("## Long-running harness");
console.log(`Goal: ${goal}`);
console.log(`Branch: ${branch ?? "(not set)"}`);
console.log(`Features passing: ${features.length - left.length}/${features.length}`);
console.log(next ? `Next feature: ${next.id} · ${next.description}` : "All features pass.");
' || exit 0

if node -e 'process.exit(require("./harness/feature_list.json").goal ? 0 : 1)'; then
  echo "Current branch: $(git branch --show-current)"
  echo
  echo "Last session (harness/progress.md):"
  awk '/^### /{n++} n==1' harness/progress.md
  echo
  echo "Recent commits:"
  git log --oneline -5
  echo
  echo "Run /harness-work to take the next feature."
fi
