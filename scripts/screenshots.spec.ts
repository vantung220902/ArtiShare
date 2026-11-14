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

/**
 * The popup (380 × 600, like the real one) or the side panel (a taller page) as a tab, drawn at
 * twice the pixels.
 */
async function openPopup(file = 'popup.html', viewport = { width: 380, height: 600 }) {
  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    viewport,
    deviceScaleFactor: 2,
    args: [`--disable-extensions-except=${EXTENSION_DIR}`, `--load-extension=${EXTENSION_DIR}`],
  });
  // Pages are served here, so nothing reaches claude.ai.
  await context.route(/^https:\/\/claude\.ai\//, (route) =>
    route.fulfill({ contentType: 'text/html', body: '<title>page</title>' }),
  );
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${new URL(worker.url()).host}/${file}`);

  return { context, popup };
}

async function snap(popup: Page, path: string, bottom = false) {
  // No caret or focus ring in the picture, and the content from the top (or from the bottom, when a
  // sticky action bar would otherwise hide the last field).
  await popup.evaluate((toBottom) => {
    (document.activeElement as HTMLElement | null)?.blur();
    document.querySelector('.popup-body')?.scrollTo(0, toBottom ? 10_000 : 0);
  }, bottom);
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

  // The popup reads the tab in front of it: over an artifact it adds that artifact as a row marked
  // "This tab" and shows the Manage access icon in the header, as the pictures should.
  const tab = await context.newPage();
  await tab.goto(QUARTERLY);
  await tab.bringToFront();
  await popup.reload();
  const manage = popup.getByRole('button', { name: 'Manage access' });
  await expect(manage).toBeVisible();

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

  // One link per row: typed, then Enter.
  const addRow = async (url: string) => {
    await share.getByLabel(/Artifacts/).fill(url);
    await share.getByLabel(/Artifacts/).press('Enter');
  };
  const rows = share.getByRole('button', { name: /^Remove https:\/\/claude\.ai\// });

  // The Reviewers already have access to the first artifact, pending: send them there first. It is
  // the tab's artifact, so it is already a row.
  await expect(rows).toHaveCount(1);
  await pick('Reviewers').check();
  await share.getByRole('button', { name: /^Preview/ }).click();
  await share.getByRole('button', { name: 'Send 2 invitations' }).click();
  await popup.getByRole('alertdialog').getByRole('button', { name: 'Send', exact: true }).click();
  await expect(finished).toBeVisible({ timeout: 30_000 });
  await share.getByRole('button', { name: 'Start a new share' }).click();

  // 1. The Share form.
  await expect(rows).toHaveCount(1);
  await addRow(ROADMAP);
  await expect(rows).toHaveCount(2);
  for (const { name } of LISTS) await pick(name).check();
  await expect(share.getByRole('button', { name: 'Preview 10 people × 2 artifacts' })).toBeVisible();
  // From the top, so the picture shows the Artifacts rows; the Preview button is below the fold.
  await snap(popup, `${DOCS}/share.png`);
  await snap(popup, test.info().outputPath('store-share.png'));

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
  await tab.goto(SHARED);
  await popup.reload();
  // One of the three people already invited is in a list, so the picture shows both notes:
  // 'In Partners' for them and 'Not in a list' for the other two.
  await popup.getByRole('tab', { name: /Lists/ }).click();
  await lists.getByRole('button', { name: 'New list' }).click();
  await lists.getByLabel('List name').last().fill('Partners');
  await lists.getByLabel('Email addresses').last().fill('viewer@example.com');
  await lists.getByLabel('Permission').filter({ visible: true }).selectOption({ label: 'Can view' });
  await lists.getByRole('button', { name: 'Save list' }).click();
  await expect(lists.locator('details.list-card', { hasText: 'Partners' })).toHaveCount(1);
  await popup.getByRole('tab', { name: 'Share' }).click();
  await manage.click();
  const people = share.locator('ul.people > li');
  await expect(people).toHaveCount(4);
  await expect(people.filter({ hasText: 'In Partners' })).toHaveCount(1);
  await expect(people.filter({ hasText: 'Not in a list' })).toHaveCount(2);
  await expect(share.getByText("2 people aren't in any of your lists.")).toBeVisible();
  await snap(popup, `${DOCS}/manage.png`);

  // 5. Save to a list: the two people in no list, ticked, with New list picked and a name typed.
  await share.getByRole('button', { name: 'Save to a list' }).click();
  const save = share
    .locator('section.card')
    .filter({ has: popup.getByRole('button', { name: /^Save 2 people/ }) });
  await expect(save.getByRole('checkbox', { checked: true })).toHaveCount(3); // Select all + two people
  await expect(save.getByRole('radio', { name: 'New list' })).toBeChecked();
  await save.getByLabel('Name').fill('Pending reviewers');
  await snap(popup, `${DOCS}/manage-save.png`, true);

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

  await sidePanelImage();
});

/** The side panel, a taller page than the popup, with a long list open in the Lists tab. */
async function sidePanelImage() {
  const { context, popup: panel } = await openPopup('sidepanel.html', { width: 400, height: 800 });
  const lists = panel.getByRole('tabpanel', { name: /Lists/ });

  // Forty made-up addresses: enough to need the taller box, which is what the picture is for.
  const emails = Array.from(
    { length: 40 },
    (_, i) => `guest${String(i + 1).padStart(2, '0')}@summit.example`,
  );
  await panel.getByRole('tab', { name: /Lists/ }).click();
  await lists.getByRole('button', { name: 'New list' }).click();
  await lists.getByLabel('List name').last().fill('Summit attendees');
  await lists.getByLabel('Email addresses').last().fill(emails.join('\n'));
  await lists.getByLabel('Permission').filter({ visible: true }).selectOption({ label: 'Can view' });
  await lists.getByRole('button', { name: 'Save list' }).click();
  const card = lists.locator('details.list-card', { hasText: 'Summit attendees' });
  await expect(card).toHaveCount(1);
  await card.locator('summary').click();
  await expect(card.getByLabel('Email addresses')).toHaveValue(emails.join('\n'));

  await snap(panel, `${DOCS}/sidepanel.png`);
  await context.close();
}
