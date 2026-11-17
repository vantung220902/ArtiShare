import type { BrowserContext, Frame, Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { openArtifact } from './claudePage';

// F004: several lists can be picked and unpicked, what the person typed is kept, and the picked
// state always follows the field's text.

const BOX = 'artishare-share-lists';
const FIELD = "input[role=combobox][aria-label='Invite people by email']";
const OPTION = '[role=listbox] [role=option][data-invite-email]';

const TEAM = ['a@example.com', 'b@example.com', 'c@example.com'];
const DESIGN = ['c@example.com', 'd@example.com'];

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

async function openShare(context: BrowserContext) {
  const claude = await openArtifact(context);
  await claude.share();
  await expect(claude.host.locator('[data-share-pop][data-open]')).toBeVisible();

  return claude;
}

const box = (host: Frame) => host.locator(BOX);
const chip = (host: Frame, name: string) => box(host).getByRole('button', { name: new RegExp(`^${name},`) });
const field = (host: Frame) => host.locator(FIELD);

/** What typing does to a React-controlled field: the native setter and a bubbling input event. */
const type = (host: Frame, value: string) =>
  host.evaluate((text) => {
    const input = document.querySelector<HTMLInputElement>('input[role=combobox]')!;
    const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
    descriptor?.set?.call(input, text);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);

const paste = (host: Frame, text: string) =>
  host.evaluate((pasted) => {
    const input = document.querySelector<HTMLInputElement>('input[role=combobox]')!;
    const data = new DataTransfer();
    data.setData('text/plain', pasted);
    input.dispatchEvent(
      new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }),
    );
  }, text);

async function twoLists(panel: Page) {
  await saveList(panel, 'Team', TEAM);
  await saveList(panel, 'Design', DESIGN);
}

test('two lists combine: c only once, both picked, claude.ai offers Invite 4 people', async ({
  context,
  panel,
}) => {
  await twoLists(panel);
  const { host } = await openShare(context);
  await chip(host, 'Team').click();
  await chip(host, 'Design').click();

  await expect(field(host)).toHaveValue('a@example.com, b@example.com, c@example.com, d@example.com');
  await expect(chip(host, 'Team')).toHaveAttribute('aria-pressed', 'true');
  await expect(chip(host, 'Design')).toHaveAttribute('aria-pressed', 'true');
  await expect(host.locator(OPTION)).toContainText('Invite 4 people');
  await expect(box(host).getByRole('status')).toHaveText(
    '1 address added. Choose Invite 4 people to invite them.',
  );
  expect(await host.evaluate(() => window.__standIn.invited)).toEqual([]);
});

test('the same inbox counts once across lists', async ({ context, panel }) => {
  await saveList(panel, 'Team', ['A.B@gmail.com', 'a@example.com']);
  await saveList(panel, 'Design', ['a.b+design@gmail.com', 'd@example.com']);
  const { host } = await openShare(context);
  await chip(host, 'Team').click();
  await chip(host, 'Design').click();
  await expect(field(host)).toHaveValue('A.B@gmail.com, a@example.com, d@example.com');
  // The second list is picked all the same: its inbox is in the field.
  await expect(chip(host, 'Design')).toHaveAttribute('aria-pressed', 'true');
});

test('clicking Team again takes out a and b, keeps c and d for Design, and unpicks Team', async ({
  context,
  panel,
}) => {
  await twoLists(panel);
  const { host } = await openShare(context);
  await chip(host, 'Team').click();
  await chip(host, 'Design').click();
  await chip(host, 'Team').click();

  await expect(field(host)).toHaveValue('c@example.com, d@example.com');
  await expect(chip(host, 'Team')).toHaveAttribute('aria-pressed', 'false');
  await expect(chip(host, 'Design')).toHaveAttribute('aria-pressed', 'true');
  await expect(host.locator(OPTION)).toContainText('Invite 2 people');
  await expect(box(host).getByRole('status')).toHaveText(
    '2 addresses removed. Choose Invite 2 people to invite them.',
  );

  // Unpicking the last one empties the field and removes claude.ai's option.
  await chip(host, 'Design').click();
  await expect(field(host)).toHaveValue('');
  await expect(host.locator(OPTION)).toHaveCount(0);
  await expect(box(host).getByRole('status')).toHaveText('2 addresses removed.');
  await expect(chip(host, 'Design')).toHaveAttribute('aria-pressed', 'false');
});

