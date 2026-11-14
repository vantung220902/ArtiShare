import { expect, test } from './fixtures';

// F001: in the side panel, Use popup instead closes the panel and opens the popup straight away,
// with the work as it was left. A real toolbar popup can't be seen from here, so `openPopup` is
// replaced in the page by a recorder that notes what Chrome was set to at that moment.

const ONE = 'https://claude.ai/artifact/ExampleArtifactOne01';

type Seen = { popup: string; openPanelOnActionClick: boolean; options: unknown };

test('Use popup instead opens the popup for this window with the work as it was, closes the panel, and the icon opens the popup again', async ({
  context,
  extensionId,
  sidePanel,
}) => {
  await context.route(/^https:\/\/claude\.ai\//, (route) =>
    route.fulfill({ contentType: 'text/html', body: '<title>page</title>' }),
  );
  const share = sidePanel.getByRole('tabpanel', { name: 'Share' });
  const lists = sidePanel.getByRole('tabpanel', { name: /Lists/ });

  // 1. Work in the side panel: a list, an artifact, the list ticked, then the Lists tab.
  await sidePanel.getByRole('tab', { name: /Lists/ }).click();
  await lists.getByRole('button', { name: 'New list' }).click();
  await lists.getByLabel('List name').fill('Switch team');
  await lists.getByLabel('Email addresses').fill('ana@example.com');
  await lists.getByRole('button', { name: 'Save list' }).click();
  await expect(lists.locator('summary', { hasText: 'Switch team' })).toBeVisible();
  await sidePanel.getByRole('tab', { name: 'Share' }).click();
  const box = share.getByRole('textbox', { name: /Artifacts/ });
  await box.fill(ONE);
  await box.press('Enter');
  await expect(share.locator('.artifact-item')).toHaveText([ONE]);
  await share.locator('label.pick', { hasText: 'Switch team' }).getByRole('checkbox').check();
  await expect
    .poll(() =>
      sidePanel.evaluate(
        async () =>
          ((await chrome.storage.session.get('shareDraft')).shareDraft as { selected: string[] } | undefined)
            ?.selected.length,
      ),
    )
    .toBe(1);
  await sidePanel.getByRole('tab', { name: /Lists/ }).click();

  // The toolbar icon opens the side panel, as after "Open in side panel". The recorder keeps its
  // notes in storage, since this page is about to close.
  await sidePanel.evaluate(async () => {
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
    await chrome.action.setPopup({ popup: '' });
    chrome.action.openPopup = (async (options?: unknown) => {
      await chrome.storage.session.set({
        openPopupSeen: {
          popup: await chrome.action.getPopup({}),
          openPanelOnActionClick: (await chrome.sidePanel.getPanelBehavior()).openPanelOnActionClick,
          options,
        },
      });
    }) as typeof chrome.action.openPopup;
  });
  const windowId = await sidePanel.evaluate(async () => (await chrome.windows.getCurrent()).id);

  // 2. Use popup instead: the side panel closes.
  const closed = sidePanel.waitForEvent('close');
  await sidePanel.getByRole('button', { name: 'Use popup instead' }).click();
  await closed;

  // 3. openPopup was called for this window, once the popup page was the action's popup and the
  // icon had stopped opening the side panel. Called earlier, it would open nothing or the panel.
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  const seen = await popup.evaluate(
    async () => (await chrome.storage.session.get('openPopupSeen')).openPopupSeen as Seen | undefined,
  );
  expect(seen).toEqual({
    popup: `chrome-extension://${extensionId}/popup.html`,
    openPanelOnActionClick: false,
    options: { windowId },
  });

  // 4. The popup shows the Lists tab, the artifact and the ticked list as they were.
  await expect(popup.getByRole('tab', { name: /Lists/ })).toHaveAttribute('aria-selected', 'true');
  await popup.getByRole('tab', { name: 'Share' }).click();
  const popupShare = popup.getByRole('tabpanel', { name: 'Share' });
  await expect(popupShare.locator('.artifact-item')).toHaveText([ONE]);
  await expect(
    popupShare.locator('label.pick', { hasText: 'Switch team' }).getByRole('checkbox'),
  ).toBeChecked();

  // 5. The toolbar icon opens the popup again, not the side panel.
  expect(await popup.evaluate(() => chrome.action.getPopup({}))).toBe(
    `chrome-extension://${extensionId}/popup.html`,
  );
  expect(
    await popup.evaluate(async () => (await chrome.sidePanel.getPanelBehavior()).openPanelOnActionClick),
  ).toBe(false);
  expect(await popup.evaluate(async () => (await chrome.storage.local.get('surface')).surface)).toBe('popup');
});
