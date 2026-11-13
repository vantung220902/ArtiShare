import { defineConfig } from '@playwright/test';

// Not part of `npm run e2e`: this one writes the README and store screenshots (`npm run screenshots`).
export default defineConfig({
  testDir: '.',
  workers: 1,
  reporter: [['list']],
  // A step that never finds its element fails with a line number instead of the whole test timing out.
  expect: { timeout: 15_000 },
  use: { actionTimeout: 15_000 },
});
