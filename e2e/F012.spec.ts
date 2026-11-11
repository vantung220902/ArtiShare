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

// F012: each artifact link in the Preview has a copy button.
test('the Preview has a copy button beside each artifact link', async ({ panel }) => {
  const share = panel.getByRole('tabpanel', { name: 'Share' });
  await share.getByLabel('List name').fill('Copy team');
  await share.getByLabel('Email addresses').fill('ana@example.com');
  const first = 'https://claude.ai/artifact/CopyLinkArtifact001';
  const second = 'https://claude.ai/artifact/CopyLinkArtifact002';
  await share.getByLabel(/Artifacts/).fill(`${first}\n${second}`);
  await share.getByRole('button', { name: /^Preview/ }).click();
  await expect(share.getByText('Will be invited').first()).toBeVisible();

  const rows = share.locator('.artifact-row');
  await expect(rows).toHaveCount(2);
  await expect(share.getByRole('button', { name: 'Copy link' })).toHaveCount(2);

  // Each button copies its own artifact's full link.
  await rows.nth(1).getByRole('button', { name: 'Copy link' }).click();
  await expect(rows.nth(1).getByRole('button', { name: 'Copied' })).toBeVisible();
  await expectClipboard(panel, second);
  // The other row is untouched.
  await expect(rows.nth(0).getByRole('button', { name: 'Copy link' })).toBeVisible();

  // The copied state shows a check, stays for about 2 seconds, then reverts.
  const copied = rows.nth(1).getByRole('button', { name: 'Copied' });
  await expect(copied).toHaveClass(/copied/);
  await expect(copied.locator('svg path[d="M20 6 9 17l-5-5"]')).toHaveCount(1);
  await panel.waitForTimeout(1000);
  await expect(copied).toBeVisible();
  await expect(rows.nth(1).getByRole('button', { name: 'Copy link' })).toBeVisible({ timeout: 2500 });
  await expect(rows.nth(1).locator('svg path[d="M20 6 9 17l-5-5"]')).toHaveCount(0);

  await rows.nth(0).getByRole('button', { name: 'Copy link' }).click();
  await expect(rows.nth(0).getByRole('button', { name: 'Copied' })).toBeVisible();
  await expectClipboard(panel, first);

  // The link text itself still opens the artifact in a new tab.
  const link = rows.nth(0).getByRole('link');
  await expect(link).toHaveAttribute('href', first);
  await expect(link).toHaveAttribute('target', '_blank');
});

test('copying needs no clipboard permission in the manifest', async ({ panel }) => {
  const permissions = await panel.evaluate(() => chrome.runtime.getManifest().permissions ?? []);
  expect(permissions).not.toContain('clipboardWrite');
  expect(permissions).not.toContain('clipboardRead');
});
