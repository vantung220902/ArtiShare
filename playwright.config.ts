import { defineConfig } from '@playwright/test';

// End-to-end tests drive the real extension, built with the in-memory fake claude.ai
// (`npm run build:fake`), so nothing is ever sent. Run them with `npm run e2e`.
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  // One browser with the extension loaded per test; extension storage is not shared between them.
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: { trace: 'retain-on-failure' },
});
