import { expect, test } from './fixtures';

// The core flow, end to end, against the fake claude.ai (see src/claude/fakeShareClient.ts):
// make a list, preview it against an artifact, send, and see each invite's outcome.
// Every long-running session runs this before starting new work (see CLAUDE.md).
test('make a list, preview and send invites', async ({ panel }) => {
  await expect(panel.getByRole('heading', { name: 'ArtiShare' })).toBeVisible();

  await panel.getByRole('tab', { name: /Lists/ }).click();
  const lists = panel.getByRole('tabpanel', { name: /Lists/ });
  await lists.getByRole('button', { name: 'New list' }).click();
  await lists.getByLabel('List name').fill('Smoke team');
  await lists.getByLabel('Email addresses').fill('ana@example.com\nfail@example.com');
  await lists.getByRole('button', { name: 'Save list' }).click();
  await expect(panel.getByRole('tab', { name: /Lists/ })).toContainText('1');

  await panel.getByRole('tab', { name: 'Share' }).click();
  const share = panel.getByRole('tabpanel', { name: 'Share' });
  await share.getByLabel(/Artifacts/).fill('https://claude.ai/artifact/SmokeTestArtifact01');
  const pick = share.locator('label.pick', { hasText: 'Smoke team' }).getByRole('checkbox');
  await pick.check();
  await share.getByRole('button', { name: /^Preview/ }).click();

  await expect(share.getByText('Will be invited')).toBeVisible();
  // The list of names is collapsed; it only has to be there.
  await expect(share.getByText('ana@example.com · Can view')).toBeAttached();
  await share.getByRole('button', { name: 'Send 2 invitations' }).click();

  await expect(share.getByText('Done', { exact: true })).toBeVisible({ timeout: 20_000 });
  await expect(share.getByText('1 invited')).toBeVisible();
  await expect(share.getByText('1 failed')).toBeVisible();
  await expect(share.getByText('This address was rejected')).toBeVisible();
});
