import type { BrowserContext, Page } from '@playwright/test';
import { answer, expect, test } from '../fixtures';

// F012: moving between the popup and the side panel keeps the work. Both pages read the same
// storage, so the work is what was last written there. A real toolbar click can't be made from
// Playwright: the switch is the icon's click, which closes the page it was clicked in, and the
// other surface is a fresh page of the other file, as the browser would open it.

const ONE = 'https://claude.ai/artifact/SwitchArtifactOne01';
const TWO = 'https://claude.ai/artifact/SwitchArtifactTwo02';

async function open(context: BrowserContext, extensionId: string, file: 'popup' | 'sidepanel') {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/${file}.html`);
  await expect(page.getByRole('heading', { name: 'ArtiShare' })).toBeVisible();

  return page;
}

/** Clicks the header icon of the surface `from` is on, and waits for that page to close. */
async function switchFrom(from: Page, label: 'Open in side panel' | 'Use popup instead') {
  const closed = from.waitForEvent('close');
  await from.getByRole('button', { name: label }).click();
  await closed;
}

const share = (page: Page) => page.getByRole('tabpanel', { name: 'Share' });
const lists = (page: Page) => page.getByRole('tabpanel', { name: /Lists/ });
const tickFor = (page: Page, name: string) =>
  share(page).locator('label.pick', { hasText: name }).getByRole('checkbox');

/** What the Share form has written to storage, so a switch isn't made before it is saved. */
const storedSelected = (page: Page) =>
  page.evaluate(
    async () =>
      (
        (await chrome.storage.session.get('shareDraft')).shareDraft as
          { selected: string[]; artifacts?: string[] } | undefined
      )?.selected.length,
  );

async function saveList(page: Page, name: string, emails: string) {
  await page.getByRole('tab', { name: /Lists/ }).click();
  await lists(page).getByRole('button', { name: 'New list' }).click();
  await lists(page).getByLabel('List name').filter({ visible: true }).fill(name);
  await lists(page).getByLabel('Email addresses').filter({ visible: true }).fill(emails);
  await lists(page).getByRole('button', { name: 'Save list' }).click();
  await expect(lists(page).locator('summary', { hasText: name })).toBeVisible();
}

test('the artifacts, ticked lists, a list being typed and the open tab move with ArtiShare', async ({
  context,
  extensionId,
}) => {
  // The pages the artifacts point at are never fetched, but keep anything from leaving the machine.
  await context.route(/^https:\/\/claude\.ai\//, (route) =>
    route.fulfill({ contentType: 'text/html', body: '<title>page</title>' }),
  );
  const popup = await open(context, extensionId, 'popup');

  // 1. Two artifacts, Alpha unticked and Beta ticked, and a new list half typed in Lists.
  await saveList(popup, 'Alpha', 'ana@example.com');
  await saveList(popup, 'Beta', 'bo@example.com\ncy@example.com');
  await popup.getByRole('tab', { name: 'Share' }).click();
  const box = share(popup).getByRole('textbox', { name: /Artifacts/ });
  await box.fill(`${ONE}\n${TWO}`);
  await box.press('Enter');
  await expect(share(popup).locator('.artifact-item')).toHaveText([ONE, TWO]);
  await tickFor(popup, 'Alpha').setChecked(false);
  await tickFor(popup, 'Beta').setChecked(true);
  await expect.poll(() => storedSelected(popup)).toBe(1);
  await popup.getByRole('tab', { name: /Lists/ }).click();
  await lists(popup).getByRole('button', { name: 'New list' }).click();
  await lists(popup).getByLabel('List name').filter({ visible: true }).fill('Gamma');
  await lists(popup).getByLabel('Email addresses').filter({ visible: true }).fill('di@example.com');
  // The form is saved a moment after typing; wait for it rather than sleeping.
  await expect
    .poll(() =>
      popup.evaluate(
        async () =>
          (
            (await chrome.storage.session.get('popupState')).popupState as
              { lists?: { newList: { text: string } | null } } | undefined
          )?.lists?.newList?.text,
      ),
    )
    .toBe('di@example.com');

  // 2. In the side panel: the Lists tab with the form as typed, then Share as it was.
  await switchFrom(popup, 'Open in side panel');
  const side = await open(context, extensionId, 'sidepanel');
  await expect(side.getByRole('tab', { name: /Lists/ })).toHaveAttribute('aria-selected', 'true');
  await expect(lists(side).getByLabel('List name').filter({ visible: true })).toHaveValue('Gamma');
  await expect(lists(side).getByLabel('Email addresses').filter({ visible: true })).toHaveValue(
    'di@example.com',
  );
  await side.getByRole('tab', { name: 'Share' }).click();
  await expect(share(side).locator('.artifact-item')).toHaveText([ONE, TWO]);
  await expect(tickFor(side, 'Beta')).toBeChecked();
  await expect(tickFor(side, 'Alpha')).not.toBeChecked();

  // And back: the popup finds the same, now on the Share tab it was left on.
  await switchFrom(side, 'Use popup instead');
  const again = await open(context, extensionId, 'popup');
  await expect(again.getByRole('tab', { name: 'Share' })).toHaveAttribute('aria-selected', 'true');
  await expect(share(again).locator('.artifact-item')).toHaveText([ONE, TWO]);
  await expect(tickFor(again, 'Beta')).toBeChecked();
  await expect(tickFor(again, 'Alpha')).not.toBeChecked();
  await again.getByRole('tab', { name: /Lists/ }).click();
  await expect(lists(again).getByLabel('List name').filter({ visible: true })).toHaveValue('Gamma');
});

test('a preview and then a run carry over, live, with Stop and Resume working in either place', async ({
  context,
  extensionId,
}) => {
  const popup = await open(context, extensionId, 'popup');
  await saveList(popup, 'Beta', 'ana@example.com\nbo@example.com\ncy@example.com\nslow-di@example.com');
  await popup.getByRole('tab', { name: 'Share' }).click();
  const box = share(popup).getByRole('textbox', { name: /Artifacts/ });
  await box.fill(`${ONE}\n${TWO}`);
  await box.press('Enter');
  await expect(share(popup).locator('.artifact-item')).toHaveText([ONE, TWO]);
  await tickFor(popup, 'Beta').check();
  await expect.poll(() => storedSelected(popup)).toBe(1);

  // 3. Preview in the side panel, then back to the popup: the same preview with Back and Send.
  await switchFrom(popup, 'Open in side panel');
  const side = await open(context, extensionId, 'sidepanel');
  await side.getByRole('tab', { name: 'Share' }).click();
  await share(side)
    .getByRole('button', { name: /^Preview/ })
    .click();
  await expect(share(side).getByRole('button', { name: 'Send 8 invitations' })).toBeEnabled();
  await switchFrom(side, 'Use popup instead');
  const popupAgain = await open(context, extensionId, 'popup');
  await expect(share(popupAgain).getByRole('button', { name: 'Back' })).toBeVisible();
  await expect(share(popupAgain).locator('.artifact-row')).toHaveCount(2);
  await expect(share(popupAgain).getByRole('button', { name: 'Send 8 invitations' })).toBeEnabled();

  // 4. Send and confirm, then switch while it runs: the panel shows it live.
  await share(popupAgain).getByRole('button', { name: 'Send 8 invitations' }).click();
  await answer(share(popupAgain), 'Send');
  await expect(share(popupAgain).getByText('Running', { exact: true })).toBeVisible();
  const invited = async (page: Page) => {
    const text =
      (await share(page)
        .locator('.chip.ok')
        .textContent({ timeout: 2_000 })
        .catch(() => null)) ?? '';

    return Number(/(\d+) invited/.exec(text)?.[1] ?? -1);
  };
  await expect.poll(() => invited(popupAgain)).toBeGreaterThanOrEqual(1);
  const atSwitch = await invited(popupAgain);

  await switchFrom(popupAgain, 'Open in side panel');
  const panel = await open(context, extensionId, 'sidepanel');
  await expect(share(panel).getByText('Running', { exact: true })).toBeVisible();
  // Not interrupted by the switch: it goes on from where it was, by itself.
  expect(await invited(panel)).toBeGreaterThanOrEqual(atSwitch);
  await expect.poll(() => invited(panel)).toBeGreaterThan(atSwitch);

  await share(panel).getByRole('button', { name: 'Stop' }).click();
  await expect(share(panel).getByText('Stopped', { exact: true })).toBeVisible();
  const stoppedAt = await invited(panel);
  await panel.waitForTimeout(1_500);
  expect(await invited(panel)).toBe(stoppedAt);
  await expect(share(panel).getByText(/\d+ left/)).toBeVisible();

  // Resume in the side panel, and it finishes there.
  await share(panel).getByRole('button', { name: 'Resume' }).click();
  await expect(share(panel).getByText('Running', { exact: true })).toBeVisible();
  await expect(share(panel).getByText(/Share finished: \d+ invited/)).toBeVisible({ timeout: 60_000 });
  await expect(share(panel).getByText('Done', { exact: true })).toBeVisible();

  // The popup, opened afterwards, shows the finished run as well.
  await switchFrom(panel, 'Use popup instead');
  const last = await open(context, extensionId, 'popup');
  await expect(share(last).getByText(/Share finished: \d+ invited/)).toBeVisible();
});
