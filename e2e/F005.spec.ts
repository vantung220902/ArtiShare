import type { Page } from '@playwright/test';
import { answer, expect, test } from './fixtures';

// F005: closing the popup doesn't lose the Share form. Closing is simulated by reloading the
// popup page, which throws away all of its state just as a real close does.

const ONE = 'https://claude.ai/artifact/DraftArtifactOne001';
const TWO = 'https://claude.ai/artifact/DraftArtifactTwo002';

async function setUp(panel: Page) {
  const made: Record<string, string> = { 'Alpha team': 'ana@example.com', 'Beta team': 'bo@example.com' };
  for (const [name, emails] of Object.entries(made)) {
    // A reload closes the list just saved; its form stays in the DOM, so match only the visible one.
    await panel.reload();
    await panel.getByRole('tab', { name: /Lists/ }).click();
    const lists = panel.getByRole('tabpanel', { name: /Lists/ });
    await lists.getByRole('button', { name: 'New list' }).click();
    await lists.getByLabel('List name').filter({ visible: true }).fill(name);
    await lists.getByLabel('Email addresses').filter({ visible: true }).fill(emails);
    await lists.getByRole('button', { name: 'Save list' }).click();
    await expect(lists.locator('summary', { hasText: name })).toBeVisible();
  }
  const lists = panel.getByRole('tabpanel', { name: /Lists/ });
  await lists.getByLabel('Only these').check();
  const defaultAlpha = lists.locator('label.choice', { hasText: 'Alpha team' }).getByRole('checkbox');
  await defaultAlpha.click();
  await expect(defaultAlpha).toBeChecked();
  await panel.getByRole('tab', { name: 'Share' }).click();
}

/** What the form last saved, read from session storage. */
const storedDraft = (panel: Page) =>
  panel.evaluate(
    async () =>
      (await chrome.storage.session.get('shareDraft')).shareDraft as
        { artifactText: string; selected: string[] } | undefined,
  );

const boxes = (panel: Page) => {
  const share = panel.getByRole('tabpanel', { name: 'Share' });

  return {
    share,
    artifacts: share.getByLabel(/Artifacts/),
    alpha: share.locator('label.pick', { hasText: 'Alpha team' }).getByRole('checkbox'),
    beta: share.locator('label.pick', { hasText: 'Beta team' }).getByRole('checkbox'),
  };
};

test('the artifacts typed and the lists ticked come back when the popup reopens', async ({ panel }) => {
  await setUp(panel);
  const { share, artifacts, alpha, beta } = boxes(panel);
  await expect(alpha).toBeChecked();
  await expect(beta).not.toBeChecked();

  await artifacts.fill(`${ONE}\n${TWO}`);
  await alpha.uncheck();
  await beta.check();
  // The draft is written by an effect after the change; wait for it rather than sleeping.
  await expect.poll(async () => (await storedDraft(panel))?.artifactText).toContain(TWO);
  await expect.poll(async () => (await storedDraft(panel))?.selected.length).toBe(1);

  await panel.reload();

  await expect(artifacts).toHaveValue(`${ONE}\n${TWO}`);
  await expect(alpha).not.toBeChecked();
  await expect(beta).toBeChecked();
  await expect(panel.getByRole('tab', { name: 'Share' })).toHaveAttribute('aria-selected', 'true');
  await expect(share).toBeVisible();

  // Unticking everything is a choice too, not a reason to fall back to the defaults.
  await beta.uncheck();
  await expect.poll(async () => (await storedDraft(panel))?.selected).toEqual([]);
  await panel.reload();
  await expect(artifacts).toHaveValue(`${ONE}\n${TWO}`);
  await expect(alpha).not.toBeChecked();
  await expect(beta).not.toBeChecked();
});

