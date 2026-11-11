import { expect, test } from './fixtures';

// F005: required fields carry a visual * (hidden from screen readers) and aria-required; the
// list name is labelled optional. Checked in a new list, an existing list and the Share tab.
test('required fields are marked with * and the list name is labelled optional', async ({ panel }) => {
  await panel.getByRole('tab', { name: /Lists/ }).click();
  const lists = panel.getByRole('tabpanel', { name: /Lists/ });
  await lists.getByRole('button', { name: 'New list' }).click();

  // textContent includes the aria-hidden *, which is what a sighted user reads.
  const labelText = (scope: typeof lists, text: string) =>
    scope.locator('label', { hasText: text }).first().textContent();

  expect(await labelText(lists, 'Email addresses')).toBe('Email addresses *');
  expect(await labelText(lists, 'List name')).toBe('List name (optional)');
  // The * is decorative: the accessible name stays clean and the field is required instead.
  await expect(lists.locator('label span.required-mark')).toHaveAttribute('aria-hidden', 'true');
  await expect(lists.getByRole('textbox', { name: 'Email addresses', exact: true })).toHaveAttribute(
    'aria-required',
    'true',
  );
  await expect(lists.getByLabel('List name (optional)')).not.toHaveAttribute('aria-required', 'true');

  // The same labels on an existing list.
  await lists.getByLabel('List name (optional)').fill('Label team');
  await lists.getByLabel('Email addresses').fill('ana@example.com');
  await lists.getByRole('button', { name: 'Save list' }).click();
  await expect(panel.getByRole('tab', { name: /Lists/ })).toContainText('1');

  const existing = lists.locator('details', { hasText: 'Label team' });
  await existing.locator('summary').click();
  expect(await labelText(existing, 'Email addresses')).toBe('Email addresses *');
  expect(await labelText(existing, 'List name')).toBe('List name (optional)');
  await expect(existing.getByLabel('Email addresses')).toHaveAttribute('aria-required', 'true');

  // The Share tab: Artifacts, and the inline + New list form.
  await panel.getByRole('tab', { name: 'Share' }).click();
  const share = panel.getByRole('tabpanel', { name: 'Share' });
  await expect(share.locator('label[for="artifacts"]')).toHaveText('Artifacts *');
  await expect(share.locator('#artifacts')).toHaveAttribute('aria-required', 'true');

  await share.getByRole('button', { name: 'New list' }).click();
  expect(await labelText(share, 'Email addresses')).toBe('Email addresses *');
  expect(await labelText(share, 'List name')).toBe('List name (optional)');
  await expect(share.getByLabel('Email addresses')).toHaveAttribute('aria-required', 'true');
});
