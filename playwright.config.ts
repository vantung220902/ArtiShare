import { defineConfig } from '@playwright/test';

// End-to-end tests drive the real extension, built with the in-memory fake claude.ai
// (`npm run build:fake`), so nothing is ever sent. Run them with `npm run e2e`.
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  // Each test gets its own browser and fresh profile, so tests share no storage and can run side
  // by side. The suite runs 3–4 times per harness session, so this saves minutes each time.
  fullyParallel: true,
  workers: 4,
  // The suite takes about a minute. On an overloaded machine it once crawled for 17, past the point
  // where a harness session's command is killed with no report; this stops it first and says which
  // tests didn't finish.
  globalTimeout: 8 * 60_000,
  reporter: [['list']],
  use: { trace: 'retain-on-failure' },
});
