import { expect, test } from '../fixtures';

// F010: the fake claude.ai has artifacts that start with people already invited. Preview is the
// only place the popup shows them so far; Manage access comes in later features.

const SHARED = 'https://claude.ai/artifact/SharedExampleArtifact01';
const MISSING = 'https://claude.ai/artifact/MissingExampleArtifact1';

test('previewing a Shared artifact lists its three seeded people under Already have access', async ({
  panel,
}) => {
  await panel.getByRole('tab', { name: /Lists/ }).click();
  const lists = panel.getByRole('tabpanel', { name: /Lists/ });
  await lists.getByRole('button', { name: 'New list' }).click();
  await lists.getByLabel('List name').filter({ visible: true }).fill('Seeded');
  await lists
    .getByLabel('Email addresses')
    .filter({ visible: true })
    .fill('viewer@example.com\ncommenter@example.com\nlocked@example.com\nnew@example.com');
  await lists.getByRole('button', { name: 'Save list' }).click();
  await expect(lists.locator('summary', { hasText: 'Seeded' })).toBeVisible();
  await panel.getByRole('tab', { name: 'Share' }).click();

  const share = panel.getByRole('tabpanel', { name: 'Share' });
  await share.getByLabel(/Artifacts/).fill(SHARED);
  await share.locator('label.pick', { hasText: 'Seeded' }).getByRole('checkbox').check();
  await share.getByRole('button', { name: /^Preview/ }).click();

  const card = share.locator('section.card');
  await expect(card).toHaveCount(1);
  await expect(card.locator('.stat', { hasText: 'already invited' }).locator('strong')).toHaveText('3');
  await expect(card.locator('.stat', { hasText: 'to invite' }).locator('strong')).toHaveText('1');
  await expect(share.getByRole('button', { name: 'Send 1 invitation' })).toBeEnabled();

  // The group is folded; open it to read who is in it and at what level.
  await card.locator('summary', { hasText: 'Existing email access' }).click();
  const people = card.locator('details', { hasText: 'Existing email access' }).locator('li');
  await expect(people).toHaveText([
    'viewer@example.com · Can view',
    'commenter@example.com · Commenter (pending)',
    'locked@example.com · Can view',
  ]);
});

test('previewing a Missing artifact says it was not found', async ({ panel }) => {
  const share = panel.getByRole('tabpanel', { name: 'Share' });
  await share.getByLabel(/Artifacts/).fill(MISSING);
  await share.getByLabel('Email addresses').fill('a@example.com');
  await share.getByRole('button', { name: /^Preview/ }).click();

  await expect(share.getByText(/not found/i)).toBeVisible();
});
