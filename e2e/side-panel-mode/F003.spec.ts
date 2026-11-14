import type { BrowserContext, Page } from '@playwright/test';
import { answer, expect, test } from '../fixtures';

// F003: opening ArtiShare over an artifact adds it to Artifacts when it isn't there yet, marked
// 'This tab': the same for the second and third artifact as for the first.

const ONE = 'https://claude.ai/artifact/ExampleArtifactOne01';
const TWO = 'https://claude.ai/artifact/ExampleArtifactTwo02';
const THREE = 'https://claude.ai/artifact/ExampleArtifactThree3';
const UUID = 'c0ffee00-1234-4abc-8def-000000000001';
// The same artifact as COWORK, reached by a link of another shape.
const CODE_LINK = `https://claude.ai/code/artifact/${UUID}`;
const COWORK = `https://claude.ai/cowork/cse_01ExampleCoworkSession00?artifact=${UUID}`;

test.beforeEach(async ({ context }) => {
  // Serve the pages ourselves: nothing may reach claude.ai or anywhere else.
  await context.route(/^https:\/\/(claude\.ai|example\.com)\//, (route) =>
    route.fulfill({ contentType: 'text/html', body: '<title>page</title>' }),
  );
});

/** Makes `url` the active tab and reopens the popup, as closing and reopening it would. */
async function reopenOver(context: BrowserContext, panel: Page, url: string) {
  const tab = await context.newPage();
  await tab.goto(url);
  // The popup reads the active tab, and clicking a page in Playwright doesn't switch tabs.
  await tab.bringToFront();
  await panel.reload();
}

/** The mount's tab query has been answered and painted, so "nothing changed" can be asserted. */
async function settled(panel: Page) {
  await panel.evaluate(() => chrome.tabs.query({ active: true, lastFocusedWindow: true }));
  await panel.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => resolve(null))));
}

test('each artifact tab is added once and carries the This tab badge', async ({ context, panel }) => {
  const share = panel.getByRole('tabpanel', { name: 'Share' });
  const rows = share.locator('.artifact-item');
  const count = share.locator('label[for="artifacts"] .count');
  const badges = share.locator('.this-tab');
  const badged = rows.filter({ has: panel.locator('.this-tab') });

  // 1. The first artifact, with none in the list.
  await expect(rows).toHaveCount(0);
  await reopenOver(context, panel, ONE);
  await expect(rows).toHaveText([`${ONE}This tab`]);
  await expect(badges).toHaveText(['This tab']);

  // 2. The second: both rows, in the order they came, and the badge only on the new one.
  await reopenOver(context, panel, TWO);
  await expect(rows).toHaveText([ONE, `${TWO}This tab`]);
  await expect(count).toHaveText('2');
  await expect(badged).toHaveText([`${TWO}This tab`]);

  // 3. The third the same.
  await reopenOver(context, panel, THREE);
  await expect(rows).toHaveText([ONE, TWO, `${THREE}This tab`]);
  await expect(count).toHaveText('3');
  await expect(badged).toHaveText([`${THREE}This tab`]);

  // 4. Back over Two: no second Two, and the badge moves to it.
  await reopenOver(context, panel, TWO);
  await expect(badged).toHaveText([`${TWO}This tab`]);
  await settled(panel);
  await expect(rows).toHaveText([ONE, `${TWO}This tab`, THREE]);
  await expect(count).toHaveText('3');

  // 5. The cowork tab of an artifact already listed under another link: no new row, and it gets the badge.
  await share.getByLabel(/Artifacts/).fill(CODE_LINK);
  await share.getByLabel(/Artifacts/).press('Enter');
  await expect(rows).toHaveCount(4);
  await reopenOver(context, panel, COWORK);
  await expect(badged).toHaveText([`${CODE_LINK}This tab`]);
  await settled(panel);
  await expect(rows).toHaveText([ONE, TWO, THREE, `${CODE_LINK}This tab`]);
  await expect(count).toHaveText('4');

  // 6. A page that isn't an artifact: the rows stay as they were and none is marked.
  await reopenOver(context, panel, 'https://example.com/some/page');
  await expect(rows).toHaveCount(4);
  await settled(panel);
  await expect(rows).toHaveText([ONE, TWO, THREE, CODE_LINK]);
  await expect(badges).toHaveCount(0);
});

test('Start a new share after a run holds only the artifact in the active tab', async ({
  context,
  panel,
}) => {
  await panel.getByRole('tab', { name: /Lists/ }).click();
  const lists = panel.getByRole('tabpanel', { name: /Lists/ });
  await lists.getByRole('button', { name: 'New list' }).click();
  await lists.getByLabel('List name').filter({ visible: true }).fill('Alpha team');
  await lists.getByLabel('Email addresses').filter({ visible: true }).fill('ana@example.com');
  await lists.getByRole('button', { name: 'Save list' }).click();
  await expect(lists.locator('summary', { hasText: 'Alpha team' })).toBeVisible();
  await panel.getByRole('tab', { name: 'Share' }).click();

  const share = panel.getByRole('tabpanel', { name: 'Share' });
  const rows = share.locator('.artifact-item');
  await reopenOver(context, panel, ONE);
  await expect(rows).toHaveText([`${ONE}This tab`]);
  await share.getByLabel(/Artifacts/).fill(TWO);
  await share.getByLabel(/Artifacts/).press('Enter');
  await expect(rows).toHaveCount(2);

  // This tab has no say in a run that is already going.
  await share.locator('label.pick', { hasText: 'Alpha team' }).getByRole('checkbox').check();
  await share.getByRole('button', { name: /^Preview/ }).click();
  await share.getByRole('button', { name: /^Send \d+ invitations?$/ }).click();
  await answer(panel, 'Send');
  await expect(share.getByText('Done', { exact: true })).toBeVisible({ timeout: 20_000 });

  // Now look at another artifact and start over: the fresh list is that artifact alone.
  const other = await context.newPage();
  await other.goto(THREE);
  await other.bringToFront();
  await share.getByRole('button', { name: 'Start a new share' }).click();
  await expect(rows).toHaveText([`${THREE}This tab`]);
});
