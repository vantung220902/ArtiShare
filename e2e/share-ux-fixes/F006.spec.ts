import { expect, test } from '../fixtures';

// F006: a list saved without a name is named after its first addresses.
test('a list saved without a name is named after its addresses', async ({ panel }) => {
  await panel.getByRole('tab', { name: /Lists/ }).click();
  const lists = panel.getByRole('tabpanel', { name: /Lists/ });

  const save = async (emails: string) => {
    await lists.getByRole('button', { name: 'New list' }).click();
    // Saved lists render the same labels inside <details>; the new-list form is the only div.card.
    const form = lists.locator('div.card');
    await form.getByLabel('Email addresses').fill(emails);
    await form.getByRole('button', { name: 'Save list' }).click();
  };
  // Exact name: 'ana@example.com' must not also match 'ana@example.com & bo@example.com'.
  const row = (name: string) => lists.locator('.pick-name').getByText(name, { exact: true });

  await save('ana@example.com');
  await expect(row('ana@example.com')).toHaveCount(1);
  // The count sits next to the name, in the same summary.
  await expect(row('ana@example.com').locator('xpath=following-sibling::*[@class="meta"]')).toContainText(
    '1 person',
  );

  await save('ana@example.com, bo@example.com');
  await expect(row('ana@example.com & bo@example.com')).toHaveCount(1);

  // Duplicates are dropped first, so the count and the first two addresses ignore them.
  await save('cy@example.com\ndi@example.com\ncy@example.com\ned@example.com\nfi@example.com');
  await expect(row('cy@example.com & di@example.com +2 emails')).toHaveCount(1);

  await save('gus@example.com hal@example.com ivy@example.com');
  await expect(row('gus@example.com & hal@example.com +1 email')).toHaveCount(1);
  await expect(panel.getByRole('tab', { name: /Lists/ })).toContainText('4');

  // The same addresses again make the same name: F008 numbers it instead of failing.
  await save('ana@example.com');
  await expect(row('ana@example.com (2)')).toHaveCount(1);
  await expect(panel.getByRole('tab', { name: /Lists/ })).toContainText('5');
});
