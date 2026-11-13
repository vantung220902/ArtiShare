import type { BrowserContext, Page } from '@playwright/test';
import { answer, expect, test } from './fixtures';

// F016: Manage access with nobody invited, a list that went stale, and repeated clicks.

const SHARED = 'https://claude.ai/artifact/SharedExampleArtifact01';
const EMPTY = 'https://claude.ai/artifact/EmptyExampleArtifact001';

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

/** Counts the messages the popup sends the background, by type, so "one request" can be asserted. */
async function countMessages(panel: Page) {
  await panel.evaluate(() => {
    const w = window as unknown as { sent: Record<string, number> };
    w.sent = {};
    const original = chrome.runtime.sendMessage.bind(chrome.runtime) as (message: {
      type: string;
    }) => Promise<unknown>;
    (chrome.runtime as unknown as { sendMessage: typeof original }).sendMessage = (message) => {
      w.sent[message.type] = (w.sent[message.type] ?? 0) + 1;

      return original(message);
    };
  });

  return (type: string) =>
    panel.evaluate((t) => (window as unknown as { sent: Record<string, number> }).sent[t] ?? 0, type);
}

test('an artifact nobody was invited to says so and points to Share', async ({ context, panel }) => {
  const { share, rows } = await openManage(context, panel, EMPTY);

  await expect(share.getByText('Only you have access.')).toBeVisible();
  await expect(share.getByText('Use Share to invite people.')).toBeVisible();
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('You (owner)');
  await expect(share.getByRole('button', { name: 'Refresh' })).toBeVisible();
  await expect(share.getByRole('alert')).toHaveCount(0);
});

test('Refresh shows people invited meanwhile, from another popup', async ({ context, panel }) => {
  const { share, rows } = await openManage(context, panel, EMPTY);
  await expect(share.getByText('Only you have access.')).toBeVisible();

  // Send from a second popup: this one still shows the list it read when it opened.
  const other = await context.newPage();
  await other.goto(panel.url());
  const otherShare = other.getByRole('tabpanel', { name: 'Share' });
  await otherShare.getByLabel('List name').fill('Refresh team');
  await otherShare.getByLabel('Email addresses').fill('ana@example.com\nbo@example.com');
  await otherShare.getByLabel(/Artifacts/).fill(EMPTY);
  await otherShare.getByRole('button', { name: /^Preview/ }).click();
  await otherShare.getByRole('button', { name: 'Send 2 invitations' }).click();
  await answer(otherShare, 'Send');
  await expect(otherShare.getByText('Done', { exact: true })).toBeVisible({ timeout: 20_000 });

  await expect(rows).toHaveCount(1);
  await expect(share.getByText('Only you have access.')).toBeVisible();
  await share.getByRole('button', { name: 'Refresh' }).click();
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(1)).toContainText('ana@example.com');
  await expect(rows.nth(2)).toContainText('bo@example.com');
  await expect(share.getByText('Only you have access.')).toHaveCount(0);
  await expect(share.getByRole('alert')).toHaveCount(0);
});

test('while a run sends to this artifact, Manage access says so and Refresh shows the latest', async ({
  context,
  panel,
}) => {
  const tab = await context.newPage();
  await tab.goto(EMPTY);
  await tab.bringToFront();
  await panel.reload();

  const share = panel.getByRole('tabpanel', { name: 'Share' });
  await share.getByLabel('List name').fill('Running team');
  await share.getByLabel('Email addresses').fill('ana@example.com\nbo@example.com\ncy@example.com');
  await share.getByLabel(/Artifacts/).fill(EMPTY);
  await share.getByRole('button', { name: /^Preview/ }).click();
  await share.getByRole('button', { name: 'Send 3 invitations' }).click();
  await answer(share, 'Send');
  await expect(share.getByText('Running', { exact: true })).toBeVisible();

  await share.getByRole('button', { name: 'Manage access' }).click();
  const note = share.getByRole('status').filter({ hasText: 'A share is in progress' });
  await expect(note).toContainText('Refresh shows the latest.');

  // The note goes when the run is no longer sending; the list on screen then needs Refresh.
  await expect(note).toHaveCount(0, { timeout: 20_000 });
  await share.getByRole('button', { name: 'Refresh' }).click();
  const rows = share.locator('ul.people > li');
  await expect(rows).toHaveCount(4);
  await expect(rows.nth(3)).toContainText('cy@example.com');

  // The finished run's view is still there under Back.
  await share.getByRole('button', { name: 'Back' }).click();
  await expect(share.getByText('Done', { exact: true })).toBeVisible();
});

test('a repeated click on Remove or on a select makes one request and no error', async ({
  context,
  panel,
}) => {
  const { share, rows } = await openManage(context, panel, SHARED);
  await expect(rows).toHaveCount(4);
  const sent = await countMessages(panel);

  // Two permission changes in the same instant.
  const viewer = rows.nth(1);
  await viewer.getByRole('combobox').evaluate((select: HTMLSelectElement) => {
    // The native setter, so React sees a real change rather than its own tracked value.
    const descriptor = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!;
    for (const value of ['edit', 'comment']) {
      descriptor.set!.call(select, value);
      select.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });
  await expect(viewer.locator('.saved')).toHaveText('Saved');
  expect(await sent('change-access')).toBe(1);
  await expect(viewer.getByRole('combobox')).toHaveValue('edit');
  await expect(viewer.getByRole('alert')).toHaveCount(0);

  // Remove clicked twice in the same instant opens one question; confirming it twice removes once.
  const commenter = rows.nth(2);
  await commenter.getByRole('button', { name: 'Remove commenter@example.com' }).evaluate((b: HTMLElement) => {
    b.click();
    b.click();
  });
  const dialog = panel.getByRole('alertdialog');
  await expect(dialog).toHaveCount(1);
  await dialog.getByRole('button', { name: 'Remove', exact: true }).evaluate((b: HTMLElement) => {
    b.click();
    b.click();
  });
  await expect(rows).toHaveCount(3);
  await expect(dialog).toHaveCount(0);
  expect(await sent('remove-invite')).toBe(1);
  await expect(share.getByRole('alert')).toHaveCount(0);
  await expect(share.getByText('commenter@example.com')).toHaveCount(0);
});
