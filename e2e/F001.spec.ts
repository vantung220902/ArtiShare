import { expect, test } from './fixtures';

// F001: a claude.ai/cowork link with an artifact open is accepted in the Share tab and previews
// as the matching claude.ai/artifact link.
const COWORK =
  'https://claude.ai/cowork/cse_01DaqAfCToHd3TK71TZvnXNn?artifact=e86b11e3-af91-40ad-8816-8deb3031e303#6767e92a-ac5';
// The base58 form of e86b11e3-…-8deb3031e303, the same id a claude.ai/chat/…?artifact= link gives.
const ARTIFACT = 'claude.ai/artifact/VhbnVTrGFVnm271Ufg8VcW';

test('a cowork link with an open artifact previews as that artifact', async ({ panel }) => {
  await panel.getByRole('tab', { name: /Lists/ }).click();
  const lists = panel.getByRole('tabpanel', { name: /Lists/ });
  await lists.getByRole('button', { name: 'New list' }).click();
  await lists.getByLabel('List name').fill('Cowork team');
  await lists.getByLabel('Email addresses').fill('ana@example.com');
  await lists.getByRole('button', { name: 'Save list' }).click();
  await expect(panel.getByRole('tab', { name: /Lists/ })).toContainText('1');

  await panel.getByRole('tab', { name: 'Share' }).click();
  const share = panel.getByRole('tabpanel', { name: 'Share' });
  const artifacts = share.getByLabel(/Artifacts/);
  await artifacts.fill(COWORK);

  await expect(share.locator('label[for="artifacts"] .count')).toHaveText('1');
  await expect(share.getByText('Not artifact links')).toHaveCount(0);

  await share.locator('label.pick', { hasText: 'Cowork team' }).getByRole('checkbox').check();
  await share.getByRole('button', { name: /^Preview 1 person × 1 artifact$/ }).click();

  const cards = share.locator('section.card').filter({ has: panel.locator('a.artifact-link') });
  await expect(cards).toHaveCount(1);
  const link = cards.locator('a.artifact-link');
  await expect(link).toHaveText(ARTIFACT);
  await expect(link).toHaveAttribute('href', `https://${ARTIFACT}`);
  await expect(cards.locator('.stat.accent strong')).toHaveText('1');
  await expect(cards.getByText('to invite')).toBeVisible();
});
