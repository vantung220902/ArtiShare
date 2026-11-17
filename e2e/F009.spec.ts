import type { BrowserContext, Frame, Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { openArtifact } from './claudePage';

// F009: big lists and lots of lists, and where claude.ai's Invite differs from ArtiShare's: the
// 50-people warning, a chip area that scrolls, a search capped at 20 rows, and the Can edit note.

const BOX = 'artishare-share-lists';
const FIELD = "input[role=combobox][aria-label='Invite people by email']";

const OVER_LIMIT =
  'claude.ai lets at most 50 people outside your organization have access to an artifact, pending invitations included. Some of these may not be invited.';
const CAN_EDIT =
  "Here claude.ai's Invite sets the permission, not Team's Can edit. Change it in People with access afterwards, or invite from the ArtiShare popup.";

const person = (prefix: string, i: number) => `${prefix}${String(i).padStart(2, '0')}@example.com`;
const crowd = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => person(prefix, i + 1));

type SavedList = { name: string; emails: string[]; access?: 'view' | 'comment' | 'edit' };

const writeLists = (page: Page, lists: SavedList[]) =>
  page.evaluate(async (all) => {
    await chrome.storage.local.set({
      config: {
        version: 2,
        lists: all.map((l, i) => ({ id: `list-${i}`, access: 'view', ...l })),
        defaultSelection: { mode: 'some', listIds: [] },
      },
    });
  }, lists);

async function openShare(context: BrowserContext) {
  const claude = await openArtifact(context);
  await claude.share();
  await expect(claude.host.locator('[data-share-pop][data-open]')).toBeVisible();

  return claude;
}

const box = (host: Frame) => host.locator(BOX);
const chip = (host: Frame, name: string) => box(host).getByRole('button', { name: new RegExp(`^${name},`) });
const field = (host: Frame) => host.locator(FIELD);
const search = (host: Frame) => box(host).getByRole('searchbox', { name: 'Search lists or people' });
const invited = (host: Frame) => host.evaluate(() => window.__standIn.invited);

test('a list of 45 fills the field and claude.ai offers Invite 45 people, with no warning', async ({
  context,
  panel,
}) => {
  await writeLists(panel, [{ name: 'Crowd', emails: crowd('person', 45) }]);
  const { host } = await openShare(context);

  await chip(host, 'Crowd').click();
  await expect(field(host)).toHaveValue(crowd('person', 45).join(', '));
  await expect(host.getByRole('option', { name: /Invite 45 people/ })).toBeVisible();
  await expect(box(host)).not.toContainText('at most 50 people');
  expect(await invited(host)).toEqual([]);
});

test('over 50 addresses the box warns, and the warning goes when the field is back at 50 or fewer', async ({
  context,
  panel,
}) => {
  await writeLists(panel, [
    { name: 'Crowd', emails: crowd('person', 45) },
    { name: 'More', emails: crowd('extra', 10) },
  ]);
  const { host } = await openShare(context);

  // With 45 addresses in the field, the stand-in's option lists them all and covers the chips, so
  // the second pick, and the unpick, go by keyboard, as a person who can't click through would.
  const press = async (name: string) => {
    await chip(host, name).focus();
    await host.page().keyboard.press('Enter');
  };

  await chip(host, 'Crowd').click();
  await press('More');
  await expect(field(host)).toHaveValue([...crowd('person', 45), ...crowd('extra', 10)].join(', '));
  await expect(host.getByRole('option', { name: /Invite 55 people/ })).toBeVisible();
  await expect(box(host).locator('.note')).toHaveText(OVER_LIMIT);

  // Unpicking More leaves 45.
  await press('More');
  await expect(box(host).locator('.note')).toHaveCount(0);

  // Exactly 50 is allowed: 45 plus five typed by hand.
  await field(host).fill(`${crowd('person', 45).join(', ')}, ${crowd('extra', 5).join(', ')}`);
  await expect(box(host).locator('.note')).toHaveCount(0);
  await field(host).fill(`${crowd('person', 45).join(', ')}, ${crowd('extra', 6).join(', ')}`);
  await expect(box(host).locator('.note')).toHaveText(OVER_LIMIT);
  await field(host).fill(crowd('person', 50).join(', '));
  await expect(box(host).locator('.note')).toHaveCount(0);
  expect(await invited(host)).toEqual([]);
});

