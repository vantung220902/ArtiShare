import { expect, test } from '../fixtures';

// F013: in Manage access, changing a person's permission saves it on claude.ai.

const SHARED = 'https://claude.ai/artifact/SharedExampleArtifact01';

test.beforeEach(async ({ context }) => {
  // Serve the pages ourselves: nothing may reach claude.ai or anywhere else.
  await context.route(/^https:\/\/(claude\.ai|example\.com)\//, (route) =>
    route.fulfill({ contentType: 'text/html', body: '<title>page</title>' }),
  );
});

test("changing a person's permission shows Saved on their row only, and sticks after reopening", async ({
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

  const viewer = rows.nth(1);
  const select = viewer.getByRole('combobox', { name: /viewer@example.com/ });
  await expect(select).toHaveValue('view');
  await select.selectOption('edit');

  // In flight: the select is disabled and shows the new value, and no Saved yet.
  await expect(select).toBeDisabled();
  await expect(select).toHaveValue('edit');
  await expect(viewer.getByText('Saved')).toHaveCount(0);

  await expect(viewer.getByText('Saved')).toBeVisible();
  await expect(select).toBeEnabled();
  await expect(select).toHaveValue('edit');

  // No other row changed or says Saved.
  await expect(rows.nth(2).getByRole('combobox')).toHaveValue('comment');
  await expect(rows.nth(3).getByRole('combobox')).toHaveValue('view');
  await expect(share.getByText('Saved')).toHaveCount(1);
  await expect(share.locator('.alert')).toHaveCount(0);

  // 'Saved' is short-lived.
  await expect(viewer.getByText('Saved')).toBeHidden({ timeout: 6_000 });

  // Close and reopen the popup, then open Manage access again.
  await panel.reload();
  await panel.getByRole('button', { name: 'Manage access' }).click();
  await expect(rows).toHaveCount(4);
  await expect(rows.nth(1).getByRole('combobox')).toHaveValue('edit');

  // The Share preview sees the same person at Can edit under Already have access.
  await share.getByRole('button', { name: 'Back' }).click();
  await share.getByLabel('Email addresses').fill('viewer@example.com\nsomeone.new@example.com');
  await share.getByRole('button', { name: /^Preview/ }).click();
  const card = share.locator('section.card');
  await card.locator('summary', { hasText: 'Existing email access' }).click();
  await expect(card.locator('details', { hasText: 'Existing email access' }).locator('li')).toHaveText([
    'viewer@example.com · Can edit',
  ]);
});
