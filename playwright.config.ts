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
  reporter: [['list']],
  use: { trace: 'retain-on-failure' },
});
