import { expect, test } from '../fixtures';

const EMPTY = 'Add at least one email address.';
// The parser ignores words without an @ (CSV headers, names), so an invalid address needs one.
const INVALID = 'Fix or remove the invalid addresses: not@an-email';

// F011: an empty list, or one with an invalid address, can't be saved from the Lists tab or by Preview.
test("a list with nothing in it or with invalid addresses can't be saved or previewed", async ({ panel }) => {
  await panel.getByRole('tab', { name: /Lists/ }).click();
  const lists = panel.getByRole('tabpanel', { name: /Lists/ });
  const listCount = lists.locator('details.list-card');
  await lists.getByRole('button', { name: 'New list' }).click();

  await lists.getByRole('button', { name: 'Save list' }).click();
  await expect(lists.locator('.alert')).toHaveText(EMPTY);
  await expect(listCount).toHaveCount(0);

  await lists.getByLabel('Email addresses').fill('ana@example.com\nnot@an-email');
  await lists.getByRole('button', { name: 'Save list' }).click();
  await expect(lists.locator('.alert')).toHaveText(INVALID);
  await expect(listCount).toHaveCount(0);

  // Share tab: no saved list, so the inline form shows at once.
  await panel.getByRole('tab', { name: 'Share' }).click();
  const share = panel.getByRole('tabpanel', { name: 'Share' });
  await share.getByLabel(/Artifacts/).fill('https://claude.ai/artifact/InvalidListArtifact01');
  const preview = share.getByRole('button', { name: /^Preview/ });

  await preview.click();
  await expect(share.locator('.alert')).toHaveText(EMPTY);
  await expect(share.getByText('Will be invited')).toHaveCount(0);

  await share.getByLabel('Email addresses').fill('ana@example.com\nnot@an-email');
  await preview.click();
  await expect(share.locator('.alert')).toHaveText(INVALID);
  await expect(share.getByText('Will be invited')).toHaveCount(0);

  // Nothing was saved along the way.
  await panel.getByRole('tab', { name: /Lists/ }).click();
  await expect(listCount).toHaveCount(0);
});
