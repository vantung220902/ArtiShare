import type { BrowserContext, Page } from '@playwright/test';
import { expect, test } from './fixtures';

// F015: when Chrome can't open the side panel the popup stays open and says why, and the toolbar
// icon keeps opening the popup. A real toolbar click can't be made from Playwright, so what the icon
// will do is read back from the browser: the action's popup, the panel behaviour and the stored choice.

/** What the toolbar icon will do and what was remembered, read from a fresh extension page. */
async function toolbar(context: BrowserContext, extensionId: string) {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  const state = await page.evaluate(async () => ({
    popup: await chrome.action.getPopup({}),
    behavior: await chrome.sidePanel.getPanelBehavior(),
    stored: (await chrome.storage.local.get('surface')).surface as string | undefined,
  }));
  await page.close();

  return state;
}

/** Makes `chrome.sidePanel.open` reject with `reason` in this page. */
const failToOpen = (page: Page, reason: string) =>
  page.evaluate((message) => {
    chrome.sidePanel.open = () => Promise.reject(new Error(message));
  }, reason);

test('a failing sidePanel.open leaves the popup open with the reason and the Share form as it was', async ({
  panel,
}) => {
  const share = panel.getByRole('tabpanel', { name: 'Share' });
  const ONE = 'https://claude.ai/artifact/ExampleArtifactOne01';
  const box = share.getByRole('textbox', { name: /Artifacts/ });
  await box.fill(ONE);
  await box.press('Enter');
  await expect(share.locator('.artifact-item')).toHaveText([ONE]);
  const before = await panel.locator('.popup-body').innerText();

  await failToOpen(panel, 'Side panel is not available here');
  let closed = false;
  panel.on('close', () => (closed = true));
  await panel.getByRole('button', { name: 'Open in side panel' }).click();

  await expect(
    panel.getByText("Couldn't open the side panel: Side panel is not available here"),
  ).toBeVisible();
  expect(closed).toBe(false);
  // Still the popup, with the same icon to try again, and the form untouched.
  await expect(panel.getByRole('button', { name: 'Open in side panel' })).toBeVisible();
  await expect(share.locator('.artifact-item')).toHaveText([ONE]);
  expect(await panel.locator('.popup-body').innerText()).toBe(before);
});

test('after the failure the toolbar icon still opens the popup and the choice is still popup', async ({
  context,
  extensionId,
  panel,
}) => {
  await failToOpen(panel, 'nope');
  await panel.getByRole('button', { name: 'Open in side panel' }).click();
  await expect(panel.getByText("Couldn't open the side panel: nope")).toBeVisible();

  const state = await toolbar(context, extensionId);
  expect(state.popup).toMatch(/popup\.html$/);
  expect(state.behavior.openPanelOnActionClick).toBe(false);
  expect(state.stored).not.toBe('sidepanel');
});

test('a second try after the failure can succeed and is remembered', async ({
  context,
  extensionId,
  panel,
}) => {
  // First attempt fails; the second uses the real call, which closes this page like a real switch.
  await failToOpen(panel, 'first try');
  await panel.getByRole('button', { name: 'Open in side panel' }).click();
  await expect(panel.getByText("Couldn't open the side panel: first try")).toBeVisible();

  await panel.evaluate(() => {
    chrome.sidePanel.open = () => Promise.resolve();
  });
  const closed = panel.waitForEvent('close');
  await panel.getByRole('button', { name: 'Open in side panel' }).click();
  await closed;
  expect((await toolbar(context, extensionId)).stored).toBe('sidepanel');
});

test('without chrome.sidePanel the popup shows no Open in side panel icon', async ({
  context,
  extensionId,
}) => {
  const page = await context.newPage();
  // A Chrome without side panels has no such object at all.
  await page.addInitScript(() => {
    Object.defineProperty(chrome, 'sidePanel', { value: undefined, configurable: true });
  });
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  expect(await page.evaluate(() => typeof chrome.sidePanel)).toBe('undefined');

  await expect(page.getByRole('heading', { name: 'ArtiShare' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open in side panel' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Use popup instead' })).toHaveCount(0);
  // The rest of the header is there, and the popup works.
  await expect(page.locator('header.header')).toBeVisible();
  await expect(
    page.getByRole('tabpanel', { name: 'Share' }).getByRole('textbox', { name: /Artifacts/ }),
  ).toBeVisible();
});

test('with chrome.sidePanel present the icon is shown (control for the test above)', async ({ panel }) => {
  await expect(panel.getByRole('button', { name: 'Open in side panel' })).toBeVisible();
});
