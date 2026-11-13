import type { Page } from '@playwright/test';
import { answer, expect, test } from '../fixtures';

// F009: the run lives in the background, so closing the popup mid-run doesn't stop it, and the
// reopened popup shows where it has got to. Closing is leaving the popup page (about:blank), which
// ends its listeners just as a real close does; the background keeps going on its own.

const ARTIFACT = 'https://claude.ai/artifact/ClosedMidRunArtifact01';

/** The invited count shown in the run view's chip. */
async function invitedCount(panel: Page): Promise<number> {
  const chip = panel.getByRole('tabpanel', { name: 'Share' }).locator('.chip.ok');
  const text = (await chip.textContent({ timeout: 2_000 }).catch(() => null)) ?? '';

  return Number(/(\d+) invited/.exec(text)?.[1] ?? -1);
}

async function close(panel: Page): Promise<string> {
  const url = panel.url();
  await panel.goto('about:blank');

  return url;
}

test("closing the popup mid-run doesn't stop the run; reopening shows it, and Stop and Resume still work", async ({
  panel,
}) => {
  const share = panel.getByRole('tabpanel', { name: 'Share' });
  await share.getByLabel('List name').fill('Closing team');
  // The slow address is last: it is rate-limited once, which keeps the run going for another second.
  await share
    .getByLabel('Email addresses')
    .fill('ana@example.com\nbo@example.com\ncy@example.com\nslow-di@example.com');
  await share.getByLabel(/Artifacts/).fill(ARTIFACT);
  await share.getByRole('button', { name: /^Preview/ }).click();
  await share.getByRole('button', { name: 'Send 4 invitations' }).click();
  await answer(share, 'Send');
  await expect(share.getByText('Running', { exact: true })).toBeVisible();

  // Close as soon as one address has been invited; the run is far from over (each invite takes a
  // third of a second and the run pauses about a second between them).
  await expect.poll(() => invitedCount(panel)).toBeGreaterThanOrEqual(1);
  const before = await invitedCount(panel);
  expect(before).toBeLessThan(4);
  const url = await close(panel);

  // Reopened a few seconds later: more are invited, and the run is still going.
  await panel.waitForTimeout(1_500);
  await panel.goto(url);
  await expect(share.getByText('Running', { exact: true })).toBeVisible();
  await expect(share.getByText('Closing team')).toBeVisible();
  expect(await invitedCount(panel)).toBeGreaterThan(before);
  const reopened = await invitedCount(panel);
  expect(reopened).toBeLessThan(4);
  await expect(share.getByRole('button', { name: 'Stop' })).toBeVisible();

  // Live: it moves on by itself while the popup stays open.
  await expect.poll(() => invitedCount(panel)).toBeGreaterThan(reopened);

  // Stop, close and reopen: still stopped, with what was left, and Resume.
  await share.getByRole('button', { name: 'Stop' }).click();
  await expect(share.getByText('Stopped', { exact: true })).toBeVisible();
  const stoppedAt = await invitedCount(panel);
  await expect(share.getByText(/\d+ left/)).toBeVisible();
  await close(panel);
  await panel.waitForTimeout(1_500);
  await panel.goto(url);
  await expect(share.getByText('Stopped', { exact: true })).toBeVisible();
  // Nothing was sent after Stop, even though the popup was closed for a while.
  expect(await invitedCount(panel)).toBe(stoppedAt);
  await expect(share.getByText(/\d+ left/)).toBeVisible();

  // Resume finishes it.
  await share.getByRole('button', { name: 'Resume' }).click();
  await expect(share.getByText('Share finished: 4 invited')).toBeVisible({ timeout: 30_000 });
  await expect(share.getByText('Done', { exact: true })).toBeVisible();
  await expect(share.getByRole('button', { name: 'Stop' })).toHaveCount(0);
});

test('a run that finishes while the popup is closed shows as done when it reopens', async ({ panel }) => {
  const share = panel.getByRole('tabpanel', { name: 'Share' });
  await share.getByLabel('List name').fill('Finishing team');
  await share.getByLabel('Email addresses').fill('ana@example.com\nbo@example.com');
  await share.getByLabel(/Artifacts/).fill('https://claude.ai/artifact/ClosedMidRunArtifact02');
  await share.getByRole('button', { name: /^Preview/ }).click();
  await share.getByRole('button', { name: 'Send 2 invitations' }).click();
  await answer(share, 'Send');
  await expect(share.getByText('Running', { exact: true })).toBeVisible();

  const url = await close(panel);
  await panel.waitForTimeout(4_000);
  await panel.goto(url);
  await expect(share.getByText('Share finished: 2 invited')).toBeVisible();
  await expect(share.getByText('Done', { exact: true })).toBeVisible();
  await expect(share.getByRole('button', { name: 'Start a new share' })).toBeVisible();
});
