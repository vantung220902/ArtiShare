import type { BrowserContext, Page } from '@playwright/test';
import { expect, test } from './fixtures';

// F011: Save to a list copes with a long list of people and with things changing while it's open.
// Driven in the side panel page: a popup page is itself the front tab, so it can't see an artifact.
// "In the popup" is the same page with the popup's CSS (380 px, 600 px tall): see `asPopup`.

test.beforeEach(async ({ context }) => {
  // Serve the pages ourselves: nothing may reach claude.ai.
  await context.route(/^https:\/\/claude\.ai\//, (route) =>
    route.fulfill({ contentType: 'text/html', body: '<title>page</title>' }),
  );
});

const CROWDED = 'ExampleCrowdedArtifact1';
const crowd = (n: number) => `crowd${String(n).padStart(2, '0')}@example.com`;
const unlisted = (n: number) => `${n} people aren't in any of your lists.`;
const ALL = Array.from({ length: 45 }, (_, i) => crowd(i + 1));

/** Saves a new list from the given page, through the background like the Lists tab does. */
async function saveList(page: Page, name: string, emails: string[]) {
  await page.evaluate(
    async (args) => {
      const reply = (await chrome.runtime.sendMessage({
        type: 'config-change',
        change: {
          type: 'save-list',
          list: { id: crypto.randomUUID(), name: args.name, emails: args.emails, access: 'view' },
          expected: null,
        },
      })) as { ok: boolean; error?: string };
      if (!reply.ok) throw new Error(reply.error);
    },
    { name, emails },
  );
}

async function panelOver(context: BrowserContext, extensionId: string, id: string) {
  const tab = await context.newPage();
  await tab.goto(`https://claude.ai/artifact/${id}`);
  // The side panel page follows the tab in front, so it is opened first, then the tab is raised.
  const panel = await context.newPage();
  await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  await expect(panel.getByRole('heading', { name: 'ArtiShare' })).toBeVisible();

  // Another window of the extension, where lists get saved and runs started behind the first one's back.
  const other = await context.newPage();
  await other.goto(`chrome-extension://${extensionId}/popup.html`);
  await expect(other.getByRole('heading', { name: 'ArtiShare' })).toBeVisible();
  await tab.bringToFront();

  return { panel, other };
}

/** The popup's own layout: html is 380 px wide and .popup is at most 600 px tall. */
async function asPopup(page: Page) {
  await page.setViewportSize({ width: 380, height: 700 });
  await page.evaluate(() => document.documentElement.classList.remove('sidepanel'));
}

const share = (panel: Page) => panel.getByRole('tabpanel', { name: 'Share' });
// The Share form stays mounted (hidden) under Manage access and has fields of its own.
const saveView = (panel: Page) =>
  share(panel)
    .locator('section.card')
    .filter({ has: panel.getByRole('heading', { name: 'Save to a list' }) });
const openManage = (panel: Page) => panel.getByRole('button', { name: 'Manage access' }).click();
const openSave = (panel: Page) => share(panel).getByRole('button', { name: 'Save to a list' }).click();

/** True when the page or the scrolling body can be scrolled sideways. */
const scrollsSideways = (page: Page) =>
  page.evaluate(() => {
    const body = document.querySelector('.popup-body')!;

    return (
      document.documentElement.scrollWidth > document.documentElement.clientWidth ||
      body.scrollWidth > body.clientWidth
    );
  });

/** Changes what claude.ai reports for the next 'sharees' reads in this page. */
async function reshape(page: Page, extra: { email: string; access: string; status: string; id?: string }[]) {
  await page.evaluate((more) => {
    const original = chrome.runtime.sendMessage.bind(chrome.runtime) as (msg: unknown) => Promise<unknown>;
    (chrome.runtime as unknown as { sendMessage: unknown }).sendMessage = async (msg: { type?: string }) => {
      const reply = (await original(msg)) as { ok: boolean; data?: unknown[] };
      if (msg?.type !== 'sharees' || !reply.ok) return reply;

      return { ...reply, data: [...(reply.data ?? []), ...more] };
    };
  }, extra);
}

async function openCrowd(panel: Page) {
  await openManage(panel);
  await expect(share(panel).getByText(unlisted(45))).toBeVisible();
  await openSave(panel);
}

