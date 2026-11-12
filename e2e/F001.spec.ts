import { answer, expect, test } from './fixtures';

// F001: clicking the ArtiShare toolbar icon opens a popup with the Share and Lists tabs, instead
// of a side panel.

// The ID the manifest `key` pins (see wxt.config.ts). Users' saved lists depend on it.
const PINNED_ID = 'eeihicglfclmofckclcpjleekpddjflg';

test('the manifest opens a popup from the toolbar icon, with no side panel and the same key', async ({
  context,
  panel,
}) => {
  const manifest = await panel.evaluate(() => chrome.runtime.getManifest());

  expect(manifest.action?.default_popup).toBe('popup.html');
  expect(manifest).not.toHaveProperty('side_panel');
  expect(manifest.permissions ?? []).not.toContain('sidePanel');
  // A changed or missing key would give the extension another ID.
  const worker = context.serviceWorkers()[0]!;
  expect(new URL(worker.url()).host).toBe(PINNED_ID);
});

test('the toolbar action opens the popup page', async ({ context }) => {
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  // What clicking the icon does. openPopup needs a focused browser window, so give it a page first.
  const page = await context.newPage();
  await page.goto('about:blank');
  await page.bringToFront();
  await worker.evaluate(() => chrome.action.openPopup());

  // Playwright doesn't expose an action popup as a page, but Chrome lists it as a POPUP context.
  await expect
    .poll(() =>
      worker.evaluate(async () =>
        (await chrome.runtime.getContexts({ contextTypes: [chrome.runtime.ContextType.POPUP] })).map(
          (c) => new URL(c.documentUrl ?? '').pathname,
        ),
      ),
    )
    .toEqual(['/popup.html']);
  // And nothing opened as a side panel.
  const sidePanels = await worker.evaluate(
    async () =>
      (await chrome.runtime.getContexts({ contextTypes: [chrome.runtime.ContextType.SIDE_PANEL] })).length,
  );
  expect(sidePanels).toBe(0);
});

test('the popup has the header, account, tabs and version, and a whole share works from it', async ({
  panel,
}) => {
  const version = await panel.evaluate(() => chrome.runtime.getManifest().version);

  await expect(panel.getByRole('heading', { name: 'ArtiShare' })).toBeVisible();
  await expect(panel.locator('.account')).toHaveText('owner@example.com');
  await expect(panel.getByRole('tab', { name: 'Share' })).toHaveAttribute('aria-selected', 'true');
  await expect(panel.getByRole('tab', { name: /Lists/ })).toBeVisible();
  await expect(panel.getByText(`Version ${version}`)).toBeVisible();

  await panel.getByRole('tab', { name: /Lists/ }).click();
  const lists = panel.getByRole('tabpanel', { name: /Lists/ });
  await lists.getByRole('button', { name: 'New list' }).click();
  await lists.getByLabel('List name').fill('Popup team');
  await lists.getByLabel('Email addresses').fill('ana@example.com');
  await lists.getByRole('button', { name: 'Save list' }).click();
  await expect(panel.getByRole('tab', { name: /Lists/ })).toContainText('1');

  await panel.getByRole('tab', { name: 'Share' }).click();
  const share = panel.getByRole('tabpanel', { name: 'Share' });
  await share.getByLabel(/Artifacts/).fill('https://claude.ai/artifact/PopupTestArtifact01');
  const pick = share.locator('label.pick', { hasText: 'Popup team' }).getByRole('checkbox');
  await pick.check();
  await share.getByRole('button', { name: /^Preview/ }).click();
  await share.getByRole('button', { name: 'Send 1 invitation' }).click();
  await answer(share, 'Send');

  await expect(share.getByText('Share finished: 1 invited')).toBeVisible({ timeout: 20_000 });
});
