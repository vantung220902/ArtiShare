import type { BrowserContext, Page } from '@playwright/test';
import { expect, test } from './fixtures';

// F015: when claude.ai refuses a change or removal, or the list can't be loaded, Manage access says
// why on the row (or in the card) and leaves things as they were.

const SHARED = 'https://claude.ai/artifact/SharedExampleArtifact01';
// Contains both words: the people are seeded and every change is refused.
const FORBIDDEN = 'https://claude.ai/artifact/ForbiddenSharedArtifact1';
const MISSING = 'https://claude.ai/artifact/MissingExampleArtifact1';
const LOCKED_ERROR = 'This person joined your organization, so their access is managed in claude.ai.';

test.beforeEach(async ({ context }) => {
  // Serve the pages ourselves: nothing may reach claude.ai or anywhere else.
  await context.route(/^https:\/\/(claude\.ai|example\.com)\//, (route) =>
    route.fulfill({ contentType: 'text/html', body: '<title>page</title>' }),
  );
});

async function openManage(context: BrowserContext, panel: Page, url: string) {
  const tab = await context.newPage();
  await tab.goto(url);
  await tab.bringToFront();
  await panel.reload();
  const share = panel.getByRole('tabpanel', { name: 'Share' });
  await share.getByRole('button', { name: 'Manage access' }).click();

  return { share, rows: share.locator('ul.people > li') };
}

test('a refused change goes back to the old value with the error on that row; other rows still work', async ({
  context,
  panel,
}) => {
  const { rows } = await openManage(context, panel, SHARED);
  await expect(rows).toHaveCount(4);
  const locked = rows.nth(3);
  await expect(locked).toContainText('locked@example.com');

  const select = locked.getByRole('combobox');
  await expect(select).toHaveValue('view');
  await select.selectOption('edit');
  await expect(locked.getByRole('alert')).toHaveText(LOCKED_ERROR);
  await expect(select).toHaveValue('view');
  await expect(select).toBeEnabled();
  await expect(locked.locator('.saved')).toHaveCount(0);
  await expect(panel.getByRole('alert')).toHaveCount(1);

  // Another row is not affected by it.
  const viewer = rows.nth(1);
  await viewer.getByRole('combobox').selectOption('comment');
  await expect(viewer.locator('.saved')).toHaveText('Saved');
  await expect(viewer.getByRole('combobox')).toHaveValue('comment');
  await expect(viewer.getByRole('alert')).toHaveCount(0);
  await expect(locked.getByRole('alert')).toHaveText(LOCKED_ERROR);
});

test('a refused removal keeps the row and shows the error on it', async ({ context, panel }) => {
  const { share, rows } = await openManage(context, panel, SHARED);
  await expect(rows).toHaveCount(4);
  const locked = rows.nth(3);

  await locked.getByRole('button', { name: 'Remove locked@example.com' }).click();
  await panel.getByRole('alertdialog').getByRole('button', { name: 'Remove', exact: true }).click();

  await expect(locked.getByRole('alert')).toHaveText(LOCKED_ERROR);
  await expect(rows).toHaveCount(4);
  await expect(locked).toContainText('locked@example.com');
  await expect(locked.getByRole('button', { name: 'Remove locked@example.com' })).toBeEnabled();
  await expect(locked.getByRole('combobox')).toBeEnabled();
  await expect(share.getByRole('alert')).toHaveCount(1);

  // It is still there after reopening: nothing was removed on claude.ai.
  await panel.reload();
  await share.getByRole('button', { name: 'Manage access' }).click();
  await expect(rows).toHaveCount(4);
});

test('on a Forbidden artifact the people are listed and any change says only the owner can', async ({
  context,
  panel,
}) => {
  const { share, rows } = await openManage(context, panel, FORBIDDEN);
  await expect(rows).toHaveCount(4);
  await expect(share.getByText('viewer@example.com')).toBeVisible();

  const viewer = rows.nth(1);
  await viewer.getByRole('combobox').selectOption('edit');
  await expect(viewer.getByRole('alert')).toHaveText('Only the owner can change access');
  await expect(viewer.getByRole('combobox')).toHaveValue('view');

  const commenter = rows.nth(2);
  await commenter.getByRole('button', { name: 'Remove commenter@example.com' }).click();
  await panel.getByRole('alertdialog').getByRole('button', { name: 'Remove', exact: true }).click();
  await expect(commenter.getByRole('alert')).toHaveText('Only the owner can change access');
  await expect(rows).toHaveCount(4);
});

test('a Missing artifact shows the error and Retry instead of an empty list; Retry asks again', async ({
  context,
  panel,
}) => {
  const tab = await context.newPage();
  await tab.goto(MISSING);
  await tab.bringToFront();
  await panel.reload();
  const share = panel.getByRole('tabpanel', { name: 'Share' });
  await share.getByRole('button', { name: 'Manage access' }).click();

  const alert = share.locator('p.alert');
  await expect(alert).toContainText('Artifact not found');
  const retry = alert.getByRole('button', { name: 'Retry' });
  await expect(retry).toBeVisible();
  await expect(share.locator('ul.people')).toHaveCount(0);
  await expect(share.getByText('You (owner)')).toHaveCount(0);

  // The fake answers after a moment, so watch for the loading line coming back.
  await share.evaluate(() => {
    const w = window as unknown as { sawLoading: boolean };
    w.sawLoading = false;
    new MutationObserver(() => {
      if (document.body.textContent?.includes('Loading people')) w.sawLoading = true;
    }).observe(document.body, { subtree: true, childList: true, characterData: true });
  });
  await retry.click();
  await panel.waitForFunction(() => (window as unknown as { sawLoading: boolean }).sawLoading);
  await expect(alert).toContainText('Artifact not found');
  await expect(share.locator('ul.people')).toHaveCount(0);

  // Back still works from the error.
  await share.getByRole('button', { name: 'Back' }).click();
  await expect(share.getByLabel('Email addresses')).toBeVisible();
});
