import type { Locator, Page } from '@playwright/test';
import { expect, test } from './fixtures';

// F001: Artifacts shows each artifact as its own row with a Remove (×) button, and links can still
// be pasted in any number.

const ONE = 'https://claude.ai/artifact/ExampleArtifactOne01';
const TWO = 'https://claude.ai/artifact/ExampleArtifactTwo02';
const THREE = 'https://claude.ai/artifact/ExampleArtifactThree3';
const COWORK =
  'https://claude.ai/cowork/cse_01ExampleCoworkSession00?artifact=c0ffee00-1234-4abc-8def-000000000001#example';
const COWORK_AS_ARTIFACT = 'https://claude.ai/artifact/QqHHsBLXBfYKJD5NqJ8PeY';
// Far wider than the 380px popup, to see it cut off, with an id at the 64-character limit.
const LONG = `https://claude.ai/artifact/${'LongExampleArtifact04'.repeat(3)}X`;

/** A real paste: copy the text from a scratch field, then paste it into the box with the keyboard. */
async function paste(panel: Page, box: Locator, text: string) {
  await panel.evaluate((value) => {
    const scratch = document.createElement('textarea');
    scratch.id = 'copy-probe';
    scratch.value = value;
    document.body.append(scratch);
    scratch.select();
  }, text);
  await panel.keyboard.press('ControlOrMeta+C');
  await panel.locator('#copy-probe').evaluate((el) => el.remove());
  await box.focus();
  await panel.keyboard.press('ControlOrMeta+V');
}

test('pasted, typed and entered links become rows, each with its own Remove button', async ({
  context,
  panel,
}) => {
  // Serve the pages ourselves: nothing may reach claude.ai or anywhere else.
  await context.route(/^https:\/\/(claude\.ai|example\.com)\//, (route) =>
    route.fulfill({ contentType: 'text/html', body: '<title>page</title>' }),
  );

  // A list to tick for the Preview at the end.
  await panel.getByRole('tab', { name: /Lists/ }).click();
  const lists = panel.getByRole('tabpanel', { name: /Lists/ });
  await lists.getByRole('button', { name: 'New list' }).click();
  await lists.getByLabel('List name').fill('Rows team');
  await lists.getByLabel('Email addresses').fill('ana@example.com');
  await lists.getByRole('button', { name: 'Save list' }).click();
  await expect(lists.locator('summary', { hasText: 'Rows team' })).toBeVisible();

  // 1. Opened over a page that is not claude.ai, with nothing in Artifacts.
  const other = await context.newPage();
  await other.goto('https://example.com/some/page');
  await other.bringToFront();
  await panel.reload();
  // It reopens on Lists, where it was closed.
  await panel.getByRole('tab', { name: 'Share' }).click();

  const share = panel.getByRole('tabpanel', { name: 'Share' });
  const box = share.getByRole('textbox', { name: /Artifacts/ });
  const rows = share.locator('.artifact-item');
  const count = share.locator('label[for="artifacts"] .count');
  const notLinks = share.locator('.hint.err');
  const already = share.getByText('Already in the list');

  await expect(
    share.getByText('No artifacts yet. Open one and click + Current tab, or paste links below.'),
  ).toBeVisible();
  await expect(box).toBeVisible();
  await expect(box).toHaveAttribute('placeholder', 'Paste artifact links (one per line)');
  await expect(box).toHaveAttribute('aria-required', 'true');
  await expect(rows).toHaveCount(0);
  await expect(count).toHaveCount(0);

  // Pasting needs the panel to be the focused page.
  await panel.bringToFront();

  // 2. Three links pasted at once become three rows at once, the cowork link normalized.
  await paste(panel, box, `${ONE}\n${COWORK}\n${TWO}`);
  await expect(rows).toHaveText([ONE, COWORK_AS_ARTIFACT, TWO]);
  await expect(count).toHaveText('3');
  await expect(box).toHaveValue('');
  await expect(share.getByText(/^No artifacts yet/)).toHaveCount(0);
  // Once there are rows, the box itself isn't required any more.
  await expect(box).toHaveAttribute('aria-required', 'false');

  // 3. Typed, then Enter.
  await box.pressSequentially(THREE);
  await box.press('Enter');
  await expect(rows).toHaveText([ONE, COWORK_AS_ARTIFACT, TWO, THREE]);
  await expect(count).toHaveText('4');
  await expect(box).toHaveValue('');

  // 4. What isn't a link stays in the box, with a warning; the link beside it is added.
  await paste(panel, box, `not a link\n${LONG}`);
  await expect(rows).toHaveText([ONE, COWORK_AS_ARTIFACT, TWO, THREE, LONG]);
  await expect(box).toHaveValue('not a link');
  await expect(notLinks).toHaveText('Not artifact links: not a link');

  // 5. A link already in the list isn't added again: its row is highlighted for a moment. Pasted
  // with 'not a link' still in the box, it isn't glued onto that text either.
  await paste(panel, box, ONE);
  await expect(rows).toHaveCount(5);
  await expect(count).toHaveText('5');
  await expect(box).toHaveValue('not a link');
  await expect(notLinks).toHaveText('Not artifact links: not a link');
  await expect(already).toBeVisible();
  await expect(rows.first()).toHaveClass(/repeated/);
  await expect(rows.nth(1)).not.toHaveClass(/repeated/);
  // Briefly: it goes by itself.
  await expect(rows.first()).not.toHaveClass(/repeated/);
  await expect(already).toHaveCount(0);

  // 6. Each row: its link on one line, cut off when long, the full link in a tooltip, and a ×.
  for (const url of [ONE, COWORK_AS_ARTIFACT, TWO, THREE, LONG]) {
    const row = rows.filter({ hasText: url });
    await expect(row.locator('.truncate')).toHaveAttribute('title', url);
    await expect(row.getByRole('button', { name: `Remove ${url}`, exact: true })).toBeVisible();
  }
  const link = rows.filter({ hasText: LONG }).locator('.truncate');
  const shown = await link.evaluate((el) => {
    const style = getComputedStyle(el);
    return {
      whiteSpace: style.whiteSpace,
      textOverflow: style.textOverflow,
      cutOff: el.scrollWidth > el.clientWidth,
    };
  });
  expect(shown).toEqual({ whiteSpace: 'nowrap', textOverflow: 'ellipsis', cutOff: true });
  // One line high, like a short row, and nothing scrolls sideways.
  const height = async (url: string) => (await rows.filter({ hasText: url }).boundingBox())!.height;
  expect(await height(LONG)).toBe(await height(ONE));
  const sideways = await panel.evaluate(() => {
    const body = document.querySelector('.popup-body')!;
    return body.scrollWidth - body.clientWidth;
  });
  expect(sideways).toBe(0);

  // × takes the row out and leaves the others in order.
  await share.getByRole('button', { name: `Remove ${THREE}`, exact: true }).click();
  await expect(rows).toHaveText([ONE, COWORK_AS_ARTIFACT, TWO, LONG]);
  await expect(count).toHaveText('4');

  // 7. The Preview shows the same artifacts, in the same order as the rows. What isn't a link would
  // stop it, so clear that first.
  await box.fill('');
  await expect(notLinks).toHaveCount(0);
  await share.locator('label.pick', { hasText: 'Rows team' }).getByRole('checkbox').check();
  await share.getByRole('button', { name: 'Preview 1 person × 4 artifacts' }).click();
  await expect(share.locator('.artifact-row a.artifact-link')).toHaveText(
    [ONE, COWORK_AS_ARTIFACT, TWO, LONG].map((url) => url.replace('https://', '')),
  );
});
