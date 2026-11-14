import type { BrowserContext, Page } from '@playwright/test';
import { answer, expect, test } from './fixtures';

// F003: switching to the popup closes ArtiShare's side panel in every window, and doesn't interrupt
// a run. Two windows are two sidepanel.html pages; a real toolbar click and the real popup can't be
// had from Playwright, so `openPopup` is replaced by a stand-in that succeeds (the popup is then
// opened as a page, as the browser would) and what the icon will do is read back from the browser.

const ARTIFACT = 'https://claude.ai/artifact/SwitchRunArtifact001';
const RUN_LIST = [
  'ana@example.com',
  'bo@example.com',
  'cy@example.com',
  'di@example.com',
  'ed@example.com',
  'slow-fay@example.com',
];

const share = (page: Page) => page.getByRole('tabpanel', { name: 'Share' });
const lists = (page: Page) => page.getByRole('tabpanel', { name: /Lists/ });

async function open(context: BrowserContext, extensionId: string, file: 'popup' | 'sidepanel') {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/${file}.html`);
  await expect(page.getByRole('heading', { name: 'ArtiShare' })).toBeVisible();

  return page;
}

/** As after "Open in side panel": the icon opens the side panel. `openPopup` succeeds without a popup. */
const iconOpensSidePanel = (page: Page) =>
  page.evaluate(async () => {
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
    await chrome.action.setPopup({ popup: '' });
    await chrome.storage.local.set({ surface: 'sidepanel' });
    chrome.action.openPopup = () => Promise.resolve();
  });

/** What the toolbar icon will do, read from a fresh page. */
async function toolbar(context: BrowserContext, extensionId: string) {
  const page = await open(context, extensionId, 'popup');
  const state = await page.evaluate(async () => ({
    popup: await chrome.action.getPopup({}),
    openPanel: (await chrome.sidePanel.getPanelBehavior()).openPanelOnActionClick,
    stored: (await chrome.storage.local.get('surface')).surface as string | undefined,
  }));
  await page.close();

  return state;
}

async function saveList(page: Page, name: string, emails: string) {
  await page.getByRole('tab', { name: /Lists/ }).click();
  await lists(page).getByRole('button', { name: 'New list' }).click();
  await lists(page).getByLabel('List name').filter({ visible: true }).fill(name);
  await lists(page).getByLabel('Email addresses').filter({ visible: true }).fill(emails);
  await lists(page).getByRole('button', { name: 'Save list' }).click();
  await expect(lists(page).locator('summary', { hasText: name })).toBeVisible();
}

test('Use popup instead in one window closes the side panel in the other window too', async ({
  context,
  extensionId,
}) => {
  const first = await open(context, extensionId, 'sidepanel');
  const second = await open(context, extensionId, 'sidepanel');
  const third = await open(context, extensionId, 'sidepanel');
  await iconOpensSidePanel(first);

  // Waited for before the click, as a panel can close quickly. Each wait is capped at a second.
  const closes = [first, second, third].map((page) => page.waitForEvent('close', { timeout: 1_000 }));
  await first.getByRole('button', { name: 'Use popup instead' }).click();

  // Every side panel goes within a second of the click, not only the one that was clicked.
  await Promise.all(closes);

  // No window is left with a side panel the toolbar icon no longer opens.
  const state = await toolbar(context, extensionId);
  expect(state).toEqual({
    popup: `chrome-extension://${extensionId}/popup.html`,
    openPanel: false,
    stored: 'popup',
  });
});

test("when openPopup fails the other window's panel still closes and the one that switched stays to say so", async ({
  context,
  extensionId,
}) => {
  const first = await open(context, extensionId, 'sidepanel');
  const second = await open(context, extensionId, 'sidepanel');
  await iconOpensSidePanel(first);
  await first.evaluate(() => {
    chrome.action.openPopup = () => Promise.reject(new Error('Could not find an active browser window.'));
  });

  // The choice is the popup now, so the other window's panel can't be reopened by the icon: it closes,
  // and the one that switched stays to say so. Waited for before the click, as it closes quickly.
  const secondClosed = second.waitForEvent('close', { timeout: 1_000 });
  await first.getByRole('button', { name: 'Use popup instead' }).click();
  await secondClosed;
  await expect(first.locator('output.notice')).toBeVisible();
  expect(first.isClosed()).toBe(false);
});

