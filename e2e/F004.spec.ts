import { expect, test } from './fixtures';

// F004: + Current tab on a cowork session with no artifact open explains why nothing was added.
const SESSION = 'https://claude.ai/cowork/cse_01DaqAfCToHd3TK71TZvnXNn';
const TYPED = 'https://claude.ai/artifact/VhbnVTrGFVnm271Ufg8VcW';

test('+ Current tab on a cowork session without an artifact says so and adds nothing', async ({
  context,
  panel,
}) => {
  // Serve the page ourselves: nothing may reach claude.ai.
  await context.route('https://claude.ai/**', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<title>cowork</title>' }),
  );
  const cowork = await context.newPage();
  await cowork.goto(SESSION);
  // The panel reads the active tab, and clicking a page in Playwright doesn't switch tabs.
  await cowork.bringToFront();
  await panel.reload();

  await panel.getByRole('tab', { name: 'Share' }).click();
  const share = panel.getByRole('tabpanel', { name: 'Share' });
  const artifacts = share.getByLabel(/Artifacts/);
  const alert = share.locator('p.alert');

  // Opening the panel on a session with no artifact leaves Artifacts empty.
  await expect(artifacts).toHaveValue('');
  await expect(alert).toHaveCount(0);

  await artifacts.fill(TYPED);
  await share.getByRole('button', { name: 'Current tab' }).click();

  // The error only appears once the handler has asked for the tab, so by then the text had its
  // chance to change.
  await expect(alert).toHaveText('The current tab is not a claude.ai artifact.');
  expect(await artifacts.inputValue()).toBe(TYPED);
});
