import { chromium, expect, test, type Page } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Regenerates the README and store screenshots from the fake build's popup (`npm run screenshots`).
// It is not part of `npm run e2e`: it writes files into docs/images and store/images. Nothing is
// sent anywhere, and every address and artifact id below is made up.

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const EXTENSION_DIR = `${ROOT}.output/chrome-mv3-fake`;
const DOCS = `${ROOT}docs/images`;
const STORE = `${ROOT}store/images`;
const FONT = `${ROOT}node_modules/@fontsource-variable/plus-jakarta-sans/files/plus-jakarta-sans-latin-wght-normal.woff2`;

// Not real artifacts: the ids only have to look like the real thing. One contains "Shared", which
// the fake seeds with people already invited, for the Manage access picture.
const QUARTERLY = 'https://claude.ai/artifact/Ex4mpleQuarterlyPlan001';
const ROADMAP = 'https://claude.ai/artifact/Ex4mpleRoadmapDeck0002';
const SHARED = 'https://claude.ai/artifact/Ex4mpleSharedBrief0001';

const LISTS = [
  {
    name: 'Acme clients',
    access: 'Can view',
    emails: ['jordan', 'priya', 'sam', 'alex', 'kim'].map((n) => `${n}@acme.example`),
  },
  {
    name: 'Design team',
    access: 'Can edit',
    emails: ['mai', 'leo', 'ana'].map((n) => `${n}@nimble.example`),
  },
  {
    name: 'Reviewers',
    access: 'Commenter',
    emails: ['robin', 'chris'].map((n) => `${n}@reviews.example`),
  },
];