test('what was typed by hand stays, when picking and when unpicking', async ({ context, panel }) => {
  await twoLists(panel);
  const { host } = await openShare(context);
  await type(host, 'x@example.com');
  await chip(host, 'Team').click();
  await expect(field(host)).toHaveValue('x@example.com, a@example.com, b@example.com, c@example.com');
  await expect(host.locator(OPTION)).toContainText('Invite 4 people');

  await chip(host, 'Team').click();
  await expect(field(host)).toHaveValue('x@example.com');
  await expect(host.locator(OPTION)).toContainText('Invite x@example.com');
  await expect(chip(host, 'Team')).toHaveAttribute('aria-pressed', 'false');
});

test('an unfinished entry moves to the end and the box says why Invite is missing, until it is fixed', async ({
  context,
  panel,
}) => {
  await twoLists(panel);
  const { host } = await openShare(context);
  await type(host, 'ali');
  // Just typing: the box has nothing to say yet.
  await expect(box(host).getByText('claude.ai offers Invite only')).toHaveCount(0);

  await chip(host, 'Team').click();
  await expect(field(host)).toHaveValue('a@example.com, b@example.com, c@example.com, ali');
  const note = 'claude.ai offers Invite only when every entry is a full address. Finish or remove "ali".';
  await expect(box(host).locator('.note')).toHaveText(note);
  // claude.ai agrees: with 'ali' in the field it offers nothing.
  await expect(host.locator(OPTION)).toHaveCount(0);
  await expect(box(host).getByRole('status')).toHaveText(`3 addresses added. ${note}`);

  await type(host, 'a@example.com, b@example.com, c@example.com');
  await expect(box(host).locator('.note')).toHaveCount(0);
  await expect(host.locator(OPTION)).toContainText('Invite 3 people');
});

test('picked follows the field: deleting an address, pasting, and clearing', async ({ context, panel }) => {
  await twoLists(panel);
  const { host } = await openShare(context);
  await chip(host, 'Team').click();
  await expect(chip(host, 'Team')).toHaveAttribute('aria-pressed', 'true');

  // Delete b@ by hand.
  await type(host, 'a@example.com, c@example.com');
  await expect(chip(host, 'Team')).toHaveAttribute('aria-pressed', 'false');
  await expect(chip(host, 'Design')).toHaveAttribute('aria-pressed', 'false');

  // Paste all of Team's addresses in: claude.ai cancels a paste and sets the value, so there is no input event.
  await type(host, '');
  await expect(chip(host, 'Team')).toHaveAttribute('aria-pressed', 'false');
  await paste(host, 'a@example.com, b@example.com, c@example.com');
  await expect(chip(host, 'Team')).toHaveAttribute('aria-pressed', 'true');
  await expect(chip(host, 'Design')).toHaveAttribute('aria-pressed', 'false');

  // Clear the field: nothing is picked.
  await type(host, '');
  await expect(chip(host, 'Team')).toHaveAttribute('aria-pressed', 'false');
  await expect(chip(host, 'Design')).toHaveAttribute('aria-pressed', 'false');
});

test('after claude.ai clears the field on Invite, the chips are unpicked and a click starts afresh', async ({
  context,
  panel,
}) => {
  await twoLists(panel);
  const { host } = await openShare(context);
  await chip(host, 'Team').click();
  await host.locator(OPTION).click();
  expect(await host.evaluate(() => window.__standIn.invited)).toHaveLength(1);
  await expect(field(host)).toHaveValue('');

  // The stand-in clears the field without an input event, as claude.ai does: the click reads the
  // field itself, so Team is added again rather than "unpicked" from an empty field.
  await chip(host, 'Team').click();
  await expect(field(host)).toHaveValue('a@example.com, b@example.com, c@example.com');
  await expect(chip(host, 'Team')).toHaveAttribute('aria-pressed', 'true');
});
