import type { BrowserContext, Page } from '@playwright/test';
import { expect, test } from './fixtures';

// F013: the side panel stays open as you switch tabs, so it follows them: the artifact in the tab in
// front is added to Artifacts (unless it was removed) and the 'This tab' badge moves with it. A tab
// is brought to the front with `bringToFront`, which fires the same events as clicking its title.

const ONE = 'https://claude.ai/artifact/ExampleArtifactOne01';
const TWO = 'https://claude.ai/artifact/ExampleArtifactTwo02';
const UUID_A = 'c0ffee00-1234-4abc-8def-0000000000a1';
const UUID_B = 'c0ffee00-1234-4abc-8def-0000000000b2';
const SESSION = 'https://claude.ai/cowork/cse_01ExampleCoworkSession00';
const OTHER = 'https://example.com/some/page';

// "Within a second" is part of the feature, so waits for a follow are held to that.
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

/** Opens the side panel (or popup) as its own page, which is then the active tab: no artifact. */
async function openPanel(context: BrowserContext, extensionId: string, file: 'sidepanel' | 'popup') {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/${file}.html`);
  await page.setViewportSize({ width: 400, height: 900 });
  await expect(page.getByRole('heading', { name: 'ArtiShare' })).toBeVisible();

  return page;
}

/** The panel has heard about the active tab and painted, so "nothing changed" can be asserted. */
async function settled(page: Page) {
  await page.evaluate(() => chrome.tabs.query({ active: true, lastFocusedWindow: true }));
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 300)));
}

test('the rows and the This tab badge follow the tab in front', async ({ context, extensionId }) => {
  const other = await tabAt(context, OTHER);
  const one = await tabAt(context, ONE);
  const two = await tabAt(context, TWO);
  const sidePanel = await openPanel(context, extensionId, 'sidepanel');

  const share = sidePanel.getByRole('tabpanel', { name: 'Share' });
  const rows = share.locator('.artifact-item');
  const badges = share.locator('.this-tab');
  const badged = rows.filter({ has: sidePanel.locator('.this-tab') });
  const count = share.locator('label[for="artifacts"] .count');

  // 1. Over a tab that isn't an artifact: no rows.
  await other.bringToFront();
  await settled(sidePanel);
  await expect(rows).toHaveCount(0);
  await expect(share.getByText('No artifacts yet.')).toBeVisible();

  // 2. To One: a row with the badge.
  await one.bringToFront();
  await expect(rows).toHaveText([`${ONE}This tab`], WITHIN_A_SECOND);

  // 3. To Two: a second row, and the badge moves to it.
  await two.bringToFront();
  await expect(rows).toHaveText([ONE, `${TWO}This tab`], WITHIN_A_SECOND);
  await expect(badged).toHaveText([`${TWO}This tab`]);
  await expect(count).toHaveText('2');

  // 4. Back to One: no new row, the badge goes back.
  await one.bringToFront();
  await expect(rows).toHaveText([`${ONE}This tab`, TWO], WITHIN_A_SECOND);
  await expect(badged).toHaveText([`${ONE}This tab`]);
  await expect(count).toHaveText('2');

  // 5. Remove Two with ×; away and back to Two: it is not added again.
  await share.getByRole('button', { name: `Remove ${TWO}` }).click();
  await expect(rows).toHaveText([`${ONE}This tab`]);
  await other.bringToFront();
  await expect(badges).toHaveCount(0, WITHIN_A_SECOND);
  await two.bringToFront();
  await settled(sidePanel);
  await expect(rows).toHaveText([ONE]);
  // + Current tab adds it on purpose.
  await share.getByRole('button', { name: 'Current tab' }).click();
  await expect(rows).toHaveText([ONE, `${TWO}This tab`]);

  // 6. A tab that isn't an artifact: no badge, the rows unchanged.
  await other.bringToFront();
  await expect(badges).toHaveCount(0, WITHIN_A_SECOND);
  await settled(sidePanel);
  await expect(rows).toHaveText([ONE, TWO]);
});

test('an artifact opened in place in the same tab is picked up', async ({ context, extensionId }) => {
  const tab = await tabAt(context, `${SESSION}?artifact=${UUID_A}`);
  const sidePanel = await openPanel(context, extensionId, 'sidepanel');
  const rows = sidePanel.getByRole('tabpanel', { name: 'Share' }).locator('.artifact-item');
  const badged = rows.filter({ has: sidePanel.locator('.this-tab') });

  await tab.bringToFront();
  await expect(rows).toHaveCount(1, WITHIN_A_SECOND);
  await expect(badged).toHaveCount(1);
  const first = (await rows.first().innerText()).replace('This tab', '').trim();

  // The page changes its own URL without a navigation, as claude.ai does when you open another artifact.
  await tab.evaluate((url) => history.pushState({}, '', url), `${SESSION}?artifact=${UUID_B}`);
  await expect(rows).toHaveCount(2, WITHIN_A_SECOND);
  await expect(badged).toHaveCount(1);
  // The first stays as it was, now without the badge; the new one has it. (An id is shown as the
  // artifact link it maps to, so the rows are compared with each other, not with the ids.)
  await expect(rows.nth(0)).toHaveText(first);
  await expect(rows.nth(1)).not.toHaveText(first);
  await expect(rows.nth(1).locator('.this-tab')).toHaveCount(1);
});

test('+ Current tab adds nothing new, with no error, over a tab already in the list', async ({
  context,
  extensionId,
}) => {
  const one = await tabAt(context, ONE);
  const two = await tabAt(context, TWO);
  const sidePanel = await openPanel(context, extensionId, 'sidepanel');
  const share = sidePanel.getByRole('tabpanel', { name: 'Share' });
  const rows = share.locator('.artifact-item');

  await one.bringToFront();
  await expect(rows).toHaveText([`${ONE}This tab`], WITHIN_A_SECOND);
  await two.bringToFront();
  await expect(rows).toHaveText([ONE, `${TWO}This tab`], WITHIN_A_SECOND);
  await one.bringToFront();
  await expect(rows).toHaveText([`${ONE}This tab`, TWO], WITHIN_A_SECOND);

  // The tab active now is One, not the one the panel was opened over (it was opened over none).
  await share.getByRole('button', { name: 'Current tab' }).click();
  await expect(share.getByText('Already in the list')).toBeVisible();
  await expect(rows).toHaveText([`${ONE}This tab`, TWO]);
  await expect(share.locator('.alert')).toHaveCount(0);
  await expect(share.getByText('The current tab is not a claude.ai artifact.')).toHaveCount(0);
});

test('the popup still reads the tab once and does not follow', async ({ context, extensionId }) => {
  const one = await tabAt(context, ONE);
  const popup = await openPanel(context, extensionId, 'popup');
  const rows = popup.getByRole('tabpanel', { name: 'Share' }).locator('.artifact-item');
  await settled(popup);

  // A real popup closes when you switch tabs, so there is nothing to follow.
  await one.bringToFront();
  await settled(popup);
  await expect(rows).toHaveCount(0);
});
