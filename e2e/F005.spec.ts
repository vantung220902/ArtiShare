import { expect, test } from './fixtures';

// F005: a 0.3.0 Share draft (only the box, no rows) and links typed but not yet added carry over
// into the Artifacts rows.

const ONE = 'https://claude.ai/artifact/ExampleArtifactOne01';
const TWO = 'https://claude.ai/artifact/ExampleArtifactTwo02';
const THREE = 'https://claude.ai/artifact/ExampleArtifactThree3';

test.beforeEach(async ({ context }) => {
  // Serve the pages ourselves: nothing may reach claude.ai or anywhere else.
  await context.route(/^https:\/\/(claude\.ai|example\.com)\//, (route) =>
    route.fulfill({ contentType: 'text/html', body: '<title>page</title>' }),
  );
});

test('a 0.3.0 draft, typed links and an empty form carry over into the rows', async ({ context, panel }) => {
  const share = panel.getByRole('tabpanel', { name: 'Share' });
  const box = share.getByRole('textbox', { name: /Artifacts/ });
  const rows = share.locator('.artifact-item');
  // Closing and reopening the popup: it comes back on the tab it was closed on, here Lists.
  const reopen = async () => {
    await panel.reload();
    await panel.getByRole('tab', { name: 'Share' }).click();
  };

  // A list to tick for the previews.
  await panel.getByRole('tab', { name: /Lists/ }).click();
  const lists = panel.getByRole('tabpanel', { name: /Lists/ });
  await lists.getByRole('button', { name: 'New list' }).click();
  await lists.getByLabel('List name').fill('Carry team');
  await lists.getByLabel('Email addresses').fill('ana@example.com');
  await lists.getByRole('button', { name: 'Save list' }).click();
  await expect(lists.locator('summary', { hasText: 'Carry team' })).toBeVisible();
  const listId = await panel.evaluate(
    async () =>
      ((await chrome.storage.local.get('config')).config as { lists: { id: string }[] }).lists[0]?.id ?? '',
  );

  // The popup opens over a page that isn't claude.ai, so only the draft decides the rows.
  const other = await context.newPage();
  await other.goto('https://example.com/some/page');
  await other.bringToFront();

  // 1. A 0.3.0 draft: the box held the links and the line that wasn't one. It has no `artifacts`.
  await panel.evaluate(
    ([one, two, id]) =>
      chrome.storage.session.set({
        shareDraft: { artifactText: `${one}\nnot a link\n${two}`, selected: [id] },
      }),
    [ONE, TWO, listId],
  );
  await reopen();
  await expect(rows).toHaveText([ONE, TWO]);
  await expect(box).toHaveValue('not a link');
  await expect(share.locator('.hint.err')).toHaveText('Not artifact links: not a link');
  await expect(share.locator('label[for="artifacts"] .count')).toHaveText('2');

  // 2. A link typed without Enter already counts for the Preview, which includes it. Typing replaces
  // "not a link", which would otherwise stop the Preview.
  await box.fill(THREE);
  await expect(share.getByRole('button', { name: 'Preview 1 person × 3 artifacts' })).toBeVisible();
  await share.getByRole('button', { name: 'Preview 1 person × 3 artifacts' }).click();
  await expect(share.locator('.artifact-row a.artifact-link')).toHaveText(
    [ONE, TWO, THREE].map((url) => url.replace('https://', '')),
  );
  await share.getByRole('button', { name: 'Back' }).click();

  // 3. The same typed link survives the popup closing.
  await expect(box).toHaveValue(THREE);
  await expect
    .poll(() =>
      panel.evaluate(
        async () =>
          ((await chrome.storage.session.get('shareDraft')).shareDraft as { artifactText: string })
            .artifactText,
      ),
    )
    .toBe(THREE);
  await reopen();
  await expect(box).toHaveValue(THREE);
  await expect(rows).toHaveText([ONE, TWO]);
  await expect(share.getByRole('button', { name: 'Preview 1 person × 3 artifacts' })).toBeVisible();

  // 4. No rows and no text: Preview asks for an artifact.
  await panel.evaluate(() => chrome.storage.session.remove('shareDraft'));
  await reopen();
  await expect(rows).toHaveCount(0);
  await expect(box).toHaveValue('');
  await share.locator('label.pick', { hasText: 'Carry team' }).getByRole('checkbox').check();
  await share.getByRole('button', { name: /^Preview/ }).click();
  await expect(share.getByText('Add at least one artifact.')).toBeVisible();
});
