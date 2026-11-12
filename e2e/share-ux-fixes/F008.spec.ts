import { expect, test } from '../fixtures';

// F008: an automatic name never clashes; a name of only spaces counts as empty.
test('an automatic name is numbered when taken, and a typed name that clashes still errors', async ({
  panel,
}) => {
  await panel.getByRole('tab', { name: /Lists/ }).click();
  const lists = panel.getByRole('tabpanel', { name: /Lists/ });

  const save = async (emails: string, name?: string) => {
    await lists.getByRole('button', { name: 'New list' }).click();
    const form = lists.locator('div.card');
    if (name !== undefined) await form.getByLabel('List name').fill(name);
    await form.getByLabel('Email addresses').fill(emails);
    await form.getByRole('button', { name: 'Save list' }).click();
  };
  const row = (name: string) => lists.locator('.pick-name').getByText(name, { exact: true });
  const count = (n: number) => expect(panel.getByRole('tab', { name: /Lists/ })).toContainText(String(n));

  await save('ana@example.com');
  await expect(row('ana@example.com')).toHaveCount(1);

  await save('ana@example.com');
  await expect(row('ana@example.com (2)')).toHaveCount(1);
  await expect(lists.locator('.alert')).toHaveCount(0);

  await save('ana@example.com');
  await expect(row('ana@example.com (3)')).toHaveCount(1);
  await expect(lists.locator('.alert')).toHaveCount(0);
  await count(3);

  // Spaces only is the same as empty.
  await save('bo@example.com', '   ');
  await expect(row('bo@example.com')).toHaveCount(1);
  await count(4);

  // A name typed by hand that is taken still errors (case-insensitively) and saves nothing.
  await save('cy@example.com', 'ANA@example.com');
  await expect(lists.locator('.alert')).toContainText('A list called "ANA@example.com" already exists.');
  await count(4);
});
