import { expect, test } from '../fixtures';

// F006: on an artifact tab, a Manage access icon in the header opens People with access from the
// Share or the Lists tab, and the link at the bottom of Share is gone.

const SHARED = 'https://claude.ai/artifact/ExampleSharedArtifact01';
const SECOND = 'https://claude.ai/artifact/SecondTypedArtifact01';

test.beforeEach(async ({ context }) => {
  // Serve the pages ourselves: nothing may reach claude.ai or anywhere else.
  await context.route(/^https:\/\/(claude\.ai|example\.com)\//, (route) =>
    route.fulfill({ contentType: 'text/html', body: '<title>page</title>' }),
  );
});

test('the header icon opens People with access from Share and from Lists, and Back restores each tab', async ({
  context,
  panel,
}) => {
  const share = panel.getByRole('tabpanel', { name: 'Share' });
  const lists = panel.getByRole('tabpanel', { name: /Lists/ });

  // 1. Three saved lists, and an artifact tab in front.
  await panel.getByRole('tab', { name: /Lists/ }).click();
  for (const name of ['Alpha', 'Beta', 'Gamma']) {
    await lists.getByRole('button', { name: 'New list' }).click();
    await lists.getByLabel('List name').filter({ visible: true }).fill(name);
    await lists
      .getByLabel('Email addresses')
      .filter({ visible: true })
      .fill(`${name.toLowerCase()}@example.com`);
    await lists.getByRole('button', { name: 'Save list' }).click();
    await expect(lists.locator('summary', { hasText: name })).toBeVisible();
  }
  const tab = await context.newPage();
  await tab.goto(SHARED);
  await tab.bringToFront();
  await panel.reload();
  await panel.getByRole('tab', { name: 'Share' }).click();

  // 2. The icon is in the header, visible without scrolling, with its tooltip; no link at the bottom.
  const icon = panel.getByRole('button', { name: 'Manage access' });
  await expect(icon).toBeVisible();
  await expect(icon).toHaveAttribute('title', 'Manage access to this artifact');
  await expect(icon).toHaveAttribute('aria-pressed', 'false');
  await expect(panel.locator('header').getByRole('button', { name: 'Manage access' })).toHaveCount(1);
  await expect(panel.getByRole('button', { name: /^Preview/ })).toBeVisible();
  const body = panel.locator('.popup-body');
  await body.evaluate((el) => el.scrollTo(0, el.scrollHeight));
  await expect(icon).toBeInViewport();
  await expect(panel.getByText('Manage access', { exact: true })).toHaveCount(0);
  await expect(share.getByRole('button', { name: 'Manage access' })).toHaveCount(0);

  // 3. Click it: the owner and the invitees.
  await icon.click();
  const rows = share.locator('ul.people > li');
  await expect(share.getByRole('heading', { name: 'People with access' })).toBeVisible();
  await expect(rows).toHaveCount(4);
  await expect(rows.nth(0)).toContainText('You (owner)');
  await expect(rows.nth(1)).toContainText('viewer@example.com');
  await expect(rows.nth(1)).toContainText('Can view');
  await expect(rows.nth(2)).toContainText('commenter@example.com');
  await expect(rows.nth(2)).toContainText('Pending');
  await expect(rows.nth(2)).toContainText('Commenter');
  await expect(rows.nth(3)).toContainText('locked@example.com');

  // 4. Pressed while open; clicking it again is the same as Back.
  await expect(icon).toHaveAttribute('aria-pressed', 'true');
  await icon.click();
  await expect(share.getByRole('heading', { name: 'People with access' })).toHaveCount(0);
  await expect(share.getByRole('button', { name: /^Preview/ })).toBeVisible();
  await expect(icon).toHaveAttribute('aria-pressed', 'false');

  // 5. A second artifact, then Manage access and Back: the Share tab as left, with both rows.
  const artifactRows = share.locator('.artifact-item .truncate');
  await share.getByLabel(/Artifacts/).fill(SECOND);
  await share.getByLabel(/Artifacts/).press('Enter');
  await expect(artifactRows).toHaveText([SHARED, SECOND]);
  await icon.click();
  await expect(share.getByRole('heading', { name: 'People with access' })).toBeVisible();
  await share.getByRole('button', { name: 'Back' }).click();
  await expect(artifactRows).toHaveText([SHARED, SECOND]);
  await expect(icon).toHaveAttribute('aria-pressed', 'false');

  // 6. From the Lists tab: an unsaved permission survives a visit to Manage access.
  await panel.getByRole('tab', { name: /Lists/ }).click();
  const row = lists.locator('details', { hasText: 'Alpha' });
  await row.locator('summary').click();
  await row.getByLabel('Permission').selectOption('Can edit');
  await icon.click();
  await expect(lists.getByRole('heading', { name: 'People with access' })).toBeVisible();
  await expect(lists.locator('ul.people > li')).toHaveCount(4);
  await expect(row).toBeHidden();
  await expect(icon).toHaveAttribute('aria-pressed', 'true');
  await lists.getByRole('button', { name: 'Back' }).click();
  await expect(panel.getByRole('tab', { name: /Lists/ })).toHaveAttribute('aria-selected', 'true');
  await expect(row).toHaveAttribute('open', '');
  await expect(row.getByLabel('Permission')).toHaveValue('edit');
  await expect(row.getByRole('button', { name: 'Save', exact: true })).toBeEnabled();
  await expect(lists.getByRole('heading', { name: 'People with access' })).toHaveCount(0);

  // Choosing a tab while it is open shows that tab.
  await icon.click();
  await expect(lists.getByRole('heading', { name: 'People with access' })).toBeVisible();
  await panel.getByRole('tab', { name: 'Share' }).click();
  await expect(panel.getByRole('heading', { name: 'People with access' })).toHaveCount(0);
  await expect(share.getByRole('button', { name: /^Preview/ })).toBeVisible();
  await expect(icon).toHaveAttribute('aria-pressed', 'false');

  // 7. Changing and removing a person still work from this view.
  await icon.click();
  const viewer = rows.nth(1);
  await viewer.getByRole('combobox', { name: /viewer@example.com/ }).selectOption('edit');
  await expect(viewer.getByText('Saved')).toBeVisible();
  await rows
    .nth(2)
    .getByRole('combobox', { name: /commenter@example.com/ })
    .selectOption('view');
  await expect(rows.nth(2).getByText('Saved')).toBeVisible();
  await viewer.getByRole('button', { name: 'Remove viewer@example.com' }).click();
  await panel.getByRole('alertdialog').getByRole('button', { name: 'Remove', exact: true }).click();
  await expect(rows).toHaveCount(3);
  await expect(share.getByText('viewer@example.com')).toHaveCount(0);
});
