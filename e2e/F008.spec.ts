import type { BrowserContext, Frame, Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { openArtifact } from './claudePage';

// F008: the box says something useful with no lists, with a list that has nobody in it, when
// everything is already in the field, and when the field held addresses before the box loaded.

const BOX = 'artishare-share-lists';
const FIELD = "input[role=combobox][aria-label='Invite people by email']";

const TEAM = ['a@example.com', 'b@example.com', 'c@example.com'];
const DESIGN = ['c@example.com', 'd@example.com'];

/** Saved lists written the way an import that replaces them leaves them: a whole new set. */
const writeLists = (page: Page, lists: { name: string; emails: string[] }[]) =>
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

test('with no saved lists the box says so and shows no search field', async ({ context }) => {
  const { host } = await openShare(context);

  await expect(box(host)).toHaveCount(1);
  await expect(box(host).getByRole('group', { name: 'ArtiShare lists' })).toBeVisible();
  await expect(box(host)).toContainText("No saved lists yet. Make one in ArtiShare's Lists tab.");
  await expect(box(host).locator('.chip')).toHaveCount(0);
  await expect(search(host)).toHaveCount(0);
  // claude.ai's own field is untouched and still works.
  await field(host).fill('x@example.com');
  await expect(host.getByRole('option', { name: /Invite x@example\.com/ })).toBeVisible();
});

test('a list with no addresses reads Empty 0, can’t be picked, stays focusable and explains itself', async ({
  context,
  panel,
}) => {
  await writeLists(panel, [
    { name: 'Empty', emails: [] },
    { name: 'Team', emails: TEAM },
  ]);
  const { host } = await openShare(context);
  const empty = chip(host, 'Empty');

  await expect(empty).toHaveText('Empty 0');
  await expect(empty).toHaveAccessibleName('Empty, 0 people');
  await expect(empty).toHaveAttribute('aria-disabled', 'true');
  await expect(empty).toHaveAttribute('title', 'This list has no addresses.');
  // Not the `disabled` attribute, which would take it out of the Tab order.
  await expect(empty).not.toHaveJSProperty('disabled', true);
  await empty.focus();
  await expect(empty).toBeFocused();

  // Playwright treats aria-disabled as not clickable, so the click is forced.
  await empty.click({ force: true });
  await expect(field(host)).toHaveValue('');
  await expect(empty).toHaveAttribute('aria-pressed', 'false');
  await expect(box(host).locator('output')).toHaveText('');
  // The click does nothing to the field even when it has something in it.
  await chip(host, 'Team').click();
  await empty.click({ force: true });
  await expect(field(host)).toHaveValue(TEAM.join(', '));
  await expect(empty).toHaveAttribute('aria-pressed', 'false');
  // The other chips still work.
  await expect(chip(host, 'Team')).toHaveAttribute('aria-pressed', 'true');
  expect(await invited(host)).toEqual([]);
});

test('an empty list found by search can’t be picked either', async ({ context, panel }) => {
  await writeLists(panel, [{ name: 'Empty', emails: [] }]);
  const { host } = await openShare(context);

  await search(host).fill('empty');
  const row = box(host).locator('.result');

  await expect(row).toHaveText(/^Empty · 0 people$/);
  await expect(row).toHaveAttribute('aria-disabled', 'true');
  await expect(row).toHaveAttribute('title', 'This list has no addresses.');
  await row.click({ force: true });
  await expect(field(host)).toHaveValue('');
});

test('a list becomes pickable once it has addresses', async ({ context, panel }) => {
  await writeLists(panel, [{ name: 'Empty', emails: [] }]);
  const { host } = await openShare(context);
  await expect(chip(host, 'Empty')).toHaveAttribute('aria-disabled', 'true');

  await writeLists(panel, [{ name: 'Empty', emails: ['n@example.com'] }]);

  await expect(chip(host, 'Empty')).toHaveText('Empty 1');
  await expect(chip(host, 'Empty')).not.toHaveAttribute('aria-disabled', 'true');
  await chip(host, 'Empty').click();
  await expect(field(host)).toHaveValue('n@example.com');
});

test('when every address of every list is in the field all chips are picked and one unpicks as usual', async ({
  context,
  panel,
}) => {
  await writeLists(panel, [
    { name: 'Team', emails: TEAM },
    { name: 'Design', emails: DESIGN },
  ]);
  const { host } = await openShare(context);

  await chip(host, 'Team').click();
  await chip(host, 'Design').click();

  await expect(field(host)).toHaveValue('a@example.com, b@example.com, c@example.com, d@example.com');
  await expect(chip(host, 'Team')).toHaveAttribute('aria-pressed', 'true');
  await expect(chip(host, 'Design')).toHaveAttribute('aria-pressed', 'true');

  // Design goes; c@ stays because Team still has it.
  await chip(host, 'Design').click();

  await expect(field(host)).toHaveValue('a@example.com, b@example.com, c@example.com');
  await expect(chip(host, 'Design')).toHaveAttribute('aria-pressed', 'false');
  await expect(chip(host, 'Team')).toHaveAttribute('aria-pressed', 'true');

  await chip(host, 'Team').click();
  await expect(field(host)).toHaveValue('');
  await expect(chip(host, 'Team')).toHaveAttribute('aria-pressed', 'false');
});

test('every address typed by hand shows both chips picked, and a chip unpicks as usual', async ({
  context,
  panel,
}) => {
  await writeLists(panel, [
    { name: 'Team', emails: TEAM },
    { name: 'Design', emails: DESIGN },
  ]);
  const { host } = await openShare(context);

  await field(host).fill('a@example.com, b@example.com, c@example.com, d@example.com');

  await expect(chip(host, 'Team')).toHaveAttribute('aria-pressed', 'true');
  await expect(chip(host, 'Design')).toHaveAttribute('aria-pressed', 'true');
  await chip(host, 'Team').click();
  await expect(field(host)).toHaveValue('c@example.com, d@example.com');
  await expect(chip(host, 'Team')).toHaveAttribute('aria-pressed', 'false');
  await expect(chip(host, 'Design')).toHaveAttribute('aria-pressed', 'true');
});

test('a field that already holds Team’s addresses shows Team as picked as soon as the box appears', async ({
  context,
  panel,
}) => {
  await writeLists(panel, [
    { name: 'Team', emails: TEAM },
    { name: 'Design', emails: DESIGN },
  ]);
  const { host } = await openShare(context);
  await field(host).fill(TEAM.join(', '));
  await expect(chip(host, 'Team')).toHaveAttribute('aria-pressed', 'true');

  // claude.ai re-renders the invite area: the box is built again around a field that already
  // has the addresses, as if they had been typed before the box loaded.
  await host.evaluate(() => {
    document.querySelector('artishare-share-lists')?.remove();
    window.__standIn.rerenderPinned();
  });

  await expect(box(host)).toHaveCount(1);
  await expect(chip(host, 'Team')).toHaveAttribute('aria-pressed', 'true');
  await expect(chip(host, 'Design')).toHaveAttribute('aria-pressed', 'false');
  await expect(field(host)).toHaveValue(TEAM.join(', '));
  // Clicking Team takes it out as usual.
  await chip(host, 'Team').click();
  await expect(field(host)).toHaveValue('');
});

test('addresses typed in the moment the dialog opens are picked up when the box loads', async ({
  context,
  panel,
}) => {
  await writeLists(panel, [{ name: 'Team', emails: TEAM }]);
  const { host } = await openArtifact(context);

  // Open the dialog and fill the field in one go, before the box has had time to read the lists.
  await host.evaluate(
    ({ selector, text }) => {
      window.__standIn.open();
      const input = document.querySelector<HTMLInputElement>(selector)!;
      const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!;
      descriptor.set!.call(input, text);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    },
    { selector: FIELD, text: TEAM.join(', ') },
  );

  await expect(field(host)).toHaveValue(TEAM.join(', '));
  await expect(chip(host, 'Team')).toHaveAttribute('aria-pressed', 'true');
});
