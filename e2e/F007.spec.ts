import { expect, test } from './fixtures';

const PLACEHOLDER = 'List name, e.g. Acme clients';

// F007: the name field keeps its normal placeholder; the automatic name only appears once saved.
test('the name placeholder stays fixed and the automatic name is filled in after saving', async ({
  panel,
}) => {
  await panel.getByRole('tab', { name: /Lists/ }).click();
  const lists = panel.getByRole('tabpanel', { name: /Lists/ });
  await lists.getByRole('button', { name: 'New list' }).click();

  const form = lists.locator('div.card');
  const name = form.getByLabel('List name');
  const emails = form.getByLabel('Email addresses');

  await expect(name).toHaveValue('');
  await expect(name).toHaveAttribute('placeholder', PLACEHOLDER);

  await emails.fill('ana@example.com\nbo@example.com');
  await expect(name).toHaveAttribute('placeholder', PLACEHOLDER);
  await expect(name).toHaveValue('');

  await form.getByRole('button', { name: 'Save list' }).click();
  const card = lists.locator('details.list-card');
  await expect(card).toHaveCount(1);
  await card.locator('summary').click();
  await expect(card.getByLabel('List name')).toHaveValue('ana@example.com & bo@example.com');

  // A typed name is the one that gets saved.
  await lists.getByRole('button', { name: 'New list' }).click();
  await expect(name).toHaveAttribute('placeholder', PLACEHOLDER);
  await emails.fill('cy@example.com\ndi@example.com');
  await name.fill('Acme clients');
  await form.getByRole('button', { name: 'Save list' }).click();
  await expect(lists.locator('.pick-name').getByText('Acme clients', { exact: true })).toHaveCount(1);
  await expect(lists.locator('.pick-name').getByText('cy@example.com & di@example.com')).toHaveCount(0);
});
