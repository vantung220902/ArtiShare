import type { BrowserContext, Page } from '@playwright/test';
import { expect, test } from './fixtures';

// F014: the side panel stays open as you switch tabs, so its Manage access icon follows the tab in
// front, while an open People with access stays on the artifact it was opened for.

const ONE = 'https://claude.ai/artifact/ExampleSharedArtifact01';
const TWO = 'https://claude.ai/artifact/ExampleArtifactTwo02';
const OTHER = 'https://example.com/some/page';

const WITHIN_A_SECOND = { timeout: 1_000 };

test.beforeEach(async ({ context }) => {
  // Serve the pages ourselves: nothing may reach claude.ai or anywhere else.
  await context.route(/^https:\/\/(claude\.ai|example\.com)\//, (route) =>
    route.fulfill({ contentType: 'text/html', body: '<title>page</title>' }),
  );
});

/** A tab at `url`. A new tab is brought to the front, which a panel that is already open would follow. */
async function tabAt(context: BrowserContext, url: string) {
  const tab = await context.newPage();
  await tab.goto(url);

  return tab;
}

/** Opens the side panel as its own page; the panel is then the active tab, so it shows no artifact. */
async function openPanel(context: BrowserContext, extensionId: string) {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  await page.setViewportSize({ width: 400, height: 900 });
  await expect(page.getByRole('heading', { name: 'ArtiShare' })).toBeVisible();

  return page;
}

/** The panel has heard about the active tab and painted, so "nothing changed" can be asserted. */
async function settled(page: Page) {
  await page.evaluate(() => chrome.tabs.query({ active: true, lastFocusedWindow: true }));
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 300)));
}

const withoutScheme = (url: string) => url.replace('https://', '');

test('the icon follows the tab, and an open Manage access stays on its artifact', async ({
  context,
  extensionId,
}) => {
  const other = await tabAt(context, OTHER);
  const one = await tabAt(context, ONE);
  const two = await tabAt(context, TWO);
  const panel = await openPanel(context, extensionId);

  const share = panel.getByRole('tabpanel', { name: 'Share' });
  const icon = panel.getByRole('button', { name: 'Manage access' });
  const back = share.getByRole('button', { name: 'Back' });
  const heading = share.getByRole('heading', { name: 'People with access' });
  const link = share.locator('.card .artifact-link');
  const people = share.locator('ul.people > li');

  // 1. Over a tab that isn't an artifact: no icon.
  await other.bringToFront();
  await settled(panel);
  await expect(icon).toHaveCount(0);

  // 2. To the first artifact: the icon appears and opens Manage access for it.
  await one.bringToFront();
  await expect(icon).toBeVisible(WITHIN_A_SECOND);
  await icon.click();
  await expect(heading).toBeVisible();
  await expect(link).toHaveText(withoutScheme(ONE));
  await expect(people).toHaveCount(4);

  // 3. To the second artifact with Manage access open: the view is still the first artifact's,
  // and nothing was changed.
  await two.bringToFront();
  await settled(panel);
  await expect(heading).toBeVisible();
  await expect(link).toHaveText(withoutScheme(ONE));
  await expect(people).toHaveCount(4);
  await expect(share.locator('.alert')).toHaveCount(0);

  // 4. Back, then the icon: it opens for the second artifact, the tab in front now.
  await back.click();
  await expect(heading).toHaveCount(0);
  await icon.click();
  await expect(heading).toBeVisible();
  await expect(link).toHaveText(withoutScheme(TWO));
  await expect(share.getByText('Only you have access.')).toBeVisible();

  // 5. To a tab that isn't an artifact with Manage access open: the view stays; once Back is
  // clicked the icon is gone.
  await other.bringToFront();
  await settled(panel);
  await expect(heading).toBeVisible();
  await expect(link).toHaveText(withoutScheme(TWO));
  await back.click();
  await expect(heading).toHaveCount(0);
  await expect(icon).toHaveCount(0);
});

test('the icon appears and goes away as the active tab changes, with no Manage access open', async ({
  context,
  extensionId,
}) => {
  const one = await tabAt(context, ONE);
  const other = await tabAt(context, OTHER);
  const panel = await openPanel(context, extensionId);
  const icon = panel.getByRole('button', { name: 'Manage access' });

  await one.bringToFront();
  await expect(icon).toBeVisible(WITHIN_A_SECOND);
  await other.bringToFront();
  await expect(icon).toHaveCount(0, WITHIN_A_SECOND);

  // The tab in front navigating in place to an artifact counts as a switch too.
  await other.goto(TWO);
  await expect(icon).toBeVisible(WITHIN_A_SECOND);
});

test('the popup still reads the tab once', async ({ context, extensionId }) => {
  const one = await tabAt(context, ONE);
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await popup.setViewportSize({ width: 400, height: 900 });
  const icon = popup.getByRole('button', { name: 'Manage access' });

  // The popup page is the active tab in e2e, so nothing is read from the artifact tab: no icon.
  await expect(popup.getByRole('heading', { name: 'ArtiShare' })).toBeVisible();
  await one.bringToFront();
  await settled(popup);
  await expect(icon).toHaveCount(0);
});
