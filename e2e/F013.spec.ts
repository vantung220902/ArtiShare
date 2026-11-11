import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

// Pastes into a scratch textarea, since reading the clipboard directly needs a permission.
async function expectClipboard(panel: Page, expected: string) {
  await panel.evaluate(() => {
    const field = document.createElement('textarea');
    field.id = 'paste-probe';
    document.body.append(field);
    field.focus();
  });
  await panel.keyboard.press('ControlOrMeta+V');
  await expect(panel.locator('#paste-probe')).toHaveValue(expected);
  await panel.locator('#paste-probe').evaluate((el) => el.remove());
}

// F013: the run view's artifact links have the same copy button, during and after the run.
test('the run view has a copy button beside each artifact link, running and done', async ({ panel }) => {
  const share = panel.getByRole('tabpanel', { name: 'Share' });
  await share.getByLabel('List name').fill('Run copy team');
  // "slow" is rate-limited once by the fake, which keeps the run going long enough to click.
  await share.getByLabel('Email addresses').fill('ana@example.com\nslow@example.com');
  const first = 'https://claude.ai/artifact/RunCopyArtifact001';
  const second = 'https://claude.ai/artifact/RunCopyArtifact002';
  await share.getByLabel(/Artifacts/).fill(`${first}\n${second}`);
  await share.getByRole('button', { name: /^Preview/ }).click();
  await share.getByRole('button', { name: 'Send 4 invitations' }).click();

  // While the run is running.
  await expect(share.getByText('Running', { exact: true })).toBeVisible();
  const rows = share.locator('.artifact-row');
  await expect(rows).toHaveCount(2);
  await rows.nth(0).getByRole('button', { name: 'Copy link' }).click();
  await expect(rows.nth(0).getByRole('button', { name: 'Copied' })).toBeVisible();
  // Still running after the click, so this really was the running view.
  await expect(share.getByText('Running', { exact: true })).toBeVisible();
  await expectClipboard(panel, first);

  // The link text still opens the artifact in a new tab.
  const link = rows.nth(0).getByRole('link');
  await expect(link).toHaveAttribute('href', first);
  await expect(link).toHaveAttribute('target', '_blank');

  // After the run is done.
  await expect(share.getByText('Done', { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(share.getByText('4 invited')).toBeVisible();
  await expect(rows).toHaveCount(2);
  await expect(share.getByRole('button', { name: 'Copy link' })).toHaveCount(2);
  await rows.nth(1).getByRole('button', { name: 'Copy link' }).click();
  await expect(rows.nth(1).getByRole('button', { name: 'Copied' })).toBeVisible();
  await expectClipboard(panel, second);
  // It goes back to 'Copy link' after a moment, as in the Preview.
  await expect(rows.nth(1).getByRole('button', { name: 'Copy link' })).toBeVisible({ timeout: 3500 });
});
