import { chromium, test as base, type BrowserContext, type Page } from '@playwright/test';

const EXTENSION_DIR = new URL('../.output/chrome-mv3-fake', import.meta.url).pathname;

/**
 * `context` is a fresh Chromium profile with the fake build loaded; `panel` is the popup page
 * opened as a normal tab (a real action popup can't be opened from Playwright).
 */
export const test = base.extend<{ context: BrowserContext; panel: Page }>({
  // oxlint-disable-next-line no-empty-pattern -- Playwright fixtures must destructure their deps
  context: async ({}, provide) => {
    const context = await chromium.launchPersistentContext('', {
      channel: 'chromium',
      args: [`--disable-extensions-except=${EXTENSION_DIR}`, `--load-extension=${EXTENSION_DIR}`],
    });
    await provide(context);
    await context.close();
  },
  panel: async ({ context }, provide) => {
    // The background worker answers the panel's messages, and its URL carries the extension ID,
    // so the ID always matches the build that was loaded.
    const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
    const extensionId = new URL(worker.url()).host;
    const page = await context.newPage();
    // The run asks for confirmation with window.confirm; accept it like a user would.
    page.on('dialog', (d) => void d.accept());
    await page.goto(`chrome-extension://${extensionId}/popup.html`);
    await provide(page);
  },
});

export { expect } from '@playwright/test';
