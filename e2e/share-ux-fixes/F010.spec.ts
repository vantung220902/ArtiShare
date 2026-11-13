import { expect, test } from '../fixtures';

// F010: Preview saves an unnamed list typed in the Share tab's inline form under its automatic name.
test('Preview saves an unnamed inline list with its automatic name and ticks it', async ({ panel }) => {
  // With a saved list around, the inline form sits behind "+ New list" instead of showing at once.
  await panel.getByRole('tab', { name: /Lists/ }).click();
  const lists = panel.getByRole('tabpanel', { name: /Lists/ });
  await lists.getByRole('button', { name: 'New list' }).click();
  await lists.getByLabel('List name').fill('Existing team');
  await lists.getByLabel('Email addresses').fill('cy@example.com');
  await lists.getByRole('button', { name: 'Save list' }).click();
  await expect(panel.getByRole('tab', { name: /Lists/ })).toContainText('1');

  await panel.getByRole('tab', { name: 'Share' }).click();
  const share = panel.getByRole('tabpanel', { name: 'Share' });
  await share.getByLabel(/Artifacts/).fill('https://claude.ai/artifact/UnnamedListArtifact01');
  // Only the new list should be shared with, so the preview header names just it.
  await share.locator('label.pick', { hasText: 'Existing team' }).getByRole('checkbox').uncheck();

  await share.getByRole('button', { name: 'New list' }).click();
  const form = share.locator('.subcard');
  await expect(form.getByLabel(/List name/)).toHaveValue('');
  await form.getByLabel('Email addresses').fill('ana@example.com\nbo@example.com');
  await share.getByRole('button', { name: /^Preview/ }).click();

  const name = 'ana@example.com & bo@example.com';
  await expect(share.getByText('Will be invited')).toBeVisible();
  await expect(share.locator('.row .hint.truncate')).toHaveText(name);
  await expect(share.locator('.alert')).toHaveCount(0);

  // The list was saved, and is ticked in Share with once you go back.
  await share.getByRole('button', { name: 'Back' }).click();
  const pick = share.locator('label.pick', { has: panel.locator('.pick-name', { hasText: name }) });
  await expect(pick).toHaveCount(1);
  await expect(pick.getByRole('checkbox')).toBeChecked();
  await expect(
    share.locator('label.pick', { hasText: 'Existing team' }).getByRole('checkbox'),
  ).not.toBeChecked();

  await panel.getByRole('tab', { name: /Lists/ }).click();
  await expect(panel.getByRole('tab', { name: /Lists/ })).toContainText('2');
  await expect(lists.locator('.pick-name').getByText(name, { exact: true })).toHaveCount(1);
  await expect(lists.locator('details.list-card', { hasText: name }).locator('.meta')).toHaveText(
    '2 people · Can view',
  );
});
