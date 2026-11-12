import { expect, test } from '../fixtures';

// F016: 'Start a new share' after a finished run goes straight to a fresh Share form.
test('Start a new share after a finished run opens a fresh Share form without a confirmation', async ({
  panel,
}) => {
  const dialogs: string[] = [];
  panel.on('dialog', (d) => dialogs.push(d.message()));

  // Two lists, with only the first ticked by default.
  await panel.getByRole('tab', { name: /Lists/ }).click();
  const lists = panel.getByRole('tabpanel', { name: /Lists/ });
  const made: Record<string, string> = {
    'Alpha team': 'ana@example.com\nfail@example.com',
    'Beta team': 'bo@example.com',
  };
  for (const [name, emails] of Object.entries(made)) {
    // A reload closes the list just saved; its form stays in the DOM, so match only the visible one.
    await panel.reload();
    await panel.getByRole('tab', { name: /Lists/ }).click();
    await lists.getByRole('button', { name: 'New list' }).click();
    await lists.getByLabel('List name').filter({ visible: true }).fill(name);
    await lists.getByLabel('Email addresses').filter({ visible: true }).fill(emails);
    await lists.getByRole('button', { name: 'Save list' }).click();
    await expect(lists.locator('summary', { hasText: name })).toBeVisible();
  }
  await lists.getByLabel('Only these').check();
  const defaultAlpha = lists.locator('label.choice', { hasText: 'Alpha team' }).getByRole('checkbox');
  // The box is controlled by the saved config, so it flips only once the save comes back.
  await defaultAlpha.click();
  await expect(defaultAlpha).toBeChecked();
  await expect(
    lists.locator('label.choice', { hasText: 'Beta team' }).getByRole('checkbox'),
  ).not.toBeChecked();

  await panel.getByRole('tab', { name: 'Share' }).click();
  const share = panel.getByRole('tabpanel', { name: 'Share' });
  const alpha = share.locator('label.pick', { hasText: 'Alpha team' }).getByRole('checkbox');
  const beta = share.locator('label.pick', { hasText: 'Beta team' }).getByRole('checkbox');
  await expect(alpha).toBeChecked();
  await expect(beta).not.toBeChecked();

  // Tick Beta too for this run, so the fresh form has to forget it.
  await beta.check();
  await share.getByLabel(/Artifacts/).fill('https://claude.ai/artifact/FreshFormArtifact001');
  await share.getByRole('button', { name: /^Preview/ }).click();
  await share.getByRole('button', { name: /^Send \d+ invitations?$/ }).click();
  await expect(share.getByText('Done', { exact: true })).toBeVisible({ timeout: 20_000 });
  // Sending asks once; only what happens after this point is under test.
  dialogs.length = 0;

  await share.getByRole('button', { name: 'Start a new share' }).click();

  // The fresh form: Artifacts empty and focused, the default selection ticked, nothing else left over.
  const artifacts = share.getByLabel(/Artifacts/);
  await expect(artifacts).toBeVisible();
  await expect(artifacts).toHaveValue('');
  await expect(artifacts).toBeFocused();
  await expect(share.locator('label.pick', { hasText: 'Alpha team' }).getByRole('checkbox')).toBeChecked();
  await expect(share.locator('label.pick', { hasText: 'Beta team' }).getByRole('checkbox')).not.toBeChecked();
  await expect(share.locator('.alert')).toHaveCount(0);
  await expect(share.getByText('Will be invited')).toHaveCount(0);
  await expect(share.getByText('Share finished')).toHaveCount(0);
  expect(dialogs).toEqual([]);

  // And it works: a new run starts.
  await artifacts.fill('https://claude.ai/artifact/FreshFormArtifact002');
  await share.getByRole('button', { name: /^Preview/ }).click();
  await expect(share.getByText('Will be invited')).toBeVisible();
  await share.getByRole('button', { name: /^Send \d+ invitations?$/ }).click();
  await expect(share.getByText('Done', { exact: true })).toBeVisible({ timeout: 20_000 });
  await expect(share.getByRole('link', { name: /FreshFormArtifact002/ })).toBeVisible();

  // The focus belongs to that one click: a run cleared some other way (here, as another window
  // would) brings back the Share form without moving the cursor into Artifacts.
  const shareTab = panel.getByRole('tab', { name: 'Share' });
  await shareTab.focus();
  await panel.evaluate(() => chrome.runtime.sendMessage({ type: 'clear' }));
  await expect(artifacts).toBeVisible();
  await expect(artifacts).not.toBeFocused();
  await expect(shareTab).toBeFocused();
});