test('a run of 6 addresses carries on in the popup after Use popup instead, and invites each once', async ({
  context,
  extensionId,
}) => {
  await context.route(/^https:\/\/claude\.ai\//, (route) =>
    route.fulfill({ contentType: 'text/html', body: '<title>page</title>' }),
  );
  const side = await open(context, extensionId, 'sidepanel');
  await saveList(side, 'Six', RUN_LIST.join('\n'));
  await side.getByRole('tab', { name: 'Share' }).click();
  const box = share(side).getByRole('textbox', { name: /Artifacts/ });
  await box.fill(ARTIFACT);
  await box.press('Enter');
  await expect(share(side).locator('.artifact-item')).toHaveText([ARTIFACT]);
  await share(side).locator('label.pick', { hasText: 'Six' }).getByRole('checkbox').check();
  await share(side)
    .getByRole('button', { name: /^Preview/ })
    .click();
  await share(side).getByRole('button', { name: 'Send 6 invitations' }).click();
  await answer(share(side), 'Send');
  await expect(share(side).getByText('Running', { exact: true })).toBeVisible();

  const invited = async (page: Page) => {
    const text =
      (await share(page)
        .locator('.chip.ok')
        .textContent({ timeout: 2_000 })
        .catch(() => null)) ?? '';

    return Number(/(\d+) invited/.exec(text)?.[1] ?? -1);
  };
  await expect.poll(() => invited(side)).toBeGreaterThanOrEqual(1);
  await iconOpensSidePanel(side);
  const atSwitch = await invited(side);
  expect(atSwitch).toBeLessThan(6);

  // Switch while it is sending.
  const closed = side.waitForEvent('close');
  await side.getByRole('button', { name: 'Use popup instead' }).click();
  await closed;

  const popup = await open(context, extensionId, 'popup');
  // Still the same run, live, not restarted: it goes on from where it was and ends done.
  await expect(share(popup).getByText(/Running|Done/)).toBeVisible();
  expect(await invited(popup)).toBeGreaterThanOrEqual(atSwitch);
  await expect(share(popup).getByText(/Share finished: 6 invited/)).toBeVisible({ timeout: 60_000 });
  await expect(share(popup).getByText('Done', { exact: true })).toBeVisible();

  // Each address once: the artifact has the owner and the six, and nobody twice.
  const tab = await context.newPage();
  await tab.goto(ARTIFACT);
  await tab.bringToFront();
  await popup.reload();
  await popup.getByRole('button', { name: 'Manage access' }).click();
  const rows = share(popup).locator('ul.people > li');
  await expect(rows).toHaveCount(7);
  for (const email of RUN_LIST) await expect(rows.filter({ hasText: email })).toHaveCount(1);
});

test('popup and side panel hand over to each other in turn, and the last choice is what the icon opens', async ({
  context,
  extensionId,
}) => {
  // The `openPopup` stand-in belongs to the page it was set in, so each side panel gets it below.
  const switchFrom = async (from: Page, label: 'Open in side panel' | 'Use popup instead') => {
    const closed = from.waitForEvent('close');
    await from.getByRole('button', { name: label }).click();
    await closed;
  };

  // popup -> side panel
  const popup = await open(context, extensionId, 'popup');
  await popup.evaluate(async () => {
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false });
    await chrome.action.setPopup({ popup: 'popup.html' });
    await chrome.storage.local.set({ surface: 'popup' });
  });
  await switchFrom(popup, 'Open in side panel');
  expect(await toolbar(context, extensionId)).toMatchObject({
    popup: '',
    openPanel: true,
    stored: 'sidepanel',
  });

  // side panel -> popup
  const side = await open(context, extensionId, 'sidepanel');
  await side.evaluate(() => {
    chrome.action.openPopup = () => Promise.resolve();
  });
  await switchFrom(side, 'Use popup instead');
  expect(await toolbar(context, extensionId)).toMatchObject({
    popup: `chrome-extension://${extensionId}/popup.html`,
    openPanel: false,
    stored: 'popup',
  });

  // popup -> side panel again
  const popupAgain = await open(context, extensionId, 'popup');
  await switchFrom(popupAgain, 'Open in side panel');
  expect(await toolbar(context, extensionId)).toMatchObject({
    popup: '',
    openPanel: true,
    stored: 'sidepanel',
  });

  // Round trip once more through a side panel opened afterwards: the other surface closes each time.
  const sideAgain = await open(context, extensionId, 'sidepanel');
  await sideAgain.evaluate(() => {
    chrome.action.openPopup = () => Promise.resolve();
  });
  await switchFrom(sideAgain, 'Use popup instead');
  expect((await toolbar(context, extensionId)).stored).toBe('popup');
});
