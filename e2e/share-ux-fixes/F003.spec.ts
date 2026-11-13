import { expect, test } from '../fixtures';

// F003: + Current tab adds the artifact open in a claude.ai/cowork tab, and opening the panel on
// such a tab fills it in.
const COWORK =
  'https://claude.ai/cowork/cse_01ExampleCoworkSession00?artifact=c0ffee00-1234-4abc-8def-000000000001#example';
const ARTIFACT = 'https://claude.ai/artifact/QqHHsBLXBfYKJD5NqJ8PeY';

test('the panel and + Current tab pick up the artifact open in a cowork tab', async ({ context, panel }) => {
  // Serve the page ourselves: nothing may reach claude.ai.
  await context.route('https://claude.ai/**', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<title>cowork</title>' }),
  );
  const cowork = await context.newPage();
  await cowork.goto(COWORK);
  // The panel reads the active tab, and clicking a page in Playwright doesn't switch tabs.
  await cowork.bringToFront();
  await panel.reload();

  await panel.getByRole('tab', { name: 'Share' }).click();
  const share = panel.getByRole('tabpanel', { name: 'Share' });
  const artifacts = share.getByLabel(/Artifacts/);
  const error = share.locator('.err');

  // Opening the panel fills Artifacts in.
  await expect(artifacts).toHaveValue(ARTIFACT);

  // + Current tab adds it once, without an error.
  await artifacts.fill('');
  await share.getByRole('button', { name: 'Current tab' }).click();
  await expect(artifacts).toHaveValue(ARTIFACT);
  await expect(error).toHaveCount(0);

  // A second click doesn't add it twice.
  await share.getByRole('button', { name: 'Current tab' }).click();
  // The click handler awaits chrome.tabs.query before it changes the text, so assertions made
  // right away would pass against the old value. A query of our own is answered after the
  // handler's, and the extra paint gives React time to render what the handler set.
  await panel.evaluate(() => chrome.tabs.query({ active: true, lastFocusedWindow: true }));
  await panel.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => resolve(null))));
  // The raw text, not the count: the count de-duplicates and would hide a doubled link.
  expect(await artifacts.inputValue()).toBe(ARTIFACT);
  await expect(error).toHaveCount(0);
});