test('a list deleted since the draft was saved is not ticked on reopening', async ({ panel }) => {
  await setUp(panel);
  const { artifacts, alpha, beta } = boxes(panel);
  await beta.check();
  await artifacts.fill(ONE);
  await expect.poll(async () => (await storedDraft(panel))?.selected.length).toBe(2);

  await panel.getByRole('tab', { name: /Lists/ }).click();
  const lists = panel.getByRole('tabpanel', { name: /Lists/ });
  await lists.locator('summary', { hasText: 'Beta team' }).click();
  await lists.getByRole('button', { name: 'Delete' }).click();
  await answer(panel, 'Delete');
  await expect(lists.locator('summary', { hasText: 'Beta team' })).toHaveCount(0);

  await panel.reload();
  // The popup reopens on the tab it was closed on, which is Lists here.
  await panel.getByRole('tab', { name: 'Share' }).click();
  await expect(artifacts).toHaveValue(ONE);
  await expect(alpha).toBeChecked();
  await expect(beta).toHaveCount(0);
});

test('after a run starts, the next form is empty with the defaults ticked, and stays so across a reopen', async ({
  panel,
}) => {
  await setUp(panel);
  const { share, artifacts, alpha, beta } = boxes(panel);
  await beta.check();
  await artifacts.fill(ONE);

  await panel.reload();
  await expect(artifacts).toHaveValue(ONE);
  await expect(beta).toBeChecked();

  await share.getByRole('button', { name: /^Preview/ }).click();
  await share.getByRole('button', { name: /^Send \d+ invitations?$/ }).click();
  await answer(panel, 'Send');
  await expect(share.getByText('Done', { exact: true })).toBeVisible({ timeout: 20_000 });

  await share.getByRole('button', { name: 'Start a new share' }).click();
  await expect(artifacts).toHaveValue('');
  await expect(alpha).toBeChecked();
  await expect(beta).not.toBeChecked();

  await panel.reload();
  await expect(artifacts).toBeVisible();
  await expect(artifacts).toHaveValue('');
  await expect(alpha).toBeChecked();
  await expect(beta).not.toBeChecked();
});

test('a reopened form with no typing in it still follows a changed default selection', async ({ panel }) => {
  await setUp(panel);
  const { artifacts, alpha, beta } = boxes(panel);
  await expect(artifacts).toHaveValue('');
  await panel.reload();
  await expect(alpha).toBeChecked();

  // Change the default to Beta only, then reopen.
  await panel.getByRole('tab', { name: /Lists/ }).click();
  const lists = panel.getByRole('tabpanel', { name: /Lists/ });
  // The boxes are controlled by the saved config, so wait for each save before the next click.
  const defaultBeta = lists.locator('label.choice', { hasText: 'Beta team' }).getByRole('checkbox');
  const defaultAlpha = lists.locator('label.choice', { hasText: 'Alpha team' }).getByRole('checkbox');
  await defaultBeta.click();
  await expect(defaultBeta).toBeChecked();
  await defaultAlpha.click();
  await expect(defaultAlpha).not.toBeChecked();
  await panel.reload();
  // The popup reopens on the Lists tab, where it was closed.
  await panel.getByRole('tab', { name: 'Share' }).click();
  await expect(beta).toBeChecked();
  await expect(alpha).not.toBeChecked();
});

test('a restored draft is not overwritten by the artifact in the tab the popup opens over', async ({
  context,
  panel,
}) => {
  // Serve the page ourselves: nothing may reach claude.ai.
  await context.route(/^https:\/\/claude\.ai\//, (route) =>
    route.fulfill({ contentType: 'text/html', body: '<title>page</title>' }),
  );
  const { artifacts } = boxes(panel);
  await artifacts.fill(ONE);
  await expect.poll(async () => (await storedDraft(panel))?.artifactText).toBe(ONE);

  const tab = await context.newPage();
  await tab.goto('https://claude.ai/artifact/TabArtifactNotTheDraft01');
  await tab.bringToFront();
  await panel.reload();

  // The prefill runs on every open but only fills an empty box. Wait for the tab query to have
  // been answered and painted before reading the raw text.
  await panel.evaluate(() => chrome.tabs.query({ active: true, lastFocusedWindow: true }));
  await panel.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => resolve(null))));
  await expect(artifacts).toHaveValue(ONE);
});
