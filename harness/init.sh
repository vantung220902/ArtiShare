#!/usr/bin/env bash
# Brings a fresh session to a known-good baseline, and fails loudly if the last session left
# something broken. Safe to run any number of times. Every /harness-work session runs it first.
set -euo pipefail
cd "$(dirname "$0")/.."

echo "== Node $(node -v)"
# Install only when the lockfile changed since the last install.
if [ ! -f node_modules/.package-lock.json ] || [ package-lock.json -nt node_modules/.package-lock.json ]; then
  npm ci
fi
# The Chromium build Playwright drives. A no-op once it's downloaded.
npx playwright install chromium >/dev/null

echo "== Static checks: typecheck, lint, format, unit tests"
npm run check

echo "== End to end: the extension's fake build, driven in Chromium"
npm run e2e

echo "== Baseline OK"
