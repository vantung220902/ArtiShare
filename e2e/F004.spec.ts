import type { Page } from '@playwright/test';
import { answer, confirmation, expect, test } from './fixtures';

// F004: confirmations are drawn inside the popup. The fixture fails any test in which a native
// dialog opens, so every spec here also proves none did.

async function makeList(panel: Page, name: string, emails: string) {
  await panel.getByRole('tab', { name: /Lists/ }).click();
  const lists = panel.getByRole('tabpanel', { name: /Lists/ });
  await lists.getByRole('button', { name: 'New list' }).click();
  await lists.getByLabel('List name').filter({ visible: true }).fill(name);
  await lists.getByLabel('Email addresses').filter({ visible: true }).fill(emails);
  await lists.getByRole('button', { name: 'Save list' }).click();
  await expect(lists.locator('summary', { hasText: name })).toBeVisible();
  return lists;
}

test('deleting a list asks inside the popup; Cancel and Escape keep it, confirming removes it', async ({
  panel,
}) => {
  const lists = await makeList(panel, 'Doomed team', 'ana@example.com');
  await lists.locator('summary', { hasText: 'Doomed team' }).click();
  const summary = lists.locator('summary', { hasText: 'Doomed team' });
  const del = lists.getByRole('button', { name: 'Delete' });

  // Cancel button.
  await del.click();
  await expect(confirmation(panel)).toBeVisible();
  await expect(confirmation(panel)).toContainText('Delete the list "Doomed team"?');
  await expect(confirmation(panel).getByRole('button', { name: 'Delete', exact: true })).toBeVisible();
  // The safe answer has the focus, so a stray Enter doesn't delete anything.
  await expect(confirmation(panel).getByRole('button', { name: 'Cancel' })).toBeFocused();
  await answer(panel, 'Cancel');
  await expect(confirmation(panel)).toHaveCount(0);
  await expect(summary).toBeVisible();

  // Escape.
  await del.click();
  await expect(confirmation(panel)).toBeVisible();
  await panel.keyboard.press('Escape');
  await expect(confirmation(panel)).toHaveCount(0);
  await expect(summary).toBeVisible();
  // The Delete button is usable again after a cancel: nothing was left busy.
  await expect(del).toBeEnabled();

  // Confirm.
  await del.click();
  await answer(panel, 'Delete');
  await expect(summary).toHaveCount(0);
  await expect(confirmation(panel)).toHaveCount(0);
});

test('Send asks how many invitations go to how many artifacts; Cancel keeps the preview, Send starts the run', async ({
  panel,
}) => {
  const share = panel.getByRole('tabpanel', { name: 'Share' });
  await share.getByLabel('List name').fill('Sendable team');
  await share.getByLabel('Email addresses').fill('ana@example.com\nbo@example.com');
  await share
    .getByLabel(/Artifacts/)
    .fill('https://claude.ai/artifact/ConfirmSendOne01\nhttps://claude.ai/artifact/ConfirmSendTwo02');
  await share.getByRole('button', { name: /^Preview/ }).click();
  const send = share.getByRole('button', { name: 'Send 4 invitations' });
  await send.click();
  await expect(confirmation(panel)).toContainText(
    'Send 4 invitations across 2 artifacts as owner@example.com?',
  );
  await expect(confirmation(panel)).toContainText('People outside your organization will get an email');

  // Cancel keeps the preview and leaves Send usable.
  await answer(panel, 'Cancel');
  await expect(confirmation(panel)).toHaveCount(0);
  await expect(send).toBeEnabled();
  await expect(share.getByText('Running', { exact: true })).toHaveCount(0);

  // Escape does the same.
  await send.click();
  await panel.keyboard.press('Escape');
  await expect(confirmation(panel)).toHaveCount(0);
  await expect(send).toBeEnabled();

  // Confirming starts the run.
  await send.click();
  await answer(panel, 'Send');
  await expect(share.getByText(/Running|Done/).first()).toBeVisible();
  await expect(share.getByText('Done', { exact: true })).toBeVisible({ timeout: 30_000 });
});

test('discarding a stopped run asks inside the popup; Cancel keeps it, Discard opens a fresh form', async ({
  panel,
}) => {
  const share = panel.getByRole('tabpanel', { name: 'Share' });
  await share.getByLabel('List name').fill('Discardable team');
  // The run pauses between invites, which leaves time to press Stop with some pending.
  await share
    .getByLabel('Email addresses')
    .fill('ana@example.com\nbo@example.com\ncy@example.com\ndi@example.com\ned@example.com');
  await share.getByLabel(/Artifacts/).fill('https://claude.ai/artifact/DiscardRunArtifact01');
  await share.getByRole('button', { name: /^Preview/ }).click();
  await share.getByRole('button', { name: 'Send 5 invitations' }).click();
  await answer(panel, 'Send');
  await expect(share.getByText(/[1-9]\d* invited/).first()).toBeVisible();
  await share.getByRole('button', { name: 'Stop' }).click();
  await expect(share.getByText('Stopped', { exact: true })).toBeVisible();

  const startNew = share.getByRole('button', { name: 'Start a new share' });
  await startNew.click();
  await expect(confirmation(panel)).toContainText('Discard this run?');
  await expect(confirmation(panel)).toContainText('The remaining invites will not be sent.');
  await answer(panel, 'Cancel');
  await expect(confirmation(panel)).toHaveCount(0);
  await expect(share.getByText('Stopped', { exact: true })).toBeVisible();
  await expect(share.getByRole('button', { name: 'Resume' })).toBeVisible();

  await startNew.click();
  await panel.keyboard.press('Escape');
  await expect(confirmation(panel)).toHaveCount(0);
  await expect(share.getByRole('button', { name: 'Resume' })).toBeVisible();

  await startNew.click();
  await answer(panel, 'Discard');
  await expect(share.getByLabel(/Artifacts/)).toHaveValue('');
  await expect(share.getByText('Stopped', { exact: true })).toHaveCount(0);
});
