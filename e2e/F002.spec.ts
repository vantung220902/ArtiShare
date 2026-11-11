import { expect, test } from './fixtures';

// F002: a cowork link and the claude.ai/artifact link for the same artifact count as one artifact,
// and cowork links without a valid artifact uuid are rejected.
const SESSION = 'https://claude.ai/cowork/cse_01DaqAfCToHd3TK71TZvnXNn';
const COWORK = `${SESSION}?artifact=e86b11e3-af91-40ad-8816-8deb3031e303#6767e92a-ac5`;
const ARTIFACT = 'claude.ai/artifact/VhbnVTrGFVnm271Ufg8VcW';

test('a cowork link and its artifact link are one artifact; bad cowork links are rejected', async ({
  panel,
}) => {
  await panel.getByRole('tab', { name: /Lists/ }).click();
  const lists = panel.getByRole('tabpanel', { name: /Lists/ });
  await lists.getByRole('button', { name: 'New list' }).click();
  await lists.getByLabel('List name').fill('Dedupe team');
  await lists.getByLabel('Email addresses').fill('ana@example.com');
  await lists.getByRole('button', { name: 'Save list' }).click();
  await expect(panel.getByRole('tab', { name: /Lists/ })).toContainText('1');

  await panel.getByRole('tab', { name: 'Share' }).click();
  const share = panel.getByRole('tabpanel', { name: 'Share' });
  const artifacts = share.getByLabel(/Artifacts/);
  const count = share.locator('label[for="artifacts"] .count');
  const hint = share.locator('.hint.err');

  // Both links name the same artifact: one count, one card.
  await artifacts.fill(`${COWORK}\nhttps://${ARTIFACT}`);
  await expect(count).toHaveText('1');
  await expect(hint).toHaveCount(0);

  await share.locator('label.pick', { hasText: 'Dedupe team' }).getByRole('checkbox').check();
  await share.getByRole('button', { name: /^Preview 1 person × 1 artifact$/ }).click();
  const cards = share.locator('section.card').filter({ has: panel.locator('a.artifact-link') });
  await expect(cards).toHaveCount(1);
  await expect(cards.locator('a.artifact-link')).toHaveText(ARTIFACT);
  await panel.getByRole('button', { name: /back/i }).first().click();

  // A cowork session with no artifact open is not an artifact link.
  await artifacts.fill(SESSION);
  await expect(hint).toHaveText(`Not artifact links: ${SESSION}`);
  await expect(count).toHaveCount(0);

  // Neither is one whose ?artifact= is not a uuid.
  const notUuid = `${SESSION}?artifact=not-a-uuid`;
  await artifacts.fill(notUuid);
  await expect(hint).toHaveText(`Not artifact links: ${notUuid}`);
  await expect(count).toHaveCount(0);
});