test('with 30 lists the chips wrap, stop at about three rows and scroll, and the field stays in view', async ({
  context,
  panel,
}) => {
  await writeLists(
    panel,
    Array.from({ length: 30 }, (_, i) => ({ name: `Group number ${i + 1}`, emails: [person('g', i + 1)] })),
  );
  const { host } = await openShare(context);
  const chips = box(host).locator('.chips');

  await expect(box(host).locator('.chip')).toHaveCount(30);
  const tops = await box(host)
    .locator('.chip')
    .evaluateAll((els) => new Set(els.map((el) => Math.round(el.getBoundingClientRect().top))).size);
  expect(tops).toBeGreaterThan(3);
  const { client, scroll } = await chips.evaluate((el) => ({
    client: el.clientHeight,
    scroll: el.scrollHeight,
  }));
  expect(scroll).toBeGreaterThan(client);
  // Three rows of chips, not the ten that 30 would take.
  expect(client).toBeGreaterThan(70);
  expect(client).toBeLessThan(110);
  await expect(field(host)).toBeInViewport();
  await expect(host.locator('[data-share-view]')).toBeAttached();

  // The last chip is reachable by scrolling the chip area, and picking it works.
  const last = chip(host, 'Group number 30');
  await last.scrollIntoViewIfNeeded();
  await last.click();
  await expect(field(host)).toHaveValue(person('g', 30));
});

test('a search with more than 20 matching people shows 20 rows and says how many more', async ({
  context,
  panel,
}) => {
  await writeLists(panel, [{ name: 'Crowd', emails: crowd('person', 45) }]);
  const { host } = await openShare(context);

  await search(host).fill('person');
  await expect(box(host).locator('.result')).toHaveCount(20);
  await expect(box(host).locator('.more')).toHaveText('and 25 more. Keep typing to narrow it down.');

  // Narrowing it down gets rid of the line.
  await search(host).fill('person4');
  await expect(box(host).locator('.result')).toHaveCount(6);
  await expect(box(host).locator('.more')).toHaveCount(0);
});

test('a list that matches is shown before people when the rows run out', async ({ context, panel }) => {
  await writeLists(panel, [{ name: 'person crew', emails: crowd('person', 30) }]);
  const { host } = await openShare(context);

  await search(host).fill('person');
  await expect(box(host).locator('.result')).toHaveCount(20);
  await expect(box(host).locator('.result').first()).toContainText('person crew · 30 people');
  await expect(box(host).locator('.more')).toHaveText('and 11 more. Keep typing to narrow it down.');
});

test('a picked Can edit list gets a note about the permission, which goes when it is unpicked', async ({
  context,
  panel,
}) => {
  await writeLists(panel, [
    { name: 'Team', emails: ['a@example.com', 'b@example.com', 'c@example.com'], access: 'edit' },
    { name: 'Design', emails: ['d@example.com', 'e@example.com'], access: 'view' },
  ]);
  const { host } = await openShare(context);
  const notes = box(host).locator('.note');

  await chip(host, 'Design').click();
  await expect(notes).toHaveCount(0);

  await chip(host, 'Team').click();
  await expect(notes).toHaveText(CAN_EDIT);
  await expect(host.getByRole('option', { name: /Invite 5 people/ })).toBeVisible();

  // Picking from a search counts the same, and so does a field filled in by hand.
  await chip(host, 'Team').click();
  await expect(notes).toHaveCount(0);
  await search(host).fill('team');
  await box(host)
    .getByRole('button', { name: /^Team · 3 people/ })
    .click();
  await expect(notes).toHaveText(CAN_EDIT);
  await search(host).fill('');
  await field(host).fill('d@example.com, e@example.com');
  await expect(notes).toHaveCount(0);
  await field(host).fill('a@example.com, b@example.com, c@example.com');
  await expect(notes).toHaveText(CAN_EDIT);
  expect(await invited(host)).toEqual([]);
});

test('Can view and Commenter lists get no permission note', async ({ context, panel }) => {
  await writeLists(panel, [
    { name: 'Team', emails: ['a@example.com'], access: 'comment' },
    { name: 'Design', emails: ['d@example.com'], access: 'view' },
  ]);
  const { host } = await openShare(context);

  await chip(host, 'Team').click();
  await chip(host, 'Design').click();
  await expect(field(host)).toHaveValue('a@example.com, d@example.com');
  await expect(box(host).locator('.note')).toHaveCount(0);
});

test('two Can edit lists are both named in the note', async ({ context, panel }) => {
  await writeLists(panel, [
    { name: 'Design', emails: ['d@example.com'], access: 'edit' },
    { name: 'Team', emails: ['a@example.com'], access: 'edit' },
  ]);
  const { host } = await openShare(context);

  await chip(host, 'Team').click();
  await chip(host, 'Design').click();
  await expect(box(host).locator('.note')).toContainText("not Design's and Team's Can edit.");
});
