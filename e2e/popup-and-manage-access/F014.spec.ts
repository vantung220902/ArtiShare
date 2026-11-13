import { expect, test } from '../fixtures';

// F014: in Manage access, removing a person's invitation asks first, then removes it on claude.ai.

const SHARED = 'https://claude.ai/artifact/SharedExampleArtifact01';

test.beforeEach(async ({ context }) => {
  // Serve the pages ourselves: nothing may reach claude.ai or anywhere else.
  await context.route(/^https:\/\/(claude\.ai|example\.com)\//, (route) =>
    route.fulfill({ contentType: 'text/html', body: '<title>page</title>' }),
  );
});

test('Remove asks first; Cancel keeps the person, confirming removes them for good', async ({
  context,
  panel,
}) => {
  const tab = await context.newPage();
  await tab.goto(SHARED);
  await tab.bringToFront();
  await panel.reload();

  const share = panel.getByRole('tabpanel', { name: 'Share' });
  await panel.getByRole('button', { name: 'Manage access' }).click();
  const rows = share.locator('ul.people > li');
  await expect(rows).toHaveCount(4);
  await expect(rows.nth(2)).toContainText('commenter@example.com');

  // Cancel: the dialog closes and nothing changes.
  await rows.nth(2).getByRole('button', { name: 'Remove commenter@example.com' }).click();
  const dialog = panel.getByRole('alertdialog');
  await expect(dialog).toContainText('Remove commenter@example.com from this artifact?');
  await expect(dialog).toContainText('Their invitation will stop working.');
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(rows).toHaveCount(4);
  await expect(rows.nth(2)).toContainText('commenter@example.com');

  // Confirm: the row's controls are disabled while it is in flight, then the row goes.
  const row = rows.nth(2);
  await row.getByRole('button', { name: 'Remove commenter@example.com' }).click();
  await dialog.getByRole('button', { name: 'Remove', exact: true }).click();
  await expect(row.getByRole('button', { name: /Remove commenter/ })).toBeDisabled();
  await expect(row.getByRole('combobox')).toBeDisabled();
  await expect(rows).toHaveCount(3);
  await expect(share.getByText('commenter@example.com')).toHaveCount(0);
  await expect(share.locator('.alert')).toHaveCount(0);
  await expect(share.getByText('viewer@example.com')).toBeVisible();

  // Close and reopen the popup: they are still gone.
  await panel.reload();
  await panel.getByRole('button', { name: 'Manage access' }).click();
  await expect(rows).toHaveCount(3);
  await expect(share.getByText('commenter@example.com')).toHaveCount(0);

  // The Share preview now lists them as someone to invite.
  await share.getByRole('button', { name: 'Back' }).click();
  await share.getByLabel('Email addresses').fill('commenter@example.com');
  await share.getByRole('button', { name: /^Preview/ }).click();
  const card = share.locator('section.card');
  await expect(card.locator('.stat.accent')).toHaveText('1to invite');
  await card.locator('summary', { hasText: 'Will be invited' }).click();
  await expect(card.locator('details', { hasText: 'Will be invited' }).locator('li')).toHaveText([
    'commenter@example.com · Can view',
  ]);
  await expect(card.locator('details', { hasText: 'Existing email access' })).toHaveCount(0);
});
