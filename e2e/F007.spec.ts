import type { BrowserContext, Frame, Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { openArtifact, openChatArtifact } from './claudePage';

// F007: lists changed in ArtiShare (another tab with the popup page) while claude.ai's Share dialog
// is open show up in the box straight away, without reopening the dialog.

const BOX = 'artishare-share-lists';
const FIELD = "input[role=combobox][aria-label='Invite people by email']";

const DESIGN = ['a@example.com', 'b@example.com'];
const TEAM = ['c@example.com', 'e@example.com', 'f@example.com'];

type Reply<T = unknown> = { ok: true; data: T } | { ok: false; error: string };

async function change(page: Page, change: object) {
  await page.evaluate(async (c) => {
    const reply = (await chrome.runtime.sendMessage({ type: 'config-change', change: c })) as Reply;
    if (!reply.ok) throw new Error(reply.error);
  }, change);
}

async function saveList(page: Page, name: string, emails: string[]) {
  const list = { id: crypto.randomUUID(), name, emails, access: 'view' };
  await change(page, { type: 'save-list', list, expected: null });
}

/** The list as stored now, so an edit can name what it expects to replace. */
const stored = (page: Page, name: string) =>
  page.evaluate(async (wanted) => {
    const reply = (await chrome.runtime.sendMessage({ type: 'config-get' })) as Reply<{
      lists: { id: string; name: string; emails: string[]; access: string }[];
    }>;
    if (!reply.ok) throw new Error(reply.error);

    return reply.data.lists.find((l) => l.name === wanted)!;
  }, name);

async function editList(
  page: Page,
  name: string,
  edit: (list: { name: string; emails: string[] }) => object,
) {
  const expected = await stored(page, name);
  await change(page, { type: 'save-list', list: { ...expected, ...edit(expected) }, expected });
}

async function deleteList(page: Page, name: string) {
  const expected = await stored(page, name);
  await change(page, { type: 'delete-list', id: expected.id, expected });
}

/** What an import that replaces the lists leaves in storage: a whole new set under the same key. */
const replaceAll = (page: Page, lists: { name: string; emails: string[] }[]) =>
  page.evaluate(async (imported) => {
    await chrome.storage.local.set({
      config: {
        version: 2,
        lists: imported.map((l, i) => ({ id: `imported-${i}`, access: 'view', ...l })),
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
/** The chips in the order they are drawn, as 'Team 3'. */
const chips = (host: Frame) => box(host).locator('.chip').allInnerTexts();
const texts = async (host: Frame) => (await chips(host)).map((t) => t.replace(/\s+/g, ' ').trim());

/** The popup page in another tab, as the person would use it, and claude.ai's tab in front again. */
async function twoLists(panel: Page) {
  await saveList(panel, 'Design', DESIGN);
  await saveList(panel, 'Team', TEAM);
}

test('adding someone to Team makes its chip read Team 4, and a picked Team shows as not picked', async ({
  context,
  panel,
}) => {
  await twoLists(panel);
  const { host } = await openShare(context);
  await expect(chip(host, 'Team')).toHaveText('Team 3');
  await chip(host, 'Team').click();
  await expect(chip(host, 'Team')).toHaveAttribute('aria-pressed', 'true');
  await chip(host, 'Design').click();

  await change(panel, {
    type: 'add-to-list',
    id: (await stored(panel, 'Team')).id,
    emails: ['d@example.com'],
  });

  await expect(chip(host, 'Team')).toHaveText('Team 4');
  await expect(chip(host, 'Team')).toHaveAttribute('aria-pressed', 'false');
  await expect(chip(host, 'Design')).toHaveAttribute('aria-pressed', 'true');
  await expect(box(host)).toHaveCount(1);
  // The field itself is not touched by a change in ArtiShare.
  await expect(field(host)).toHaveValue([...TEAM, ...DESIGN].join(', '));

  await chip(host, 'Team').click();

  await expect(field(host)).toHaveValue([...TEAM, ...DESIGN, 'd@example.com'].join(', '));
  await expect(chip(host, 'Team')).toHaveAttribute('aria-pressed', 'true');
});

test('renaming Team renames the chip and moves it into Lists tab order', async ({ context, panel }) => {
  await twoLists(panel);
  const { host } = await openShare(context);
  expect(await texts(host)).toEqual(['Design 2', 'Team 3']);

  await editList(panel, 'Team', () => ({ name: 'Core team' }));

  await expect.poll(() => texts(host)).toEqual(['Core team 3', 'Design 2']);
  await expect(chip(host, 'Core team')).toHaveAccessibleName('Core team, 3 people');
});

test('a rename shows in an open search, and a search shows new people and lists as they appear', async ({
  context,
  panel,
}) => {
  await twoLists(panel);
  const { host } = await openShare(context);
  await search(host).fill('team');
  const rows = box(host).locator('.result');
  await expect(rows).toHaveText([/^Team · 3 people$/]);

  await editList(panel, 'Team', () => ({ name: 'Core team' }));

  await expect(rows).toHaveText([/^Core team · 3 people$/]);
  await expect(search(host)).toHaveValue('team');

  await editList(panel, 'Core team', (l) => ({ emails: [...l.emails, 'teammate@example.com'] }));

  await expect(rows).toHaveText([/^Core team · 4 people$/, /^teammate@example\.com\s*In Core team$/]);
});

test('deleting Design takes its chip away but leaves the addresses it already put in the field', async ({
  context,
  panel,
}) => {
  await twoLists(panel);
  const { host } = await openShare(context);
  await chip(host, 'Design').click();
  await expect(field(host)).toHaveValue(DESIGN.join(', '));

  await deleteList(panel, 'Design');

  await expect.poll(() => texts(host)).toEqual(['Team 3']);
  await expect(field(host)).toHaveValue(DESIGN.join(', '));
  // The rest of the box still works with those addresses in the field.
  await chip(host, 'Team').click();
  await expect(field(host)).toHaveValue([...DESIGN, ...TEAM].join(', '));
});

test('a new list QA appears as QA 1, in Lists tab order', async ({ context, panel }) => {
  await twoLists(panel);
  const { host } = await openShare(context);

  await saveList(panel, 'QA', ['q@example.com']);

  await expect.poll(() => texts(host)).toEqual(['Design 2', 'QA 1', 'Team 3']);
  await chip(host, 'QA').click();
  await expect(field(host)).toHaveValue('q@example.com');
  await expect(chip(host, 'QA')).toHaveAttribute('aria-pressed', 'true');
});

test('importing lists that replace the old ones turns the chips into the imported lists', async ({
  context,
  panel,
}) => {
  await twoLists(panel);
  const { host } = await openShare(context);
  await chip(host, 'Team').click();

  await replaceAll(panel, [
    { name: 'Ops', emails: ['o1@example.com', 'o2@example.com'] },
    { name: 'Alpha', emails: ['x@example.com'] },
  ]);

  await expect.poll(() => texts(host)).toEqual(['Alpha 1', 'Ops 2']);
  await expect(chip(host, 'Team')).toHaveCount(0);
  await expect(chip(host, 'Ops')).toHaveAttribute('aria-pressed', 'false');
  await chip(host, 'Ops').click();
  await expect(field(host)).toHaveValue([...TEAM, 'o1@example.com', 'o2@example.com'].join(', '));
});

test('deleting every list shows the no-lists note, and a new list brings the chips back', async ({
  context,
  panel,
}) => {
  await twoLists(panel);
  const { host } = await openShare(context);
  await search(host).fill('team');

  await deleteList(panel, 'Design');
  await deleteList(panel, 'Team');

  await expect(box(host)).toContainText("No saved lists yet. Make one in ArtiShare's Lists tab.");
  await expect(box(host).locator('.chip')).toHaveCount(0);
  await expect(search(host)).toHaveCount(0);

  await saveList(panel, 'Fresh', ['n@example.com']);

  await expect.poll(() => texts(host)).toEqual(['Fresh 1']);
  // The search comes back empty: a search for a list that is gone isn't kept.
  await expect(search(host)).toHaveValue('');
  await expect(box(host)).toHaveCount(1);
});

test('changes made while the box is in the top frame follow the same way', async ({ context, panel }) => {
  await twoLists(panel);
  const claude = await openChatArtifact(context);
  await claude.share();
  const { host } = claude;
  await expect(host.locator('[data-share-pop][data-open]')).toBeVisible();
  await expect(chip(host, 'Team')).toHaveText('Team 3');

  await editList(panel, 'Team', () => ({ name: 'Core team' }));

  await expect.poll(() => texts(host)).toEqual(['Core team 3', 'Design 2']);
});
