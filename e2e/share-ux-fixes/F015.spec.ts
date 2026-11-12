import { answer, expect, test } from '../fixtures';

// F015: a finished run says so, and offers one obvious primary 'Start a new share' button.
test('a finished run shows a finished message and one primary Start a new share button', async ({
  panel,
}) => {
  const share = panel.getByRole('tabpanel', { name: 'Share' });
  await share.getByLabel('List name').fill('Finish team');
  await share.getByLabel('Email addresses').fill('ana@example.com\nfail@example.com');
  await share.getByLabel(/Artifacts/).fill('https://claude.ai/artifact/FinishArtifact0001');
  await share.getByRole('button', { name: /^Preview/ }).click();
  await share.getByRole('button', { name: 'Send 2 invitations' }).click();
  await answer(share, 'Send');
  await expect(share.getByText('Done', { exact: true })).toBeVisible({ timeout: 20_000 });

  const card = share.locator('section.card').first();
  const finished = card.getByRole('status');
  await expect(finished).toHaveText('Share finished: 1 invited, 1 failed');
  // The message is the first thing in the card.
  await expect(card.locator(':scope > *').first()).toHaveText(/^Share finished/);

  // One primary, full-width button; nothing else in the card competes with it.
  const start = card.getByRole('button', { name: 'Start a new share' });
  await expect(start).toHaveClass(/primary/);
  await expect(card.getByRole('button')).toHaveCount(1);
  const cardBox = await card.boundingBox();
  const buttonBox = await start.boundingBox();
  expect(buttonBox!.width).toBeGreaterThan(cardBox!.width - 40);
  // Filled, not the plain grey of a secondary button.
  const background = await start.evaluate((el) => getComputedStyle(el).backgroundColor);
  const secondary = await panel.evaluate(() => {
    const probe = document.createElement('button');
    document.body.append(probe);
    const colour = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return colour;
  });
  expect(background).not.toBe(secondary);

  // The finished view survives a reload.
  await panel.reload();
  const reloaded = panel.getByRole('tabpanel', { name: 'Share' });
  await expect(reloaded.getByRole('status')).toHaveText('Share finished: 1 invited, 1 failed');
  await expect(reloaded.getByRole('button', { name: 'Start a new share' })).toHaveClass(/primary/);
});
