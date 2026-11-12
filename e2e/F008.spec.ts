import type { Page } from '@playwright/test';
import { answer, expect, test } from './fixtures';

// F008: closing the popup doesn't lose a preview, even one still loading. Closing is simulated by
// reloading the popup page, which throws away all of its state just as a real close does.

const ONE = 'https://claude.ai/artifact/PreviewArtifactOne01';
const TWO = 'https://claude.ai/artifact/PreviewArtifactTwo02';

async function setUp(panel: Page) {
  await panel.getByRole('tab', { name: /Lists/ }).click();
  const lists = panel.getByRole('tabpanel', { name: /Lists/ });
  await lists.getByRole('button', { name: 'New list' }).click();
  await lists.getByLabel('List name').filter({ visible: true }).fill('Preview team');
  await lists.getByLabel('Email addresses').filter({ visible: true }).fill('ana@example.com\nbo@example.com');
  await lists.getByRole('button', { name: 'Save list' }).click();
  await expect(lists.locator('summary', { hasText: 'Preview team' })).toBeVisible();
  await panel.getByRole('tab', { name: 'Share' }).click();

  const share = panel.getByRole('tabpanel', { name: 'Share' });
  await share.getByLabel(/Artifacts/).fill(`${ONE}\n${TWO}`);
  const pick = share.locator('label.pick', { hasText: 'Preview team' }).getByRole('checkbox');
  await pick.check();
  // The form is saved by an effect after the change; wait for it rather than sleeping.
  await expect
    .poll(() =>
      panel.evaluate(
        async () =>
          (
            (await chrome.storage.session.get('shareDraft')).shareDraft as
              { artifactText: string; selected: string[] } | undefined
          )?.selected.length,
      ),
    )
    .toBe(1);

  return { share, pick, artifacts: share.getByLabel(/Artifacts/) };
}

/** The preview as last saved, read from session storage. */
const storedPreview = (panel: Page) =>
  panel.evaluate(
    async () =>
      (
        (await chrome.storage.session.get('popupState')).popupState as
          { preview?: { results: unknown[] | null } | null } | undefined
      )?.preview ?? null,
  );

test('a preview survives the popup closing, whether it is loading or loaded', async ({ panel }) => {
  const { share, pick, artifacts } = await setUp(panel);

  await share.getByRole('button', { name: /^Preview/ }).click();
  // The preview is saved the moment it starts, before any answer; closing now is closing mid-load.
  await expect.poll(async () => (await storedPreview(panel))?.results).toBeNull();
  expect(await storedPreview(panel)).not.toBeNull();
  await panel.reload();

  // Reopened: the preview, not the blank form, and it finishes by itself.
  await expect(share.getByRole('button', { name: 'Back' })).toBeVisible();
  await expect(artifacts).toHaveCount(0);
  await expect(share.getByText('Sending as owner@example.com')).toBeVisible();
  const cards = share.locator('.artifact-row');
  await expect(cards).toHaveCount(2);
  await expect(share.getByText('to invite')).toHaveCount(2);
  await expect(share.getByText('already invited')).toHaveCount(2);
  await expect(share.getByText('Preview team').first()).toBeVisible();
  await expect(share.getByRole('button', { name: 'Send 4 invitations' })).toBeEnabled();

  // Closed again, now with results: the same preview, Back and Send included.
  await expect.poll(async () => (await storedPreview(panel))?.results?.length).toBe(2);
  await panel.reload();
  await expect(cards).toHaveCount(2);
  await expect(share.getByText('to invite')).toHaveCount(2);
  await expect(share.getByRole('button', { name: 'Send 4 invitations' })).toBeEnabled();
  await expect(artifacts).toHaveCount(0);

  // Back returns to the form as it was.
  await share.getByRole('button', { name: 'Back' }).click();
  await expect(artifacts).toHaveValue(`${ONE}\n${TWO}`);
  await expect(pick).toBeChecked();
  await expect.poll(() => storedPreview(panel)).toBeNull();

  // And a later reopening shows the form, not the preview.
  await panel.reload();
  await expect(artifacts).toHaveValue(`${ONE}\n${TWO}`);
  await expect(pick).toBeChecked();
  await expect(share.getByRole('button', { name: 'Back' })).toHaveCount(0);
  await expect(share.getByRole('button', { name: /^Preview/ })).toBeVisible();
});

test('Back while the preview is still loading goes to the form and stays there', async ({ panel }) => {
  const { share, artifacts } = await setUp(panel);

  await share.getByRole('button', { name: /^Preview/ }).click();
  await share.getByRole('button', { name: 'Back' }).click();
  await expect(artifacts).toHaveValue(`${ONE}\n${TWO}`);

  // The answer that arrives late must not bring the preview back.
  await panel.waitForTimeout(1_000);
  await expect(artifacts).toBeVisible();
  await expect(share.getByRole('button', { name: 'Back' })).toHaveCount(0);
  expect(await storedPreview(panel)).toBeNull();
});

test('sending from a restored preview starts a run, and a new share is not that preview', async ({
  panel,
}) => {
  const { share, artifacts } = await setUp(panel);

  await share.getByRole('button', { name: /^Preview/ }).click();
  await panel.reload();
  await share.getByRole('button', { name: 'Send 4 invitations' }).click();
  await answer(share, 'Send');
  await expect(share.getByText('Done', { exact: true })).toBeVisible({ timeout: 30_000 });

  // The finished run ends with a fresh form: the old preview is gone with the run.
  await share.getByRole('button', { name: 'Start a new share' }).click();
  await expect(artifacts).toHaveValue('');
  expect(await storedPreview(panel)).toBeNull();
  await panel.reload();
  await expect(artifacts).toHaveValue('');
  await expect(share.getByRole('button', { name: 'Back' })).toHaveCount(0);
});
