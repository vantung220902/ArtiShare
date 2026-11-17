import type { BrowserContext, Frame, Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { openArtifact } from './claudePage';

// F005: search the saved lists and the people in them from the box, and add one person or one list
// from the results.

const BOX = 'artishare-share-lists';
const FIELD = "input[role=combobox][aria-label='Invite people by email']";

const TEAM = ['alice@example.com', 'bob@example.com'];
const DESIGN = ['alice@example.com', 'dana@example.com'];

async function saveList(page: Page, name: string, emails: string[]) {
  const list = { id: crypto.randomUUID(), name, emails, access: 'view' };
  await page.evaluate(async (saved) => {
    const reply = (await chrome.runtime.sendMessage({
      type: 'config-change',
      change: { type: 'save-list', list: saved, expected: null },
    })) as { ok: boolean; error?: string };
    if (!reply.ok) throw new Error(reply.error);
  }, list);
}

async function twoLists(panel: Page) {
  await saveList(panel, 'Team', TEAM);
  await saveList(panel, 'Design', DESIGN);
}

async function openShare(context: BrowserContext) {
  const claude = await openArtifact(context);
  await claude.share();
  await expect(claude.host.locator('[data-share-pop][data-open]')).toBeVisible();

  return claude;
}

const box = (host: Frame) => host.locator(BOX);
const search = (host: Frame) => box(host).getByRole('searchbox', { name: 'Search lists or people' });
const chip = (host: Frame, name: string) => box(host).getByRole('button', { name: new RegExp(`^${name},`) });
const row = (host: Frame, name: string | RegExp) => box(host).locator('.result').filter({ hasText: name });
const field = (host: Frame) => host.locator(FIELD);

/** What typing does to a React-controlled field: the native setter and a bubbling input event. */
const type = (host: Frame, value: string) =>
  host.evaluate((text) => {
    const input = document.querySelector<HTMLInputElement>('input[role=combobox]')!;
    const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
    descriptor?.set?.call(input, text);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);

test('a list name finds the list, and the results replace the chips', async ({ context, panel }) => {
  await twoLists(panel);
  const { host } = await openShare(context);
  await expect(chip(host, 'Team')).toBeVisible();

  await search(host).fill('des');

  await expect(box(host).locator('.result')).toHaveCount(1);
  await expect(row(host, 'Design')).toHaveText('Design · 2 people');
  await expect(box(host).locator('.chip')).toHaveCount(0);
  await expect(box(host).locator('.chips')).toHaveCount(0);
});

test('a person is found once with their lists, and case is ignored', async ({ context, panel }) => {
  await twoLists(panel);
  const { host } = await openShare(context);

  await search(host).fill('alice');
  await expect(box(host).locator('.result')).toHaveCount(1);
  await expect(row(host, 'alice@example.com')).toContainText('In Design, Team');
  const lower = await box(host).locator('.results').innerText();

  await search(host).fill('ALICE');
  await expect(box(host).locator('.result')).toHaveCount(1);
  expect(await box(host).locator('.results').innerText()).toBe(lower);
});

test('clicking a person adds only them, after what is there, and clicking again takes them out', async ({
  context,
  panel,
}) => {
  await twoLists(panel);
  const { host } = await openShare(context);
  await type(host, 'zed@example.com');
  await search(host).fill('alice');
  const alice = row(host, 'alice@example.com');
  await expect(alice).toHaveAttribute('aria-pressed', 'false');

  await alice.click();

  await expect(field(host)).toHaveValue('zed@example.com, alice@example.com');
  await expect(alice).toHaveAttribute('aria-pressed', 'true');
  await expect(box(host).getByRole('status')).toHaveText(
    '1 address added. Choose Invite 2 people to invite them.',
  );

  await alice.click();

  await expect(field(host)).toHaveValue('zed@example.com');
  await expect(alice).toHaveAttribute('aria-pressed', 'false');
  // The search text stays: the results are still what the person is looking at.
  await expect(search(host)).toHaveValue('alice');
});

test('a person already in the field shows as picked, and the picked state follows typing', async ({
  context,
  panel,
}) => {
  await twoLists(panel);
  const { host } = await openShare(context);
  await type(host, 'ALICE@example.com');
  await search(host).fill('alice');
  await expect(row(host, 'alice@example.com')).toHaveAttribute('aria-pressed', 'true');

  await type(host, '');
  await expect(row(host, 'alice@example.com')).toHaveAttribute('aria-pressed', 'false');
});

test('a list result does what its chip does, with the same field and message', async ({ context, panel }) => {
  await twoLists(panel);
  const { host } = await openShare(context);
  await chip(host, 'Team').click();
  await expect(field(host)).toHaveValue('alice@example.com, bob@example.com');
  const afterChip = await box(host).getByRole('status').innerText();
  await chip(host, 'Team').click();
  await expect(field(host)).toHaveValue('');

  await search(host).fill('team');
  await row(host, 'Team').click();

  await expect(field(host)).toHaveValue('alice@example.com, bob@example.com');
  await expect(box(host).getByRole('status')).toHaveText(afterChip);
  await expect(row(host, 'Team')).toHaveAttribute('aria-pressed', 'true');
  // Merging with another list, without repeating alice, as the chips do.
  await search(host).fill('design');
  await row(host, 'Design').click();
  await expect(field(host)).toHaveValue('alice@example.com, bob@example.com, dana@example.com');
  await expect(box(host).getByRole('status')).toHaveText(
    '1 address added. Choose Invite 3 people to invite them.',
  );
  // And a click on the picked list takes out its own addresses, keeping what Team still needs.
  await row(host, 'Design').click();
  await expect(field(host)).toHaveValue('alice@example.com, bob@example.com');
  await expect(row(host, 'Design')).toHaveAttribute('aria-pressed', 'false');
});

test('a list and a person can match together, lists first', async ({ context, panel }) => {
  await saveList(panel, 'Dana crew', ['dana@example.com', 'eve@example.com']);
  const { host } = await openShare(context);

  await search(host).fill('dana');

  const rows = box(host).locator('.result');
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toHaveText('Dana crew · 2 people');
  await expect(rows.nth(1)).toContainText('dana@example.com');
  await expect(rows.nth(1)).toContainText('In Dana crew');
});

test('a search nothing matches says so', async ({ context, panel }) => {
  await twoLists(panel);
  const { host } = await openShare(context);

  await search(host).fill('zzz');

  await expect(box(host)).toContainText('No lists or people match "zzz".');
  await expect(box(host).locator('.result')).toHaveCount(0);
  await expect(box(host).locator('.chip')).toHaveCount(0);
});

test('clearing the search with × or by deleting the text brings the chips back, picked ones marked', async ({
  context,
  panel,
}) => {
  await twoLists(panel);
  const { host } = await openShare(context);
  await chip(host, 'Team').click();
  await expect(box(host).getByRole('button', { name: 'Clear search' })).toHaveCount(0);

  await search(host).fill('des');
  await expect(box(host).locator('.chip')).toHaveCount(0);
  await box(host).getByRole('button', { name: 'Clear search' }).click();

  await expect(search(host)).toHaveValue('');
  await expect(box(host).locator('.chip')).toHaveCount(2);
  await expect(chip(host, 'Team')).toHaveAttribute('aria-pressed', 'true');
  await expect(chip(host, 'Design')).toHaveAttribute('aria-pressed', 'false');
  await expect(box(host).getByRole('button', { name: 'Clear search' })).toHaveCount(0);

  await search(host).fill('team');
  await expect(box(host).locator('.chip')).toHaveCount(0);
  await search(host).fill('');
  await expect(box(host).locator('.chip')).toHaveCount(2);
});

test('typing in the search never changes the field, and a click picked up while searching shows on the chips', async ({
  context,
  panel,
}) => {
  await twoLists(panel);
  const { host } = await openShare(context);
  await type(host, 'zed@example.com');

  await search(host).fill('alice');
  await search(host).fill('alice@');
  await search(host).fill('zzz');
  await search(host).fill('');
  await expect(field(host)).toHaveValue('zed@example.com');

  await search(host).fill('dana');
  await row(host, 'dana@example.com').click();
  await search(host).fill('');
  await expect(field(host)).toHaveValue('zed@example.com, dana@example.com');
  // Design isn't picked: alice is missing from the field.
  await expect(chip(host, 'Design')).toHaveAttribute('aria-pressed', 'false');
  expect(await host.evaluate(() => window.__standIn.invited)).toEqual([]);
});

test('a search of spaces only counts as no search', async ({ context, panel }) => {
  await twoLists(panel);
  const { host } = await openShare(context);

  await search(host).fill('   ');

  await expect(box(host).locator('.chip')).toHaveCount(2);
  await expect(box(host).locator('.result')).toHaveCount(0);
});
