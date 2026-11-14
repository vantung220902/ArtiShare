import type { BrowserContext } from '@playwright/test';
import { expect, test } from '../fixtures';

// F009: the popup's "Open in side panel" icon moves ArtiShare into the side panel, and from then
// on the toolbar icon opens the side panel. A real toolbar click can't be made from Playwright, so
// what the click does is read back from the browser: the action's popup and the panel behaviour.

/** What the toolbar icon will do and what was remembered, read from a fresh extension page. */
async function toolbar(context: BrowserContext, extensionId: string) {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  const state = await page.evaluate(async () => ({
    popup: await chrome.action.getPopup({}),
    behavior: await chrome.sidePanel.getPanelBehavior(),
    stored: (await chrome.storage.local.get('surface')).surface,
  }));
  await page.close();

  return state;
}

test('the popup has an "Open in side panel" icon button with that tooltip', async ({ panel }) => {
  const icon = panel.getByRole('button', { name: 'Open in side panel' });
  await expect(icon).toBeVisible();
  await expect(icon).toHaveAttribute('title', 'Open in side panel');
  // An icon, not a text button.
  await expect(icon).toHaveClass(/icon-btn/);
  await expect(icon.locator('svg')).toBeVisible();
});

test('the icon is in the header and stays clear of the account pill at 380 px', async ({ panel }) => {
  const icon = panel.getByRole('button', { name: 'Open in side panel' });
  const header = panel.locator('header.header');
  await expect(header.getByRole('button', { name: 'Open in side panel' })).toBeVisible();
  const [iconBox, pillBox] = await Promise.all([
    icon.boundingBox(),
    header.locator('.account').boundingBox(),
  ]);
  expect(iconBox!.x).toBeGreaterThanOrEqual(pillBox!.x + pillBox!.width);
  expect(iconBox!.x + iconBox!.width).toBeLessThanOrEqual(380);
});

test('before anything is chosen the toolbar icon opens the popup', async ({ context, extensionId }) => {
  const state = await toolbar(context, extensionId);

  expect(state.popup).toMatch(/popup\.html$/);
  expect(state.behavior.openPanelOnActionClick).toBe(false);
  expect(state.stored).toBeUndefined();
});

test('clicking it closes the popup and makes the toolbar icon open the side panel', async ({
  context,
  extensionId,
  panel,
}) => {
  const closed = panel.waitForEvent('close');
  await panel.getByRole('button', { name: 'Open in side panel' }).click();
  // The popup closes itself once the panel is open (it would have shown an error instead).
  await closed;

  const state = await toolbar(context, extensionId);
  expect(state.popup).toBe('');
  expect(state.behavior.openPanelOnActionClick).toBe(true);
  expect(state.stored).toBe('sidepanel');
});

test('the choice is kept when the extension pages are opened again', async ({
  context,
  extensionId,
  panel,
}) => {
  const closed = panel.waitForEvent('close');
  await panel.getByRole('button', { name: 'Open in side panel' }).click();
  await closed;

  // A reopened popup page still works as the popup and the setting is unchanged.
  const again = await context.newPage();
  await again.goto(`chrome-extension://${extensionId}/popup.html`);
  await expect(again.getByRole('heading', { name: 'ArtiShare' })).toBeVisible();
  await again.close();
  expect((await toolbar(context, extensionId)).stored).toBe('sidepanel');
});

test('the side panel shows ArtiShare and has no "Open in side panel" icon', async ({ sidePanel }) => {
  await expect(sidePanel.getByRole('heading', { name: 'ArtiShare' })).toBeVisible();
  await expect(sidePanel.getByRole('tab', { name: 'Share' })).toBeVisible();
  await expect(sidePanel.getByRole('button', { name: 'Open in side panel' })).toHaveCount(0);
});