/** The popup page as a tab, 380 × 600 like the real popup, drawn at twice the pixels. */
async function openPopup() {
  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    viewport: { width: 380, height: 600 },
    deviceScaleFactor: 2,
    args: [`--disable-extensions-except=${EXTENSION_DIR}`, `--load-extension=${EXTENSION_DIR}`],
  });
  // Pages are served here, so nothing reaches claude.ai.
  await context.route(/^https:\/\/claude\.ai\//, (route) =>
    route.fulfill({ contentType: 'text/html', body: '<title>page</title>' }),
  );
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${new URL(worker.url()).host}/popup.html`);

  return { context, popup };
}

async function snap(popup: Page, path: string, scrollToEnd = false) {
  // No caret or focus ring in the picture, and the content at the top (or at the end, when the
  // button that matters is below the fold: the Share form is taller than a 600 px popup).
  await popup.evaluate((toEnd) => {
    (document.activeElement as HTMLElement | null)?.blur();
    const body = document.querySelector('.popup-body');
    body?.scrollTo(0, toEnd ? body.scrollHeight : 0);
  }, scrollToEnd);
  await popup.locator('.popup').screenshot({ path });
}

/** A store screenshot: the headline on the left, the popup in a rounded frame on the right. */
async function storeImage(popupPng: string, out: string, headline: string, lead: string) {
  const icon = readFileSync(`${ROOT}store/icon.svg`).toString('base64');
  const shot = readFileSync(popupPng).toString('base64');
  const html = `<!doctype html><meta charset="utf-8"><style>
    @font-face { font-family: Jakarta; src: url('file://${FONT}'); font-weight: 200 800; }
    * { box-sizing: border-box; }
    body { margin: 0; width: 1280px; height: 800px; font-family: Jakarta, sans-serif; color: #14161a;
      background: linear-gradient(135deg, #f2f6f6 0%, #eaf5f1 55%, #dcf3e7 100%); position: relative; }
    .copy { position: absolute; left: 96px; top: 0; bottom: 0; width: 560px; display: flex;
      flex-direction: column; justify-content: center; gap: 22px; }
    .brand { display: flex; align-items: center; gap: 16px; font-size: 24px; font-weight: 700; }
    .brand img { width: 44px; height: 44px; }
    h1 { margin: 6px 0 0; font-size: 56px; line-height: 1.04; letter-spacing: -0.035em; font-weight: 800; }
    p { margin: 0; font-size: 22px; line-height: 1.5; color: #4b525d; max-width: 520px; }
    .frame { position: absolute; right: 97px; top: 50%; transform: translateY(-50%); width: 438px;
      border-radius: 28px; overflow: hidden; border: 1px solid #dfe3e8;
      box-shadow: 0 24px 60px rgba(20, 40, 35, 0.18), 0 4px 12px rgba(20, 40, 35, 0.08); }
    .frame img { display: block; width: 100%; }
  </style>
  <div class="copy">
    <div class="brand"><img src="data:image/svg+xml;base64,${icon}" alt="">ArtiShare</div>
    <h1>${headline}</h1>
    <p>${lead}</p>
  </div>
  <div class="frame"><img src="data:image/png;base64,${shot}" alt=""></div>`;
  const file = test.info().outputPath('store.html');
  mkdirSync(test.info().outputDir, { recursive: true });
  writeFileSync(file, html);

  // A plain browser at 1x: the popup's own context draws at 2x, and the store wants 1280×800.
  const browser = await chromium.launch({ channel: 'chromium' });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto(`file://${file}`);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: out });
  await browser.close();
}

test('regenerate the README and store screenshots', async () => {
  test.setTimeout(180_000);
  const { context, popup } = await openPopup();

  const lists = popup.getByRole('tabpanel', { name: /Lists/ });
  const share = popup.getByRole('tabpanel', { name: 'Share' });

  await popup.getByRole('tab', { name: /Lists/ }).click();
  for (const list of LISTS) {
    await lists.getByRole('button', { name: 'New list' }).click();
    await lists.getByLabel('List name').last().fill(list.name);
    await lists.getByLabel('Email addresses').last().fill(list.emails.join('\n'));
    await lists.getByLabel('Permission').filter({ visible: true }).selectOption({ label: list.access });
    await lists.getByRole('button', { name: 'Save list' }).click();
    await expect(lists.locator('details.list-card', { hasText: list.name })).toHaveCount(1);
  }
  await popup.getByRole('tab', { name: 'Share' }).click();

  const pick = (name: string) => share.locator('label.pick', { hasText: name }).getByRole('checkbox');
  const finished = share.getByText(/^Share finished/);

  // The Reviewers already have access to the first artifact, pending: send them there first.
  await share.getByLabel(/Artifacts/).fill(QUARTERLY);
  await pick('Reviewers').check();
  await share.getByRole('button', { name: /^Preview/ }).click();
  await share.getByRole('button', { name: 'Send 2 invitations' }).click();
  await popup.getByRole('alertdialog').getByRole('button', { name: 'Send', exact: true }).click();
  await expect(finished).toBeVisible({ timeout: 30_000 });
  await share.getByRole('button', { name: 'Start a new share' }).click();

  // 1. The Share form.
  await share.getByLabel(/Artifacts/).fill(`${QUARTERLY}\n${ROADMAP}`);
  for (const { name } of LISTS) await pick(name).check();
  await expect(share.getByRole('button', { name: 'Preview 10 people × 2 artifacts' })).toBeVisible();
  await snap(popup, `${DOCS}/share.png`, true);
  await snap(popup, test.info().outputPath('store-share.png'), true);

  // 2. The preview.
  await share.getByRole('button', { name: /^Preview/ }).click();
  await expect(share.getByRole('button', { name: 'Send 18 invitations' })).toBeVisible();
  // Open the first artifact's groups so the picture shows names, not just counts.
  const card = share.locator('section.card').first();
  await card.locator('summary', { hasText: 'Will be invited' }).click();
  await card.locator('summary', { hasText: 'Existing email access' }).click();
  await snap(popup, `${DOCS}/preview.png`);
  await snap(popup, test.info().outputPath('store-preview.png'));

  // 3. The finished run.
  await share.getByRole('button', { name: 'Send 18 invitations' }).click();
  await popup.getByRole('alertdialog').getByRole('button', { name: 'Send', exact: true }).click();
  await expect(finished).toHaveText('Share finished: 18 invited', { timeout: 60_000 });
  await snap(popup, `${DOCS}/done.png`);
  await snap(popup, test.info().outputPath('store-done.png'));

  // 4. Manage access, on an artifact that already has people (the popup reads the active tab).
  const tab = await context.newPage();
  await tab.goto(SHARED);
  await tab.bringToFront();
  await popup.reload();
  await share.getByRole('button', { name: 'Manage access' }).click();
  await expect(share.locator('ul.people > li')).toHaveCount(4);
  await snap(popup, `${DOCS}/manage.png`);

  const shot = (name: string) => test.info().outputPath(`store-${name}.png`);
  await storeImage(
    shot('share'),
    `${STORE}/screenshot-1-share.png`,
    'Invite whole lists to your artifacts',
    'Save groups of email addresses once. Paste artifact links, tick the lists, and everyone gets the permission you chose.',
  );
  await storeImage(
    shot('preview'),
    `${STORE}/screenshot-2-preview.png`,
    'See who gets invited before anything is sent',
    'Preview checks who already has access to each artifact, so only the new people are invited.',
  );
  await storeImage(
    shot('done'),
    `${STORE}/screenshot-3-done.png`,
    'Invites go out for you, one at a time',
    'Follow each invite as it goes. If claude.ai asks it to slow down, the run waits and retries.',
  );
  await context.close();
});