test('45 people are offered in order and the header and Save stay in view while scrolling (popup)', async ({
  context,
  extensionId,
}) => {
  const { panel } = await panelOver(context, extensionId, CROWDED);
  await asPopup(panel);
  await openCrowd(panel);

  const view = saveView(panel);
  const boxes = view.locator('.choices').first().getByRole('checkbox');
  await expect(boxes).toHaveCount(45);
  await expect(view.getByText('45 of 45 selected')).toBeVisible();
  const labels = await view.locator('.choices').first().locator('label').allTextContents();
  expect(labels.map((l) => l.split(' · ')[0])).toEqual(ALL);

  const header = panel.locator('.popup-top');
  const save = view.getByRole('button', { name: 'Save 45 people' });
  const headerTop = (await header.boundingBox())!.y;
  const body = panel.locator('.popup-body');

  // Nothing is scrolled yet, and the save button is already in view, with Cancel beside it.
  await expect(save).toBeInViewport({ ratio: 1 });
  await expect(view.getByRole('button', { name: 'Cancel' })).toBeInViewport({ ratio: 1 });

  for (const position of [0, 0.4, 1]) {
    await body.evaluate((el, at) => el.scrollTo(0, (el.scrollHeight - el.clientHeight) * at), position);
    expect((await header.boundingBox())!.y).toBe(headerTop);
    await expect(header).toBeInViewport({ ratio: 1 });
    await expect(save).toBeInViewport({ ratio: 1 });
    expect(await scrollsSideways(panel)).toBe(false);
    // The body is what scrolls, not the page.
    expect(await panel.evaluate(() => document.documentElement.scrollTop)).toBe(0);
  }

  // It really scrolled, and at the end the last checkbox is clear of the bar.
  expect(await body.evaluate((el) => el.scrollTop)).toBeGreaterThan(500);
  const last = boxes.last();
  await expect(last).toBeInViewport({ ratio: 1 });
  const lastBox = (await last.boundingBox())!;
  const barBox = (await view.locator('.action-bar').boundingBox())!;
  expect(lastBox.y + lastBox.height).toBeLessThanOrEqual(barBox.y);
  // And it can be used from there.
  await last.uncheck();
  await expect(view.getByText('44 of 45 selected')).toBeVisible();
  await last.check();

  // At the top again the bar is still reachable, and it opaquely covers what scrolls under it.
  await body.evaluate((el) => el.scrollTo(0, 0));
  await expect(save).toBeInViewport({ ratio: 1 });
  const covered = await save.evaluate((el) => {
    const bar = el.closest('.action-bar')!;
    const r = bar.getBoundingClientRect();

    return document.elementFromPoint(r.left + 4, r.top + 4) === bar;
  });
  expect(covered).toBe(true);
});

test('saving 45 people as Crowd makes one list and People with access says In Crowd (popup)', async ({
  context,
  extensionId,
}) => {
  const { panel } = await panelOver(context, extensionId, CROWDED);
  await asPopup(panel);
  await openCrowd(panel);

  const view = saveView(panel);
  await view.getByLabel('Name').fill('Crowd');
  await view.getByRole('button', { name: 'Save 45 people' }).click();

  const people = share(panel);
  await expect(people.getByText('Saved 45 people to Crowd.')).toBeVisible();
  await expect(people.getByText(/in any of your lists/)).toHaveCount(0);
  await expect(panel.getByRole('tab', { name: /Lists/ })).toContainText('1');
  const rows = people.locator('ul.people > li').filter({ hasNotText: 'You (owner)' });
  await expect(rows).toHaveCount(45);
  for (const row of await rows.all()) {
    await expect(row.locator('.hint')).toContainText('In Crowd');
  }

  // One list holding all 45 addresses.
  await panel.getByRole('tab', { name: /Lists/ }).click();
  const lists = panel.getByRole('tabpanel', { name: /Lists/ });
  await lists.locator('summary', { hasText: 'Crowd' }).click();
  const addresses = (await lists.getByLabel('Email addresses').filter({ visible: true }).inputValue())
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  expect(addresses).toEqual(ALL);
});

