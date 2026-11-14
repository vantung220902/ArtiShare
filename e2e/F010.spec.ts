import type { BrowserContext, Page } from '@playwright/test';
import { expect, test } from './fixtures';

// F010: the side panel's "Use popup instead" icon switches back to the popup. A real toolbar click
// can't be made from Playwright, so what it does is read back from the browser: the action's popup,
// the panel behaviour and the stored choice.

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

/** Opens a fresh page of the popup or side panel; the side panel is as wide as the real one. */
async function open(
  context: BrowserContext,
  extensionId: string,
  file: 'popup' | 'sidepanel',
): Promise<Page> {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/${file}.html`);
  await expect(page.getByRole('heading', { name: 'ArtiShare' })).toBeVisible();

  return page;
}

test('the side panel has a "Use popup instead" icon button with that tooltip', async ({ sidePanel }) => {
  const icon = sidePanel.getByRole('button', { name: 'Use popup instead' });
  await expect(icon).toBeVisible();
  await expect(icon).toHaveAttribute('title', 'Use popup instead');
  await expect(icon).toHaveClass(/icon-btn/);
  await expect(icon.locator('svg')).toBeVisible();
  await expect(
    sidePanel.locator('header.header').getByRole('button', { name: 'Use popup instead' }),
  ).toBeVisible();
});

test('clicking it closes the side panel and makes the toolbar icon open the popup', async ({
  context,
  extensionId,
}) => {
  // Start from the side panel being chosen.
  const first = await open(context, extensionId, 'popup');
  const firstClosed = first.waitForEvent('close');
  await first.getByRole('button', { name: 'Open in side panel' }).click();
  await firstClosed;
  expect((await toolbar(context, extensionId)).popup).toBe('');

  const sidePanel = await open(context, extensionId, 'sidepanel');
  const closed = sidePanel.waitForEvent('close');
  await sidePanel.getByRole('button', { name: 'Use popup instead' }).click();
  await closed;

  const state = await toolbar(context, extensionId);
  expect(state.popup).toMatch(/popup\.html$/);
  expect(state.behavior.openPanelOnActionClick).toBe(false);
  expect(state.stored).toBe('popup');
});

test('the popup has no "Use popup instead" icon', async ({ panel }) => {
  await expect(panel.getByRole('button', { name: 'Open in side panel' })).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Use popup instead' })).toHaveCount(0);
});

test('switching to the side panel and back twice leaves the toolbar icon on the last choice', async ({
  context,
  extensionId,
}) => {
  for (const round of [1, 2]) {
    const popup = await open(context, extensionId, 'popup');
    const popupClosed = popup.waitForEvent('close');
    await popup.getByRole('button', { name: 'Open in side panel' }).click();
    await popupClosed;
    let state = await toolbar(context, extensionId);
    expect(state, `round ${round}: side panel chosen`).toMatchObject({
      popup: '',
      behavior: { openPanelOnActionClick: true },
      stored: 'sidepanel',
    });

    const sidePanel = await open(context, extensionId, 'sidepanel');
    const panelClosed = sidePanel.waitForEvent('close');
    await sidePanel.getByRole('button', { name: 'Use popup instead' }).click();
    await panelClosed;
    state = await toolbar(context, extensionId);
    expect(state.popup, `round ${round}: popup chosen`).toMatch(/popup\.html$/);
    expect(state.behavior.openPanelOnActionClick).toBe(false);
    expect(state.stored).toBe('popup');
  }

  // Ending on the side panel after a further switch is remembered just the same.
  const popup = await open(context, extensionId, 'popup');
  const closed = popup.waitForEvent('close');
  await popup.getByRole('button', { name: 'Open in side panel' }).click();
  await closed;
  expect((await toolbar(context, extensionId)).stored).toBe('sidepanel');
});
