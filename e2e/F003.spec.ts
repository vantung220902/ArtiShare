import type { BrowserContext, Frame, Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { openArtifact, openChatArtifact } from './claudePage';

// F003: clicking a list's chip puts its addresses in claude.ai's invite field. The box never
// chooses claude.ai's own Invite option: that stays with the person.

const BOX = 'artishare-share-lists';
const FIELD = "input[role=combobox][aria-label='Invite people by email']";
const OPTION = '[role=listbox] [role=option][data-invite-email]';

type SavedList = { id: string; name: string; emails: string[]; access: 'view' };

/** Saves a list through the background, as the Lists tab does. */
async function saveList(page: Page, name: string, emails: string[], replacing?: SavedList) {
  const list: SavedList = { id: replacing?.id ?? crypto.randomUUID(), name, emails, access: 'view' };
  await page.evaluate(
    async (args) => {
      const reply = (await chrome.runtime.sendMessage({
        type: 'config-change',
        change: { type: 'save-list', list: args.list, expected: args.replacing ?? null },
      })) as { ok: boolean; error?: string };
      if (!reply.ok) throw new Error(reply.error);
    },
    { list, replacing },
  );

  return list;
}

async function openShare(context: BrowserContext, open = openArtifact) {
  const claude = await open(context);
  await claude.share();
  await expect(claude.host.locator('[data-share-pop][data-open]')).toBeVisible();

  return claude;
}

const box = (host: Frame) => host.locator(BOX);
const chip = (host: Frame, name: string) => box(host).getByRole('button', { name: new RegExp(`^${name},`) });
const status = (host: Frame) => box(host).getByRole('status');

test('clicking Team fills the field in the list’s order, focuses it, and claude.ai offers Invite 3 people', async ({
  context,
  panel,
}) => {
  await saveList(panel, 'Team', ['a@example.com', 'b@example.com', 'c@example.com']);
  const { host } = await openShare(context);
  await expect(chip(host, 'Team')).toHaveAttribute('aria-pressed', 'false');
  await expect(host.locator(OPTION)).toHaveCount(0);

  await box(host).getByRole('button', { name: 'Team, 3 people' }).click();

  const field = host.locator(FIELD);
  await expect(field).toHaveValue('a@example.com, b@example.com, c@example.com');
  await expect(field).toBeFocused();
  // The caret is at the end, so typing carries on after the last address.
  const end = 'a@example.com, b@example.com, c@example.com'.length;
  expect(await field.evaluate((el: HTMLInputElement) => [el.selectionStart, el.selectionEnd])).toEqual([
    end,
    end,
  ]);
  await expect(chip(host, 'Team')).toHaveAttribute('aria-pressed', 'true');

  // claude.ai's own state took the value: its option appeared, which a DOM-only change wouldn't do.
  const option = host.locator(OPTION);
  await expect(option).toHaveCount(1);
  await expect(option).toContainText('Invite 3 people');
  for (const email of ['a@example.com', 'b@example.com', 'c@example.com'])
    await expect(option).toContainText(email);
});

test('the live region says how many addresses were added', async ({ context, panel }) => {
  await saveList(panel, 'Team', ['a@example.com', 'b@example.com', 'c@example.com']);
  await saveList(panel, 'Solo', ['solo@example.com']);
  const { host } = await openShare(context);
  await expect(status(host)).toHaveText('');
  await expect(status(host)).toHaveAttribute('aria-live', 'polite');

  await chip(host, 'Team').click();
  await expect(status(host)).toHaveText('3 addresses added. Choose Invite 3 people to invite them.');
  await chip(host, 'Solo').click();
  // A second list joins what is there (F004 covers the merge in full).
  await expect(host.locator(FIELD)).toHaveValue(
    'a@example.com, b@example.com, c@example.com, solo@example.com',
  );
  await expect(status(host)).toHaveText('1 address added. Choose Invite 4 people to invite them.');
});

test('the box never chooses Invite and starts no run', async ({ context, panel }) => {
  await saveList(panel, 'Team', ['a@example.com', 'b@example.com', 'c@example.com']);
  const { host, page } = await openShare(context);
  await chip(host, 'Team').click();
  await expect(host.locator(OPTION)).toContainText('Invite 3 people');
  // Give anything that would send on its own time to do it.
  await page.waitForTimeout(500);
  expect(await host.evaluate(() => window.__standIn.invited)).toEqual([]);
  await expect(host.locator(FIELD)).toHaveValue('a@example.com, b@example.com, c@example.com');

  // No ArtiShare run: nothing in storage, and the popup's Share tab has none.
  expect(await panel.evaluate(async () => (await chrome.storage.local.get('run')).run ?? null)).toBeNull();
  await panel.reload();
  await panel.getByRole('tab', { name: 'Share' }).click();
  await expect(panel.getByRole('tabpanel', { name: 'Share' })).toBeVisible();
  await expect(panel.locator('.progress')).toHaveCount(0);

  // The person chooses claude.ai's option: only then is it recorded.
  await host.locator(OPTION).click();
  expect(await host.evaluate(() => window.__standIn.invited)).toEqual([
    { emails: ['a@example.com', 'b@example.com', 'c@example.com'] },
  ]);
});

test('an address already invited is left out by claude.ai, not by the box', async ({ context, panel }) => {
  const team = await saveList(panel, 'Team', ['a@example.com', 'b@example.com', 'c@example.com']);
  const { host } = await openShare(context);
  await chip(host, 'Team').click();
  await expect(host.locator(FIELD)).toHaveValue('a@example.com, b@example.com, c@example.com');
  await expect(host.locator(OPTION)).toContainText('Invite 3 people');

  // viewer@example.com joins Team while the dialog is open; the chip follows, and clicking it again
  // replaces what is in the field.
  await saveList(
    panel,
    'Team',
    ['a@example.com', 'b@example.com', 'c@example.com', 'viewer@example.com'],
    team,
  );
  await expect(box(host).getByRole('button', { name: 'Team, 4 people' })).toBeVisible();
  await chip(host, 'Team').click();
  await expect(host.locator(FIELD)).toHaveValue(
    'a@example.com, b@example.com, c@example.com, viewer@example.com',
  );
  const option = host.locator(OPTION);
  await expect(option).toContainText('Invite 3 people');
  await expect(option).not.toContainText('viewer@example.com');
  expect(await host.evaluate(() => window.__standIn.invited)).toEqual([]);
});

test('the same inbox in a list is written once', async ({ context, panel }) => {
  await saveList(panel, 'Team', ['A.B@gmail.com', 'a.b+x@gmail.com', 'c@example.com']);
  const { host } = await openShare(context);
  await chip(host, 'Team').click();
  await expect(host.locator(FIELD)).toHaveValue('A.B@gmail.com, c@example.com');
  await expect(status(host)).toHaveText('2 addresses added. Choose Invite 2 people to invite them.');
});

test('clicking a chip works from the keyboard', async ({ context, panel }) => {
  await saveList(panel, 'Team', ['a@example.com', 'b@example.com']);
  const { host } = await openShare(context);
  await chip(host, 'Team').focus();
  await host.page().keyboard.press('Enter');
  await expect(host.locator(FIELD)).toHaveValue('a@example.com, b@example.com');
  await expect(host.locator(OPTION)).toContainText('Invite 2 people');
});

test('clicking a chip does not close claude.ai’s dialog, and works in a chat page too', async ({
  context,
  panel,
}) => {
  await saveList(panel, 'Team', ['a@example.com', 'b@example.com']);
  const { host } = await openShare(context, openChatArtifact);
  await chip(host, 'Team').click();
  await expect(host.locator('[data-share-pop][data-open]')).toBeVisible();
  await expect(host.locator(FIELD)).toHaveValue('a@example.com, b@example.com');
  await expect(host.locator(OPTION)).toContainText('Invite 2 people');
  expect(await host.evaluate(() => window.__standIn.invited)).toEqual([]);
});

test('the field is filled in the fake build only through the browser’s own setter (the tracker ignores plain assignment)', async ({
  context,
  panel,
}) => {
  await saveList(panel, 'Team', ['a@example.com', 'b@example.com']);
  const { host } = await openShare(context);
  // Proof the stand-in would have refused a plain assignment: the option only appears through the setter.
  await host.locator(FIELD).evaluate((el: HTMLInputElement) => {
    el.value = 'plain@example.com';
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await expect(host.locator(OPTION)).toHaveCount(0);
  // Empty the field again so the click starts from nothing (the box keeps what is in the field).
  await host.locator(FIELD).evaluate((el: HTMLInputElement) => {
    el.value = '';
  });
  await chip(host, 'Team').click();
  await expect(host.locator(OPTION)).toContainText('Invite 2 people');
});
