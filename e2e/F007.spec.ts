import { expect, test } from './fixtures';

// F007: while the name is empty, its placeholder previews the name the list will get.
test("the name field's placeholder shows the name the list will get", async ({ panel }) => {
  await panel.getByRole('tab', { name: /Lists/ }).click();
  const lists = panel.getByRole('tabpanel', { name: /Lists/ });
  await lists.getByRole('button', { name: 'New list' }).click();

  const form = lists.locator('div.card');
  const name = form.getByLabel('List name');
  const emails = form.getByLabel('Email addresses');

  await expect(name).toHaveValue('');
  await expect(name).toHaveAttribute('placeholder', 'List name, e.g. Acme clients');

  await emails.fill('ana@example.com');
  await expect(name).toHaveAttribute('placeholder', 'ana@example.com');

  await emails.fill('ana@example.com\nbo@example.com');
  await expect(name).toHaveAttribute('placeholder', 'ana@example.com & bo@example.com');

  // Duplicates and unparsable text don't count; the preview matches what would be saved.
  await emails.fill('ana@example.com\nbo@example.com\nana@example.com\ncy@example.com');
  await expect(name).toHaveAttribute('placeholder', 'ana@example.com & bo@example.com +1 email');

  await emails.fill('');
  await expect(name).toHaveAttribute('placeholder', 'List name, e.g. Acme clients');

  // A typed name replaces the placeholder and is the saved name.
  await emails.fill('ana@example.com\nbo@example.com');
  await name.fill('Acme clients');
  await expect(name).toHaveValue('Acme clients');
  await form.getByRole('button', { name: 'Save list' }).click();
  await expect(lists.locator('.pick-name').getByText('Acme clients', { exact: true })).toHaveCount(1);
  await expect(lists.locator('.pick-name').getByText('ana@example.com & bo@example.com')).toHaveCount(0);
});
