import { chromium, expect, test as base, type BrowserContext, type Page } from '@playwright/test';

const EXTENSION_DIR = new URL('../.output/chrome-mv3-fake', import.meta.url).pathname;

async function openPage(context: BrowserContext, extensionId: string, file: string) {
  const page = await context.newPage();
  // Confirmations are drawn inside the popup because a browser dialog can close it. A native
  // dialog is therefore always a bug: dismiss it and fail the test that opened it.
  const dialogs: string[] = [];
  page.on('dialog', (d) => {
    dialogs.push(d.message());
    void d.dismiss();
  });
  await page.goto(`chrome-extension://${extensionId}/${file}`);

  return { page, dialogs };
}

/**
 * `context` is a fresh Chromium profile with the fake build loaded; `panel` is the popup page
 * opened as a normal tab (a real action popup can't be opened from Playwright) and `sidePanel`
 * is the side panel page opened the same way, at 400×900.
 */
export const test = base.extend<{
  context: BrowserContext;
  extensionId: string;
  panel: Page;
  sidePanel: Page;
}>({
  // oxlint-disable-next-line no-empty-pattern -- Playwright fixtures must destructure their deps
  context: async ({}, provide) => {
    const context = await chromium.launchPersistentContext('', {
      channel: 'chromium',
      args: [`--disable-extensions-except=${EXTENSION_DIR}`, `--load-extension=${EXTENSION_DIR}`],
    });
    await provide(context);
    await context.close();
  },
  extensionId: async ({ context }, provide) => {
    // The background worker answers the panel's messages, and its URL carries the extension ID,
    // so the ID always matches the build that was loaded.
    const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
    await provide(new URL(worker.url()).host);
  },
  panel: async ({ context, extensionId }, provide) => {
    const { page, dialogs } = await openPage(context, extensionId, 'popup.html');
    await provide(page);
    expect(dialogs, 'no browser dialog should open').toEqual([]);
  },
  sidePanel: async ({ context, extensionId }, provide) => {
    const { page, dialogs } = await openPage(context, extensionId, 'sidepanel.html');
    await page.setViewportSize({ width: 400, height: 900 });
    await provide(page);
    expect(dialogs, 'no browser dialog should open').toEqual([]);
  },
});

/** The in-popup confirmation (an alertdialog), for asking what it says and answering it. */
export const confirmation = (page: Pick<Page, 'getByRole'>) => page.getByRole('alertdialog');

/** Click a button in the in-popup confirmation, e.g. `answer(page, 'Send')`. */
export const answer = (page: Pick<Page, 'getByRole'>, name: string) =>
  confirmation(page).getByRole('button', { name, exact: true }).click();

export { expect };
