import { expect, test } from '../fixtures';

// F012: on an artifact tab, a quiet 'Manage access' link opens the people already invited to it.

const SHARED = 'https://claude.ai/artifact/SharedExampleArtifact01';

test.beforeEach(async ({ context }) => {
  // Serve the pages ourselves: nothing may reach claude.ai or anywhere else.
  await context.route(/^https:\/\/(claude\.ai|example\.com)\//, (route) =>
    route.fulfill({ contentType: 'text/html', body: '<title>page</title>' }),
  );
});

test('Manage access lists the owner and each invitee, and Back returns to the form as it was', async ({
  context,
  panel,
}) => {
  const tab = await context.newPage();
  await tab.goto(SHARED);
  await tab.bringToFront();
  await panel.reload();

  const share = panel.getByRole('tabpanel', { name: 'Share' });
  const link = share.getByRole('button', { name: 'Manage access' });
  // A secondary link at the bottom: not a tab and not a primary button.
  await expect(link).toBeVisible();
  await expect(link).toHaveClass(/link/);
  await expect(link).not.toHaveClass(/primary/);
  await expect(panel.getByRole('tab', { name: /Manage access/ })).toHaveCount(0);
  const previewButton = share.getByRole('button', { name: /^Preview/ });
  const below = async () => (await link.boundingBox())!.y > (await previewButton.boundingBox())!.y;
  expect(await below()).toBe(true);

  // Something typed before opening it.
  const artifacts = share.getByLabel(/Artifacts/);
  await expect(artifacts).toHaveValue(SHARED);
  await artifacts.fill(`${SHARED}\nhttps://claude.ai/artifact/SecondTypedArtifact01`);

  await link.click();
  await expect(share.getByRole('heading', { name: 'People with access' })).toBeVisible();
  await expect(share.getByRole('link', { name: /SharedExampleArtifact01/ })).toBeVisible();
  await expect(share.getByRole('button', { name: 'Back' })).toBeVisible();
  await expect(share.getByRole('button', { name: /^Preview/ })).toBeHidden();

  const rows = share.locator('ul.people > li');
  await expect(rows).toHaveCount(4);
  await expect(rows.nth(0)).toContainText('You (owner)');
  // The owner is not editable.
  await expect(rows.nth(0).locator('select, button')).toHaveCount(0);
  await expect(rows.nth(1)).toContainText('viewer@example.com');
  await expect(rows.nth(1)).toContainText('Accepted');
  await expect(rows.nth(1)).toContainText('Can view');
  await expect(rows.nth(2)).toContainText('commenter@example.com');
  await expect(rows.nth(2)).toContainText('Pending');
  await expect(rows.nth(2)).toContainText('Commenter');
  await expect(rows.nth(3)).toContainText('locked@example.com');
  await expect(rows.nth(3)).toContainText('Accepted');

  await share.getByRole('button', { name: 'Back' }).click();
  await expect(share.getByRole('heading', { name: 'People with access' })).toHaveCount(0);
  await expect(artifacts).toHaveValue(`${SHARED}\nhttps://claude.ai/artifact/SecondTypedArtifact01`);
  await expect(link).toBeVisible();
});

test('Manage access is also under the run view', async ({ context, panel }) => {
  const tab = await context.newPage();
  await tab.goto('https://claude.ai/artifact/RunThenManageArtifact1');
  await tab.bringToFront();
  await panel.reload();

  const share = panel.getByRole('tabpanel', { name: 'Share' });
  await share.getByLabel('Email addresses').fill('a@example.com');
  await share.getByRole('button', { name: /^Preview/ }).click();
  await share.getByRole('button', { name: /^Send/ }).click();
  await panel.getByRole('alertdialog').getByRole('button', { name: 'Send', exact: true }).click();
  await expect(share.getByText('Share finished: 1 invited')).toBeVisible();

  await expect(share.getByRole('button', { name: 'Start a new share' })).toBeVisible();
  await share.getByRole('button', { name: 'Manage access' }).click();
  const rows = share.locator('ul.people > li');
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(1)).toContainText('a@example.com');
  await expect(rows.nth(1)).toContainText('Pending');
  await share.getByRole('button', { name: 'Back' }).click();
  await expect(share.getByText('Share finished: 1 invited')).toBeVisible();
});

test('there is no Manage access link when the active tab is not an artifact', async ({ context, panel }) => {
  const other = await context.newPage();
  await other.goto('https://example.com/some/page');
  await other.bringToFront();
  await panel.reload();

  const share = panel.getByRole('tabpanel', { name: 'Share' });
  await expect(share.getByRole('button', { name: /^Preview/ })).toBeVisible();
  // Give the active-tab lookup time to answer before asserting nothing appeared.
  await panel.evaluate(() => chrome.tabs.query({ active: true, lastFocusedWindow: true }));
  await expect(share.getByRole('button', { name: 'Manage access' })).toHaveCount(0);
});
