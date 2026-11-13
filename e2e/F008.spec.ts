import { answer, expect, test } from './fixtures';

// F008: the side panel page shows the same ArtiShare as the popup, filling the panel's height.

// The ID the manifest `key` pins (see wxt.config.ts). Users' saved lists depend on it.
const PINNED_ID = 'eeihicglfclmofckclcpjleekpddjflg';

test('the manifest registers the side panel and keeps the popup and the key', async ({
  extensionId,
  panel,
}) => {
  const manifest = await panel.evaluate(() => chrome.runtime.getManifest());

  expect(manifest.side_panel?.default_path).toBe('sidepanel.html');
  expect(manifest.permissions).toContain('sidePanel');
  expect(manifest.action?.default_popup).toBe('popup.html');
  // A changed or missing key would give the extension another ID.
  expect(extensionId).toBe(PINNED_ID);
});

test('shows the header, account, Share and Lists tabs and the version', async ({ sidePanel }) => {
  await expect(sidePanel.getByRole('heading', { name: 'ArtiShare' })).toBeVisible();
  await expect(sidePanel.locator('header .account')).toContainText('owner@example.com');
  await expect(sidePanel.getByRole('tab', { name: 'Share' })).toBeVisible();
  await expect(sidePanel.getByRole('tab', { name: /Lists/ })).toBeVisible();
  await expect(sidePanel.getByText(/^Version /)).toBeVisible();
});

test('fills the whole height with only the content scrolling', async ({ sidePanel }) => {
  const box = (selector: string) =>
    sidePanel.locator(selector).evaluate((el) => {
      const { top, bottom, width } = el.getBoundingClientRect();

      return { top, bottom, width };
    });
  const height = 900;

  const top = await box('.popup-top');
  expect(top.top).toBe(0);
  const footer = await box('.footer');
  expect(footer.bottom).toBeCloseTo(height, 0);
  const popup = await box('.popup');
  // No 600 px cap: the app takes the whole window height, and the whole panel width (not 380).
  expect(popup.bottom).toBeCloseTo(height, 0);
  expect(popup.width).toBeGreaterThan(390);

  // Even with little content the footer sits at the very bottom.
  expect(footer.bottom).toBeGreaterThan(600);

  // Make the content taller than the window: the page itself must not scroll, the body does.
  await sidePanel.setViewportSize({ width: 400, height: 500 });
  await sidePanel.getByRole('tab', { name: /Lists/ }).click();
  const lists = sidePanel.getByRole('tabpanel', { name: /Lists/ });
  await lists.getByRole('button', { name: 'New list' }).click();
  await lists
    .getByLabel('Email addresses')
    .fill(Array.from({ length: 60 }, (_, i) => `person${i}@example.com`).join('\n'));
  const scroll = await sidePanel.evaluate(() => {
    const body = document.querySelector('.popup-body')!;

    return {
      pageScrolls: document.documentElement.scrollHeight > window.innerHeight,
      bodyScrolls: body.scrollHeight > body.clientHeight,
      footerBottom: document.querySelector('.footer')!.getBoundingClientRect().bottom,
      topTop: document.querySelector('.popup-top')!.getBoundingClientRect().top,
    };
  });
  expect(scroll.pageScrolls).toBe(false);
  expect(scroll.bodyScrolls).toBe(true);
  expect(scroll.footerBottom).toBeCloseTo(500, 0);
  expect(scroll.topTop).toBe(0);
});

test('make a list, preview and send to one artifact from the side panel', async ({ sidePanel }) => {
  await sidePanel.getByRole('tab', { name: /Lists/ }).click();
  const lists = sidePanel.getByRole('tabpanel', { name: /Lists/ });
  await lists.getByRole('button', { name: 'New list' }).click();
  await lists.getByLabel('List name').fill('Panel team');
  await lists.getByLabel('Email addresses').fill('ana@example.com');
  await lists.getByRole('button', { name: 'Save list' }).click();

  await sidePanel.getByRole('tab', { name: 'Share' }).click();
  const share = sidePanel.getByRole('tabpanel', { name: 'Share' });
  await share.getByLabel(/Artifacts/).fill('https://claude.ai/artifact/SidePanelArtifact01');
  await share.locator('label.pick', { hasText: 'Panel team' }).getByRole('checkbox').check();
  await share.getByRole('button', { name: /^Preview/ }).click();
  await share.getByRole('button', { name: 'Send 1 invitation' }).click();
  await answer(share, 'Send');

  await expect(share.getByText(/Share finished/)).toBeVisible({ timeout: 20_000 });
});
