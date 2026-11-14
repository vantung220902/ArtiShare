#!/usr/bin/env bash
# Runs /harness-work sessions back to back, each in a fresh context, until every feature in
# harness/feature_list.json passes. Each session reads the progress log and git history to pick
# up where the last one stopped, finishes one feature, and commits.
#
# Usage: harness/run.sh [max-sessions]        (default 10)
# Env:   PERMISSION_MODE   auto (default), acceptEdits, ...
#        MAX_BUDGET_USD    spending cap per session
#        MODEL             model for each session
set -euo pipefail
cd "$(dirname "$0")/.."

# Strip credentials (API keys, npm tokens, ...) from the environment of every command a session runs.
export CLAUDE_CODE_SUBPROCESS_ENV_SCRUB=1

# With the scrub on, the CLI ignores --permission-mode and asks before each tool, which stalls a
# session nobody is watching. So list what a /harness-work session needs; anything else is refused
# (no push, no branch switching, no network), and settings.json deny rules still apply on top.
# git branch and git stash are listed only in the forms /harness-work uses, so a session can't
# delete or move a branch (git branch -D/-f) or throw away stashed work (git stash drop/clear).
ALLOWED_TOOLS="Read,Edit,Write,Glob,Grep,Agent,\
Bash(harness/init.sh),Bash(npm run *),Bash(npx prettier *),Bash(npx vitest *),Bash(npx playwright *),\
Bash(git status*),Bash(git diff*),Bash(git log*),Bash(git branch --show-current),Bash(git add *),Bash(git commit *),\
Bash(git stash),Bash(git stash push*),Bash(git stash list*),\
Bash(pwd),Bash(ls *)"

# A headless session doesn't exit while a wake-up timer is pending. One set "as a fallback" while
# waiting for the verifier kept a finished session idle for 17 minutes. The verifier's result
# arrives without a timer, so a session never needs one.
DISALLOWED_TOOLS="ScheduleWakeup,CronCreate,Monitor"

max=${1:-10}
mode=${PERMISSION_MODE:-auto}

branch=$(git branch --show-current)
case "$branch" in
  develop | main | master | "")
    echo "Refusing to run on '${branch:-detached HEAD}'. Switch to the harness branch first (see harness/feature_list.json)."
    exit 1
    ;;
esac

remaining() {
  node -e 'console.log(require("./harness/feature_list.json").features.filter((f) => !f.passes).length)'
}

if [ "$(node -e 'console.log(require("./harness/feature_list.json").features.length)')" -eq 0 ]; then
  echo "The feature list is empty. Run /harness-plan <goal> in Claude Code first."
  exit 1
fi

mkdir -p harness/logs
stalls=0

for ((i = 1; i <= max; i++)); do
  left=$(remaining)
  if [ "$left" -eq 0 ]; then
    echo "All features pass."
    exit 0
  fi

  before=$(git rev-parse HEAD)
  log="harness/logs/$(date +%Y%m%d-%H%M%S)-session-$i.log"
  echo "== Session $i/$max · $left feature(s) left · log: $log"

  args=(-p "/harness-work" --permission-mode "$mode" --allowedTools "$ALLOWED_TOOLS" --disallowedTools "$DISALLOWED_TOOLS")
  [ -n "${MAX_BUDGET_USD:-}" ] && args+=(--max-budget-usd "$MAX_BUDGET_USD")
  [ -n "${MODEL:-}" ] && args+=(--model "$MODEL")
  claude "${args[@]}" 2>&1 | tee "$log" || true

  # A session that commits nothing is stuck; two in a row needs a human.
  if [ "$(git rev-parse HEAD)" = "$before" ]; then
    stalls=$((stalls + 1))
    echo "!! Session $i made no commit ($stalls in a row)."
    if [ "$stalls" -ge 2 ]; then
      echo "Stopping: two sessions without progress. Read $log and harness/progress.md."
      exit 1
    fi
  else
    stalls=0
  fi
done

echo "Stopped after $max sessions; $(remaining) feature(s) left."
