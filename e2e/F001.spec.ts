import { expect, test } from './fixtures';

// F001: a claude.ai/cowork link with an artifact open is accepted in the Share tab and previews
// as the matching claude.ai/artifact link.
const COWORK =
  'https://claude.ai/cowork/cse_01ExampleCoworkSession00?artifact=c0ffee00-1234-4abc-8def-000000000001#example';
// The base58 form of c0ffee00-…-000000000001, the same id a claude.ai/chat/…?artifact= link gives.
const ARTIFACT = 'claude.ai/artifact/QqHHsBLXBfYKJD5NqJ8PeY';

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
