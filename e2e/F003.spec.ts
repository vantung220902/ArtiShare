import { expect, test } from './fixtures';
import { openRealPopup } from './realPopup';

// F003: the popup picks up the artifact in the tab it was opened over, and + Current tab adds it.
const COWORK =
  'https://claude.ai/cowork/cse_01ExampleCoworkSession00?artifact=c0ffee00-1234-4abc-8def-000000000001#example';
const ARTIFACT = 'https://claude.ai/artifact/QqHHsBLXBfYKJD5NqJ8PeY';

test.beforeEach(async ({ context }) => {
  // Serve the pages ourselves: nothing may reach claude.ai or anywhere else.
  await context.route(/^https:\/\/(claude\.ai|example\.com)\//, (route) =>
    route.fulfill({ contentType: 'text/html', body: '<title>page</title>' }),
  );
});

test('opening over an artifact tab fills Artifacts, and + Current tab adds it once', async ({
  context,
  panel,
}) => {
  const cowork = await context.newPage();
  await cowork.goto(COWORK);
  // The popup reads the active tab, and clicking a page in Playwright doesn't switch tabs.
  await cowork.bringToFront();
  await panel.reload();

  const share = panel.getByRole('tabpanel', { name: 'Share' });
  const artifacts = share.getByLabel(/Artifacts/);
  const error = share.locator('.err, p.alert');

  await expect(artifacts).toHaveValue(ARTIFACT);

  await artifacts.fill('');
  await share.getByRole('button', { name: 'Current tab' }).click();
  await expect(artifacts).toHaveValue(ARTIFACT);
  await expect(error).toHaveCount(0);

  // A second click doesn't add it twice. The handler awaits chrome.tabs.query before changing the
  // text, so query ourselves (answered after the handler's) and let React paint before reading it.
  await share.getByRole('button', { name: 'Current tab' }).click();
  await panel.evaluate(() => chrome.tabs.query({ active: true, lastFocusedWindow: true }));
  await panel.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => resolve(null))));
  // The raw text, not the count: the count de-duplicates and would hide a doubled link.
  expect(await artifacts.inputValue()).toBe(ARTIFACT);
  await expect(error).toHaveCount(0);
});

test('opening over a page that is not an artifact leaves Artifacts empty, and + Current tab says so', async ({
  context,
  panel,
}) => {
  const other = await context.newPage();
  await other.goto('https://example.com/some/page');
  await other.bringToFront();
  await panel.reload();

  const share = panel.getByRole('tabpanel', { name: 'Share' });
  const artifacts = share.getByLabel(/Artifacts/);
  const alert = share.locator('p.alert');

  await expect(artifacts).toHaveValue('');
  await expect(alert).toHaveCount(0);

  await share.getByRole('button', { name: 'Current tab' }).click();
  await expect(alert).toHaveText('The current tab is not a claude.ai artifact.');
  expect(await artifacts.inputValue()).toBe('');
});

test('a claude.ai page that is not an artifact (the home page) is not picked up either', async ({
  context,
  panel,
}) => {
  const home = await context.newPage();
  await home.goto('https://claude.ai/new');
  await home.bringToFront();
  await panel.reload();

  const share = panel.getByRole('tabpanel', { name: 'Share' });
  await expect(share.getByLabel(/Artifacts/)).toHaveValue('');
  await share.getByRole('button', { name: 'Current tab' }).click();
  await expect(share.locator('p.alert')).toHaveText('The current tab is not a claude.ai artifact.');
});

// The popup page opened as a tab always has some other tab active; the real action popup is what
// users get, so check it too: it must see the tab it was opened over.
test('the real action popup, opened over an artifact tab, has Artifacts filled in', async ({
  context,
  panel,
}) => {
  // The panel tab is popup.html too; move it off so the only popup.html target is the real popup.
  await panel.goto('about:blank');
  const cowork = await context.newPage();
  await cowork.goto(COWORK);
  await cowork.bringToFront();
  const evaluate = await openRealPopup(context);

  await expect.poll(() => evaluate(`document.getElementById('artifacts')?.value ?? null`)).toBe(ARTIFACT);

  // + Current tab in the real popup adds nothing more and shows no error.
  await evaluate(
    `[...document.querySelectorAll('button')].find((b) => /Current tab/.test(b.textContent))?.click()`,
  );
  // As above: a tab query of our own is answered after the handler's, then let React paint.
  await evaluate(`chrome.tabs.query({ active: true, lastFocusedWindow: true }).then(
    () => new Promise((resolve) => requestAnimationFrame(() => resolve(null))),
  )`);
  expect(await evaluate(`document.getElementById('artifacts').value`)).toBe(ARTIFACT);
  expect(await evaluate(`document.querySelectorAll('p.alert, .hint.err').length`)).toBe(0);
});
