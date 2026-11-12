import { expect, test } from '../fixtures';

// F014: when the clipboard refuses, the copy button says so instead of failing silently.
test('the copy button says "Couldn\'t copy" when the clipboard refuses', async ({ panel }) => {
  const share = panel.getByRole('tabpanel', { name: 'Share' });
  await share.getByLabel('List name').fill('Refusal team');
  await share.getByLabel('Email addresses').fill('ana@example.com\nbo@example.com');
  const url = 'https://claude.ai/artifact/CopyRefusedArtifact1';
  await share.getByLabel(/Artifacts/).fill(url);
  await share.getByRole('button', { name: /^Preview/ }).click();
  await expect(share.getByText('Will be invited').first()).toBeVisible();

  // Both the async clipboard API and the execCommand fallback have to fail.
  await panel.evaluate(() => {
    Object.defineProperty(navigator.clipboard, 'writeText', {
      configurable: true,
      value: () => Promise.reject(new DOMException('Document is not focused', 'NotAllowedError')),
    });
    document.execCommand = () => false;
  });

  const row = share.locator('.artifact-row');
  await row.getByRole('button', { name: 'Copy link' }).click();
  const failed = row.getByRole('button', { name: "Couldn't copy" });
  await expect(failed).toBeVisible();
  await expect(failed).toHaveAttribute('title', "Couldn't copy");
  await expect(failed).toHaveClass(/failed/);
  await expect(failed).not.toHaveClass(/copied/);
  // It's not mistaken for a success.
  await expect(row.getByRole('button', { name: 'Copied' })).toHaveCount(0);

  // It stays for a moment, then goes back so the user can try again.
  await panel.waitForTimeout(1000);
  await expect(failed).toBeVisible();
  await expect(row.getByRole('button', { name: 'Copy link' })).toBeVisible({ timeout: 2500 });
  await expect(row.getByRole('button', { name: "Couldn't copy" })).toHaveCount(0);

  // The panel keeps working: the link is still a normal link, and Send still runs.
  const link = row.getByRole('link');
  await expect(link).toHaveAttribute('href', url);
  await expect(link).toHaveAttribute('target', '_blank');
  await expect(share.locator('.alert')).toHaveCount(0);

  await share.getByRole('button', { name: 'Send 2 invitations' }).click();
  await expect(share.getByText('Done', { exact: true })).toBeVisible({ timeout: 20_000 });
  await expect(share.getByText('2 invited')).toBeVisible();

  // Also in the run view, a refused copy is reported.
  await row.getByRole('button', { name: 'Copy link' }).click();
  await expect(row.getByRole('button', { name: "Couldn't copy" })).toBeVisible();
});

// The fallback copies through a hidden field it has to focus; the button must get focus back.
test('a copy through the fallback leaves keyboard focus on the copy button', async ({ panel }) => {
  const share = panel.getByRole('tabpanel', { name: 'Share' });
  await share.getByLabel('List name').fill('Fallback team');
  await share.getByLabel('Email addresses').fill('ana@example.com');
  await share.getByLabel(/Artifacts/).fill('https://claude.ai/artifact/CopyFallbackArtifact1');
  await share.getByRole('button', { name: /^Preview/ }).click();
  await expect(share.getByText('Will be invited').first()).toBeVisible();

  // Only the async API refuses; execCommand('copy') still works.
  await panel.evaluate(() => {
    Object.defineProperty(navigator.clipboard, 'writeText', {
      configurable: true,
      value: () => Promise.reject(new DOMException('Document is not focused', 'NotAllowedError')),
    });
  });

  const row = share.locator('.artifact-row');
  await row.getByRole('button', { name: 'Copy link' }).focus();
  await panel.keyboard.press('Enter');
  const copied = row.getByRole('button', { name: 'Copied' });
  await expect(copied).toBeVisible();
  await expect(copied).toBeFocused();
  await expect(share.locator('textarea[style*="opacity"]')).toHaveCount(0);
});