test('in the side panel at 320 px the same works, with nothing scrolling sideways', async ({
  context,
  extensionId,
}) => {
  const { panel } = await panelOver(context, extensionId, CROWDED);
  await panel.setViewportSize({ width: 320, height: 640 });
  await openCrowd(panel);

  const view = saveView(panel);
  await expect(view.locator('.choices').first().getByRole('checkbox')).toHaveCount(45);
  await expect(view.getByText('45 of 45 selected')).toBeVisible();
  const save = view.getByRole('button', { name: 'Save 45 people' });
  const body = panel.locator('.popup-body');
  const headerTop = (await panel.locator('.popup-top').boundingBox())!.y;

  await body.evaluate((el) => el.scrollTo(0, el.scrollHeight));
  expect((await panel.locator('.popup-top').boundingBox())!.y).toBe(headerTop);
  await expect(save).toBeInViewport({ ratio: 1 });
  expect(await scrollsSideways(panel)).toBe(false);

  await view.getByLabel('Name').fill('Crowd');
  await save.click();
  const people = share(panel);
  await expect(people.getByText('Saved 45 people to Crowd.')).toBeVisible();
  await expect(people.locator('ul.people > li .hint').filter({ hasText: 'In Crowd' })).toHaveCount(45);
  expect(await scrollsSideways(panel)).toBe(false);
});

