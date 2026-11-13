import { expect, test } from '../fixtures';

// F003: + Current tab adds the artifact open in a claude.ai/cowork tab, and opening the panel on
// such a tab adds it.
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
  const rows = share.locator('.artifact-item');
  const error = share.locator('.err');

  // Opening the panel adds it to Artifacts.
  await expect(rows).toHaveText([ARTIFACT]);

  // + Current tab adds it once, without an error.
  await share.getByRole('button', { name: `Remove ${ARTIFACT}` }).click();
  await expect(rows).toHaveCount(0);
  await share.getByRole('button', { name: 'Current tab' }).click();
  await expect(rows).toHaveText([ARTIFACT]);
  await expect(error).toHaveCount(0);

  // A second click doesn't add it twice.
  await share.getByRole('button', { name: 'Current tab' }).click();
  // The click handler awaits chrome.tabs.query before it changes the rows, so assertions made
  // right away would pass against the old value. A query of our own is answered after the
  // handler's, and the extra paint gives React time to render what the handler set.
  await panel.evaluate(() => chrome.tabs.query({ active: true, lastFocusedWindow: true }));
  await panel.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => resolve(null))));
  await expect(rows).toHaveText([ARTIFACT]);
  expect(await artifacts.inputValue()).toBe('');
  await expect(error).toHaveCount(0);
});
