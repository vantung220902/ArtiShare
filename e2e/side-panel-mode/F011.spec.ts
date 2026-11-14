import { chromium, expect, test, type BrowserContext, type Page } from '@playwright/test';

// F011: the popup-or-side-panel choice is remembered. A real toolbar click can't be made from
// Playwright, so what the icon will do is read back from the browser (`getPopup` and
// `getPanelBehavior`). A browser restart or an extension update is simulated by closing Chromium
// and starting it again on the same profile directory: storage is kept, `action.setPopup` is
// forgotten. (`chrome.runtime.reload()` can't be used: an extension loaded from the command line
// doesn't come back after it.)

const EXTENSION_DIR = new URL('../../.output/chrome-mv3-fake', import.meta.url).pathname;

type Session = { context: BrowserContext; extensionId: string };

let profile: string;
let session: Session | undefined;

/** Starts Chromium on the profile, with the fake build loaded, and waits for its background. */
async function launch(): Promise<Session> {
  const context = await chromium.launchPersistentContext(profile, {
    channel: 'chromium',
    args: [`--disable-extensions-except=${EXTENSION_DIR}`, `--load-extension=${EXTENSION_DIR}`],
  });
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  session = { context, extensionId: new URL(worker.url()).host };

  return session;
}

/** Closes the browser and starts it again on the same profile. */
async function restart(): Promise<Session> {
  await session!.context.close();

  return launch();
}

test.beforeEach(() => {
  // In the test's output folder, which Playwright empties at the start of the next run.
  profile = test.info().outputPath('profile');
});

test.afterEach(async () => {
  await session?.context.close();
  session = undefined;
});

async function extensionPage({ context, extensionId }: Session, file = 'popup'): Promise<Page> {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/${file}.html`);
  await expect(page.getByRole('heading', { name: 'ArtiShare' })).toBeVisible();

  return page;
}

/** What the toolbar icon will do and what was remembered. */
async function toolbar(s: Session) {
  const page = await extensionPage(s);
  const state = await page.evaluate(async () => ({
    popup: await chrome.action.getPopup({}),
    opensPanel: (await chrome.sidePanel.getPanelBehavior()).openPanelOnActionClick,
    stored: (await chrome.storage.local.get('surface')).surface,
  }));
  await page.close();

  return state;
}

/** Waits for the toolbar icon to settle on `surface`; the background applies it a moment after it starts. */
async function expectToolbar(s: Session, surface: 'popup' | 'sidepanel') {
  await expect
    .poll(async () => {
      const { popup, opensPanel } = await toolbar(s);

      return { opensPopup: popup.endsWith('/popup.html'), noPopup: popup === '', opensPanel };
    })
    .toEqual(
      surface === 'popup'
        ? { opensPopup: true, noPopup: false, opensPanel: false }
        : { opensPopup: false, noPopup: true, opensPanel: true },
    );
}

/** Clicks the header icon on `file`'s page; the page closes itself once it has switched. */
async function switchFrom(s: Session, file: 'popup' | 'sidepanel', label: string) {
  const page = await extensionPage(s, file);
  const closed = page.waitForEvent('close');
  await page.getByRole('button', { name: label }).click();
  await closed;
}

const toSidePanel = (s: Session) => switchFrom(s, 'popup', 'Open in side panel');
const toPopup = (s: Session) => switchFrom(s, 'sidepanel', 'Use popup instead');

test('on a fresh install the toolbar icon opens the popup', async () => {
  const s = await launch();

  await expectToolbar(s, 'popup');
  expect((await toolbar(s)).stored).toBeUndefined();
});

test('the side panel choice survives restarting the browser', async () => {
  await toSidePanel(await launch());
  const s = await restart();

  await expectToolbar(s, 'sidepanel');
  expect((await toolbar(s)).stored).toBe('sidepanel');
});

test('the popup choice survives restarting the browser', async () => {
  let s = await launch();
  await toSidePanel(s);
  await toPopup(s);
  s = await restart();

  await expectToolbar(s, 'popup');
  expect((await toolbar(s)).stored).toBe('popup');
});

test('the choice survives several restarts', async () => {
  let s = await launch();
  await toSidePanel(s);
  for (let i = 0; i < 3; i++) {
    s = await restart();
    await expectToolbar(s, 'sidepanel');
  }
});

test('a profile holding 0.3.0 storage keeps its lists and opens the popup', async () => {
  // What 0.3.0 stored: saved lists and a default selection, and no choice of surface.
  const config = {
    version: 2,
    lists: [
      { id: 'l-1', name: 'Design team', emails: ['ana@example.com', 'bo@example.com'], access: 'view' },
      { id: 'l-2', name: 'Reviewers', emails: ['cy@example.com'], access: 'edit' },
    ],
    defaultSelection: { mode: 'some', listIds: ['l-2'] },
  };
  const first = await launch();
  const seed = await extensionPage(first);
  await seed.evaluate(async (c) => {
    await chrome.storage.local.clear();
    await chrome.storage.local.set({ config: c });
  }, config);
  await seed.close();

  const s = await restart();
  await expectToolbar(s, 'popup');
  expect((await toolbar(s)).stored).toBeUndefined();

  const page = await extensionPage(s);
  const stored = await page.evaluate(async () => (await chrome.storage.local.get('config')).config);
  expect(stored).toEqual(config);

  await page.getByRole('tab', { name: 'Lists' }).click();
  const lists = page.getByRole('tabpanel', { name: /Lists/ });
  await expect(lists.getByText('Design team', { exact: true }).first()).toBeVisible();
  await expect(lists.getByText('Reviewers', { exact: true }).first()).toBeVisible();

  // The default selection is still Reviewers only.
  await page.getByRole('tab', { name: 'Share' }).click();
  await expect(page.getByRole('checkbox', { name: /Reviewers/ })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: /Design team/ })).not.toBeChecked();
});

test.describe('a stored choice that is not one of ours', () => {
  for (const value of ['tab', '', 'SIDEPANEL', 7, null, { surface: 'sidepanel' }]) {
    test(`${JSON.stringify(value)} opens the popup`, async () => {
      // Start from the side panel, so the popup can only come from reading the bad value.
      const first = await launch();
      await toSidePanel(first);
      const page = await extensionPage(first);
      await page.evaluate((v) => chrome.storage.local.set({ surface: v }), value);
      await page.close();

      const s = await restart();

      await expectToolbar(s, 'popup');
    });
  }
});
