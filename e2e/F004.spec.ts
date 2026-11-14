import type { BrowserContext, Page } from '@playwright/test';
import { answer, expect, test } from './fixtures';

// F004: an artifact removed with × isn't added back by the tab's prefill, until it is added on
// purpose (+ Current tab, a paste, Undo) or a new share starts.

const ONE = 'https://claude.ai/artifact/ExampleArtifactOne01';
const TWO = 'https://claude.ai/artifact/ExampleArtifactTwo02';
const THREE = 'https://claude.ai/artifact/ExampleArtifactThree3';

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

/** The mount's tab query has been answered and painted, so "nothing was added" can be asserted. */
async function settled(panel: Page) {
  await panel.evaluate(() => chrome.tabs.query({ active: true, lastFocusedWindow: true }));
  await panel.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => resolve(null))));
}

test('a removed artifact stays out until it is added on purpose', async ({ context, panel }) => {
  const share = panel.getByRole('tabpanel', { name: 'Share' });
  const rows = share.locator('.artifact-item');
  const badges = share.locator('.this-tab');
  const remove = (url: string) => share.getByRole('button', { name: `Remove ${url}`, exact: true });

  // 1. Added over One, removed, reopened over One: not added back, and nothing carries the badge.
  await reopenOver(context, panel, ONE);
  await expect(rows).toHaveText([`${ONE}This tab`]);
  await remove(ONE).click();
  await expect(rows).toHaveCount(0);
  await reopenOver(context, panel, ONE);
  await settled(panel);
  await expect(rows).toHaveCount(0);
  await expect(badges).toHaveCount(0);
  await expect(share.getByText('No artifacts yet.')).toBeVisible();

  // 2. + Current tab brings it back on purpose, with the badge, and then it is an ordinary row.
  await share.getByRole('button', { name: 'Current tab' }).click();
  await expect(rows).toHaveText([`${ONE}This tab`]);
  await reopenOver(context, panel, ONE);
  await expect(rows).toHaveText([`${ONE}This tab`]);
  await settled(panel);
  await expect(rows).toHaveCount(1);

  // 3. Removing One again holds back only One: Two is added.
  await remove(ONE).click();
  await expect(rows).toHaveCount(0);
  await reopenOver(context, panel, TWO);
  await expect(rows).toHaveText([`${TWO}This tab`]);
  await settled(panel);
  await expect(rows).toHaveCount(1);

  // 4. Remove One and Undo: it is never held back. Over One, nothing is added twice and it is marked.
  await share.getByLabel(/Artifacts/).fill(ONE);
  await share.getByLabel(/Artifacts/).press('Enter');
  await expect(rows).toHaveText([`${TWO}This tab`, ONE]);
  await remove(ONE).click();
  await expect(rows).toHaveText([`${TWO}This tab`]);
  await share.getByRole('button', { name: 'Undo' }).click();
  await expect(rows).toHaveText([`${TWO}This tab`, ONE]);
  await remove(TWO).click();
  await reopenOver(context, panel, ONE);
  await expect(rows).toHaveText([`${ONE}This tab`]);
  await settled(panel);
  await expect(rows).toHaveCount(1);

  // 5. A pasted link counts as adding it on purpose, however it is linked.
  await remove(ONE).click();
  await reopenOver(context, panel, ONE);
  await settled(panel);
  await expect(rows).toHaveCount(0);
  await share.getByLabel(/Artifacts/).fill(ONE);
  await share.getByLabel(/Artifacts/).press('Enter');
  await expect(rows).toHaveText([`${ONE}This tab`]);
  await remove(ONE).click();
  await share.getByLabel(/Artifacts/).fill(THREE);
  await share.getByLabel(/Artifacts/).press('Enter');
  await expect(rows).toHaveText([THREE]);
  await reopenOver(context, panel, ONE);
  await settled(panel);
  // Three came back with the draft; One is still held back.
  await expect(rows).toHaveText([THREE]);
});

test('a removed artifact is held back for the draft only', async ({ context, panel }) => {
  const share = panel.getByRole('tabpanel', { name: 'Share' });
  const rows = share.locator('.artifact-item');

  // A list to send to.
  await panel.getByRole('tab', { name: /Lists/ }).click();
  const lists = panel.getByRole('tabpanel', { name: /Lists/ });
  await lists.getByRole('button', { name: 'New list' }).click();
  await lists.getByLabel('List name').filter({ visible: true }).fill('Alpha team');
  await lists.getByLabel('Email addresses').filter({ visible: true }).fill('ana@example.com');
  await lists.getByRole('button', { name: 'Save list' }).click();
  await expect(lists.locator('summary', { hasText: 'Alpha team' })).toBeVisible();
  await panel.getByRole('tab', { name: 'Share' }).click();

  // 1. One removed, with Two kept: a run of Two, then a new share over One adds One again.
  await reopenOver(context, panel, ONE);
  await expect(rows).toHaveText([`${ONE}This tab`]);
  await share.getByLabel(/Artifacts/).fill(TWO);
  await share.getByLabel(/Artifacts/).press('Enter');
  await share.getByRole('button', { name: `Remove ${ONE}`, exact: true }).click();
  await expect(rows).toHaveText([TWO]);
  await share.locator('label.pick', { hasText: 'Alpha team' }).getByRole('checkbox').check();
  await share.getByRole('button', { name: /^Preview/ }).click();
  await share.getByRole('button', { name: /^Send \d+ invitations?$/ }).click();
  await answer(panel, 'Send');
  await expect(share.getByText('Done', { exact: true })).toBeVisible({ timeout: 20_000 });

  const other = await context.newPage();
  await other.goto(ONE);
  await other.bringToFront();
  await share.getByRole('button', { name: 'Start a new share' }).click();
  await expect(rows).toHaveText([`${ONE}This tab`]);

  // 2. Removed again, then the browser quits: the draft (session storage) is gone, so One is added again.
  await share.getByRole('button', { name: `Remove ${ONE}`, exact: true }).click();
  await expect(rows).toHaveCount(0);
  await expect
    .poll(() =>
      panel.evaluate(
        async () =>
          ((await chrome.storage.session.get('shareDraft')).shareDraft as { removed?: string[] } | undefined)
            ?.removed ?? [],
      ),
    )
    .toHaveLength(1);
  await panel.evaluate(() => chrome.storage.session.remove('shareDraft'));
  await panel.reload();
  await expect(rows).toHaveText([`${ONE}This tab`]);
});
