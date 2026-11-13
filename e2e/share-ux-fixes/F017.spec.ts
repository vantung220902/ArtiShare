import { answer, confirmation, expect, test } from '../fixtures';

// F017: a stopped run with invites left asks before it is discarded; with nothing left it doesn't.
test('a stopped run with invites left asks before Start a new share, and Cancel keeps it', async ({
  panel,
}) => {
  const share = panel.getByRole('tabpanel', { name: 'Share' });
  await share.getByLabel('List name').fill('Stoppable team');
  // The run pauses about a second between invites, which leaves time to press Stop with some pending.
  await share
    .getByLabel('Email addresses')
    .fill('ana@example.com\nbo@example.com\ncy@example.com\ndi@example.com\ned@example.com');
  await share.getByLabel(/Artifacts/).fill('https://claude.ai/artifact/StoppedRunArtifact01');
  await share.getByRole('button', { name: /^Preview/ }).click();
  await share.getByRole('button', { name: 'Send 5 invitations' }).click();
  await answer(share, 'Send');
  await expect(share.getByText('Running', { exact: true })).toBeVisible();

  await expect(share.getByText(/[1-9]\d* invited/).first()).toBeVisible();
  await share.getByRole('button', { name: 'Stop' }).click();
  await expect(share.getByText('Stopped', { exact: true })).toBeVisible();
  await expect(share.getByText(/\d+ left/)).toBeVisible();

  // Resume is the primary action; Start a new share is there but plain.
  const resume = share.getByRole('button', { name: 'Resume' });
  const startNew = share.getByRole('button', { name: 'Start a new share' });
  await expect(resume).toHaveClass(/primary/);
  await expect(startNew).not.toHaveClass(/primary/);

  // Cancel: the question is asked, and the stopped run is still here, still resumable.
  await startNew.click();
  await expect(confirmation(panel)).toContainText('Discard this run?');
  await expect(confirmation(panel)).toContainText('The remaining invites will not be sent.');
  await answer(panel, 'Cancel');
  await expect(confirmation(panel)).toHaveCount(0);
  await expect(share.getByText('Stopped', { exact: true })).toBeVisible();
  await expect(resume).toBeVisible();
  await expect(share.getByText(/\d+ left/)).toBeVisible();
  await expect(share.getByLabel(/Artifacts/)).toHaveCount(0);
  // It is kept for real, not just on screen.
  await panel.reload();
  await expect(share.getByText('Stopped', { exact: true })).toBeVisible();
  await expect(resume).toBeVisible();

  // Accept: the fresh Share form, as in F016.
  await startNew.click();
  await answer(panel, 'Discard');
  const artifacts = share.getByLabel(/Artifacts/);
  await expect(artifacts).toBeVisible();
  await expect(artifacts).toHaveValue('');
  await expect(artifacts).toBeFocused();
  await expect(share.getByText('Stopped', { exact: true })).toHaveCount(0);
  await expect(share.getByRole('button', { name: 'Resume' })).toHaveCount(0);
  await expect(share.locator('.alert')).toHaveCount(0);

  // A stopped run with nothing left: five failures in a row stop the run after the last address.
  await share.getByRole('button', { name: 'New list' }).click();
  await share.getByLabel('List name').filter({ visible: true }).fill('Rejected team');
  await share
    .getByLabel('Email addresses')
    .filter({ visible: true })
    .fill('fail1@example.com\nfail2@example.com\nfail3@example.com\nfail4@example.com\nfail5@example.com');
  await share.locator('label.pick', { hasText: 'Stoppable team' }).getByRole('checkbox').uncheck();
  await artifacts.fill('https://claude.ai/artifact/StoppedRunArtifact02');
  await share.getByRole('button', { name: /^Preview/ }).click();
  await share.getByRole('button', { name: 'Send 5 invitations' }).click();
  await answer(share, 'Send');
  await expect(share.getByText('Stopped', { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(share.getByText('5 failed', { exact: true })).toBeVisible();
  await expect(share.getByText(/\d+ left/)).toHaveCount(0);
  await expect(share.getByRole('button', { name: 'Resume' })).toHaveCount(0);

  await startNew.click();
  await expect(artifacts).toBeVisible();
  await expect(artifacts).toHaveValue('');
  await expect(share.getByText('Stopped', { exact: true })).toHaveCount(0);
  await expect(confirmation(panel)).toHaveCount(0);
});
