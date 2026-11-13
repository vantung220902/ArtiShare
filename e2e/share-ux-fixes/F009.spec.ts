import { expect, test } from '../fixtures';

// F009: clearing the name of an existing list and saving names it after its addresses.
test('clearing the name of a saved list renames it after its addresses', async ({ panel }) => {
  await panel.getByRole('tab', { name: /Lists/ }).click();
  const lists = panel.getByRole('tabpanel', { name: /Lists/ });

  // A non-default permission, so "unchanged" means something.
  await lists.getByRole('button', { name: 'New list' }).click();
  const form = lists.locator('div.card');
  await form.getByLabel('List name').fill('Design team');
  await form.getByLabel('Email addresses').fill('ana@example.com\nbo@example.com');
  await form.getByLabel('Permission').selectOption({ label: 'Commenter' });
  await form.getByRole('button', { name: 'Save list' }).click();

  const card = lists.locator('details.list-card');
  await expect(card.locator('.pick-name')).toHaveText('Design team');
  await card.locator('summary').click();

  await card.getByLabel('List name').fill('');
  await card.getByRole('button', { name: 'Save', exact: true }).click();

  await expect(card.locator('.pick-name')).toHaveText('ana@example.com & bo@example.com');
  await expect(card.locator('.meta')).toHaveText('2 people · Commenter');
  await expect(lists.locator('.alert')).toHaveCount(0);
  await expect(card.getByLabel('List name')).toHaveValue('ana@example.com & bo@example.com');
  await expect(card.getByLabel('Email addresses')).toHaveValue('ana@example.com\nbo@example.com');
  await expect(card.getByLabel('Permission')).toHaveValue('comment');
  await expect(panel.getByRole('tab', { name: /Lists/ })).toContainText('1');
});
