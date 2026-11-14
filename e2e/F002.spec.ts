import type { BrowserContext, Page } from '@playwright/test';
import { expect, test } from './fixtures';

// F002: when Chrome can't open the popup from the side panel the panel stays open and says so,
// instead of closing and looking just like the X. A real toolbar click can't be made from Playwright,
// so what the icon will do is read back from the browser: the action's popup, the panel behaviour and
// the stored choice.

const CLICK_ICON = 'Click the ArtiShare icon in the toolbar to open it.';

/** What the toolbar icon will do and what was remembered, read from a fresh extension page. */
async function toolbar(context: BrowserContext, extensionId: string) {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  const state = await page.evaluate(async () => ({
    popup: await chrome.action.getPopup({}),
    behavior: (await chrome.sidePanel.getPanelBehavior()).openPanelOnActionClick,
    stored: (await chrome.storage.local.get('surface')).surface as string | undefined,
  }));
  await page.close();

  return state;
}

/** The toolbar icon opens the side panel, as after "Open in side panel". */
const iconOpensSidePanel = (page: Page) =>
  page.evaluate(async () => {
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
    await chrome.action.setPopup({ popup: '' });
    await chrome.storage.local.set({ surface: 'sidepanel' });
  });

const openPopupRejects = (page: Page, message: string) =>
  page.evaluate((reason) => {
    chrome.action.openPopup = () => Promise.reject(new Error(reason));
  }, message);

test('when openPopup rejects the panel stays open, says why, and the switch still happened', async ({
  context,
  extensionId,
  sidePanel,
}) => {
  await iconOpensSidePanel(sidePanel);
  await openPopupRejects(sidePanel, 'Could not find an active browser window.');
  let closed = false;
  sidePanel.on('close', () => (closed = true));

  await sidePanel.getByRole('button', { name: 'Use popup instead' }).click();

  await expect(sidePanel.locator('output.notice')).toHaveText(
    `Switched to the popup, but Chrome couldn't open it: Could not find an active browser window. ${CLICK_ICON}`,
  );
  expect(closed).toBe(false);
  // Not an error: this is a notice about a switch that worked.
  await expect(sidePanel.getByText("Couldn't switch to the popup")).toHaveCount(0);

  const state = await toolbar(context, extensionId);
  expect(state.popup).toBe(`chrome-extension://${extensionId}/popup.html`);
  expect(state.behavior).toBe(false);
  expect(state.stored).toBe('popup');
});

test('without chrome.action.openPopup the panel says to click the icon, with no "couldn\'t open it"', async ({
  sidePanel,
}) => {
  await iconOpensSidePanel(sidePanel);
  // A Chrome older than 127 has no such function.
  await sidePanel.evaluate(() => {
    (chrome.action as { openPopup?: unknown }).openPopup = undefined;
  });
  let closed = false;
  sidePanel.on('close', () => (closed = true));

  await sidePanel.getByRole('button', { name: 'Use popup instead' }).click();

  await expect(sidePanel.locator('output.notice')).toHaveText(`Switched to the popup. ${CLICK_ICON}`);
  await expect(sidePanel.locator('output.notice')).not.toContainText("couldn't open it");
  expect(closed).toBe(false);
});

test('while the notice shows the icon reads Open popup, tries openPopup again, and closes the panel on success', async ({
  sidePanel,
}) => {
  await iconOpensSidePanel(sidePanel);
  // Counted in the page, since a successful retry closes it.
  await sidePanel.evaluate(() => {
    (window as unknown as { calls: number }).calls = 0;
    chrome.action.openPopup = () => {
      (window as unknown as { calls: number }).calls++;

      return Promise.reject(new Error('Could not find an active browser window.'));
    };
  });
  await sidePanel.getByRole('button', { name: 'Use popup instead' }).click();
  await expect(sidePanel.locator('output.notice')).toBeVisible();
  expect(await sidePanel.evaluate(() => (window as unknown as { calls: number }).calls)).toBe(1);

  // Still failing: the retry is a real attempt, the panel stays and the notice is still there.
  await expect(sidePanel.getByRole('button', { name: 'Use popup instead' })).toHaveCount(0);
  await sidePanel.getByRole('button', { name: 'Open popup' }).click();
  await expect(sidePanel.locator('output.notice')).toBeVisible();
  await expect.poll(() => sidePanel.evaluate(() => (window as unknown as { calls: number }).calls)).toBe(2);
  await expect(sidePanel.getByRole('button', { name: 'Open popup' })).toBeVisible();

  // Chrome can open it this time: the panel closes.
  await sidePanel.evaluate(() => {
    chrome.action.openPopup = () => Promise.resolve();
  });
  const closed = sidePanel.waitForEvent('close');
  await sidePanel.getByRole('button', { name: 'Open popup' }).click();
  await closed;
});

test('if the choice itself can not be saved nothing changes and the existing message shows', async ({
  context,
  extensionId,
  sidePanel,
}) => {
  await iconOpensSidePanel(sidePanel);
  await sidePanel.evaluate(() => {
    const set = chrome.storage.local.set.bind(chrome.storage.local);
    // Only the remembered choice is refused; the rest of the page still saves what it needs to.
    chrome.storage.local.set = ((items: Record<string, unknown>, ...rest: unknown[]) =>
      'surface' in items
        ? Promise.reject(new Error('Storage is full'))
        : (set as (...a: unknown[]) => unknown)(items, ...rest)) as typeof chrome.storage.local.set;
    (window as unknown as { opened: number }).opened = 0;
    chrome.action.openPopup = () => {
      (window as unknown as { opened: number }).opened++;

      return Promise.resolve();
    };
  });
  let closed = false;
  sidePanel.on('close', () => (closed = true));

  await sidePanel.getByRole('button', { name: 'Use popup instead' }).click();

  await expect(sidePanel.getByText("Couldn't switch to the popup: Storage is full")).toBeVisible();
  await expect(sidePanel.locator('output.notice')).toHaveCount(0);
  expect(closed).toBe(false);
  // Neither the popup nor the toolbar behaviour was touched, and the popup wasn't opened.
  expect(await sidePanel.evaluate(() => (window as unknown as { opened: number }).opened)).toBe(0);
  const state = await toolbar(context, extensionId);
  expect(state.popup).toBe('');
  expect(state.behavior).toBe(true);
  expect(state.stored).toBe('sidepanel');
  await expect(sidePanel.getByRole('button', { name: 'Use popup instead' })).toBeVisible();
});