test('long addresses are cut off with … and keep the full address in a tooltip at 320 px', async ({
  context,
  extensionId,
}) => {
  const { panel } = await panelOver(context, extensionId, CROWDED);
  await panel.setViewportSize({ width: 320, height: 640 });
  const long = `${'a-very-long-mailbox-name-'.repeat(4)}end@some-extremely-long-domain-name-for-a-company.example.com`;
  await reshape(panel, [{ email: long, access: 'view', status: 'pending', id: 'inv-long' }]);
  await openManage(panel);
  await expect(share(panel).getByText(unlisted(46))).toBeVisible();
  await openSave(panel);

  const view = saveView(panel);
  const label = view.locator('.choices').first().locator('.truncate', { hasText: long });
  await expect(label).toHaveAttribute('title', long);
  const cut = await label.evaluate((el) => ({
    clipped: el.scrollWidth > el.clientWidth,
    ellipsis: getComputedStyle(el).textOverflow,
    nowrap: getComputedStyle(el).whiteSpace,
  }));
  expect(cut).toEqual({ clipped: true, ellipsis: 'ellipsis', nowrap: 'nowrap' });
  expect(await scrollsSideways(panel)).toBe(false);

  // A short address isn't cut.
  const short = view.locator('.truncate', { hasText: crowd(1) });
  expect(await short.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(false);
});

test('someone saved to a list in another window drops out of the checkboxes at once', async ({
  context,
  extensionId,
}) => {
  const { panel, other } = await panelOver(context, extensionId, CROWDED);
  await openCrowd(panel);
  const view = saveView(panel);
  // Choices made so far are kept.
  await view.getByRole('checkbox', { name: new RegExp(crowd(2)) }).uncheck();
  await expect(view.getByText('44 of 45 selected')).toBeVisible();

  await saveList(other, 'Elsewhere', [crowd(1)]);

  await expect(view.getByText('43 of 44 selected')).toBeVisible({ timeout: 1_000 });
  await expect(view.getByRole('checkbox', { name: new RegExp(crowd(1)) })).toHaveCount(0);
  await expect(view.getByRole('checkbox', { name: new RegExp(crowd(2)) })).not.toBeChecked();
  await expect(view.getByRole('button', { name: 'Save 43 people' })).toBeEnabled();
});

test('with the first person untouched the count reads … of 44 selected', async ({ context, extensionId }) => {
  const { panel, other } = await panelOver(context, extensionId, CROWDED);
  await openCrowd(panel);
  const view = saveView(panel);

  await saveList(other, 'Elsewhere', [crowd(1)]);

  await expect(view.getByText('44 of 44 selected')).toBeVisible({ timeout: 1_000 });
  await expect(view.locator('.choices').first().getByRole('checkbox')).toHaveCount(44);
});

test('when nobody is left Save to a list closes and People with access shows no note', async ({
  context,
  extensionId,
}) => {
  const { panel, other } = await panelOver(context, extensionId, CROWDED);
  await openCrowd(panel);

  await saveList(other, 'Everyone', ALL);

  const people = share(panel);
  await expect(people.getByRole('heading', { name: 'People with access' })).toBeVisible({ timeout: 2_000 });
  await expect(panel.getByRole('heading', { name: 'Save to a list' })).toHaveCount(0);
  await expect(people.getByText(/in any of your lists/)).toHaveCount(0);
  await expect(people.getByRole('button', { name: 'Save to a list' })).toHaveCount(0);
  await expect(people.locator('ul.people > li .hint').filter({ hasText: 'In Everyone' })).toHaveCount(45);
  // Focus isn't left on nothing.
  await expect(people.getByRole('button', { name: 'Back' })).toBeFocused();

  // If a list is deleted later the form doesn't pop back open by itself.
  await other.getByRole('tab', { name: /Lists/ }).click();
  await other.getByRole('tabpanel', { name: /Lists/ }).locator('summary', { hasText: 'Everyone' }).click();
  await other.getByRole('tabpanel', { name: /Lists/ }).getByRole('button', { name: 'Delete' }).click();
  await other.getByRole('alertdialog').getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(people.getByText(unlisted(45))).toBeVisible();
  await expect(panel.getByRole('heading', { name: 'Save to a list' })).toHaveCount(0);
});

test('a run that invites new people leaves the checkboxes alone; Refresh after Cancel shows them', async ({
  context,
  extensionId,
}) => {
  const { panel, other } = await panelOver(context, extensionId, CROWDED);
  await openCrowd(panel);
  const view = saveView(panel);
  await view.getByRole('checkbox', { name: new RegExp(crowd(3)) }).uncheck();

  await other.evaluate(async (id) => {
    const reply = (await chrome.runtime.sendMessage({
      type: 'start',
      label: 'New people',
      accountEmail: 'owner@example.com',
      plans: [
        {
          artifact: { id, kind: 'artifact', url: `https://claude.ai/artifact/${id}` },
          toInvite: [
            { email: 'newbie1@example.com', access: 'view' },
            { email: 'newbie2@example.com', access: 'edit' },
          ],
          alreadyShared: [],
          sameInbox: [],
          self: [],
        },
      ],
    })) as { ok: boolean; error?: string };
    if (!reply.ok) throw new Error(reply.error);
  }, CROWDED);
  // The run finishes in the other window.
  await other.getByRole('tab', { name: 'Share' }).click();
  await expect(other.getByText('Done', { exact: true })).toBeVisible({ timeout: 20_000 });
  await panel.waitForTimeout(500);

  // Nothing changed by itself.
  await expect(view.getByText('44 of 45 selected')).toBeVisible();
  await expect(view.getByRole('checkbox', { name: /newbie/ })).toHaveCount(0);
  await expect(view.locator('.choices').first().getByRole('checkbox')).toHaveCount(45);

  await view.getByRole('button', { name: 'Cancel' }).click();
  const people = share(panel);
  await expect(people.getByText(unlisted(45))).toBeVisible();
  await people.getByRole('button', { name: 'Refresh' }).click();

  await expect(people.getByText(unlisted(47))).toBeVisible();
  for (const email of ['newbie1@example.com', 'newbie2@example.com']) {
    await expect(people.locator('ul.people > li').filter({ hasText: email }).locator('.hint')).toContainText(
      'Not in a list',
    );
  }
  // They are offered now.
  await openSave(panel);
  await expect(saveView(panel).getByText('47 of 47 selected')).toBeVisible();
  await expect(
    saveView(panel).getByRole('checkbox', { name: /newbie2@example.com · Can edit/ }),
  ).toBeChecked();
});

test('people without an invitation id can be saved, and the owner is never offered', async ({
  context,
  extensionId,
}) => {
  const { panel } = await panelOver(context, extensionId, 'ExampleSharedArtifact1');
  await reshape(panel, [
    { email: 'joined@example.com', access: 'view', status: 'active' },
    { email: 'second-owner@example.com', access: 'owner', status: 'active' },
  ]);
  await openManage(panel);
  await expect(share(panel).getByText(unlisted(4))).toBeVisible();
  await openSave(panel);

  const view = saveView(panel);
  const boxes = view.locator('.choices').first().getByRole('checkbox');
  await expect(boxes).toHaveCount(4);
  await expect(view.getByRole('checkbox', { name: /joined@example.com · Can view/ })).toBeChecked();
  await expect(view.getByRole('checkbox', { name: /owner@example.com/ })).toHaveCount(0);

  await view.getByLabel('Name').fill('With joined');
  await view.getByRole('button', { name: 'Save 4 people' }).click();
  await expect(share(panel).getByText('Saved 4 people to With joined.')).toBeVisible();
  await expect(
    share(panel).locator('ul.people > li').filter({ hasText: 'joined@example.com' }).locator('.hint'),
  ).toContainText('In With joined');
  // The owner row is still only the signed-in user.
  await expect(share(panel).locator('ul.people > li').first()).toContainText('You (owner)');
  await expect(share(panel).locator('ul.people > li').filter({ hasText: 'second-owner' })).toHaveCount(0);
});
