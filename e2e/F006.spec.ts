import type { BrowserContext, Frame, Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { FRAME_UUID, openArtifact, openChatArtifact } from './claudePage';
import { openRealPopup } from './realPopup';

// F006: the box comes and goes with claude.ai's Share dialog, wherever the dialog is, and never
// shows up twice or where it doesn't belong.

const BOX = 'artishare-share-lists';
const FIELD = "input[role=combobox][aria-label='Invite people by email']";
const DIALOG = '[data-share-pop][data-open]';

const TEAM = ['a@example.com', 'b@example.com', 'c@example.com'];

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

const box = (host: Frame) => host.locator(BOX);
const chip = (host: Frame, name: string) => box(host).getByRole('button', { name: new RegExp(`^${name},`) });
const field = (host: Frame) => host.locator(FIELD);

/** Problems the page itself reports: uncaught errors and console errors (a 404 for a favicon isn't one). */
function watchErrors(page: Page) {
  const problems: string[] = [];
  page.on('pageerror', (error) => problems.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().includes('Failed to load resource')) {
      problems.push(message.text());
    }
  });

  return problems;
}

async function openShare(context: BrowserContext) {
  const claude = await openArtifact(context);
  await claude.share();
  await expect(claude.host.locator(DIALOG)).toBeVisible();

  return claude;
}

test('Close, Escape and a click outside each take the box away, and Share again gives one fresh box', async ({
  context,
  panel,
}) => {
  await saveList(panel, 'Team', TEAM);
  const { page, host, share } = await openShare(context);
  await expect(box(host)).toHaveCount(1);

  const closers: [string, () => Promise<unknown>][] = [
    ['Close', () => host.getByRole('button', { name: 'Close' }).click()],
    ['Escape', () => page.keyboard.press('Escape')],
    ['a click outside', () => page.mouse.click(5, 300)],
  ];
  for (const [how, close] of closers) {
    // Something is picked, to see that a reopened dialog starts without it.
    await chip(host, 'Team').click();
    await expect(field(host)).toHaveValue(TEAM.join(', '));
    if (how === 'Escape') await host.locator(DIALOG).focus();
    await close();
    await expect(box(host), `the box goes after ${how}`).toHaveCount(0);
    await expect(host.locator('[data-share-pop]')).toHaveCount(0);

    await share();
    await expect(host.locator(DIALOG)).toBeVisible();
    await expect(box(host), `one box after reopening following ${how}`).toHaveCount(1);
    await expect(field(host)).toHaveValue('');
    await expect(chip(host, 'Team')).toHaveAttribute('aria-pressed', 'false');
  }
});

test('opening Share again while the old dialog is still leaving never shows two boxes', async ({
  context,
  panel,
}) => {
  await saveList(panel, 'Team', TEAM);
  const { host } = await openShare(context);
  await expect(box(host)).toHaveCount(1);
  const counts = await host.evaluate(async () => {
    const seen: number[] = [];
    window.__standIn.close();
    window.__standIn.open();
    for (let i = 0; i < 12; i++) {
      seen.push(document.querySelectorAll('artishare-share-lists').length);
      await new Promise((resolve) => setTimeout(resolve, 25));
    }

    return seen;
  });
  expect(Math.max(...counts)).toBeLessThanOrEqual(1);
  await expect(box(host)).toHaveCount(1);
});

test('Export hides the box with the invite field, and Share brings it back with what was picked', async ({
  context,
  panel,
}) => {
  await saveList(panel, 'Team', TEAM);
  const { host } = await openShare(context);
  await chip(host, 'Team').click();
  await expect(field(host)).toHaveValue(TEAM.join(', '));

  await host.getByRole('radio', { name: 'Export' }).click();
  await expect(box(host)).toBeHidden();
  await expect(host.getByText('Download this artifact')).toBeVisible();

  await host.getByRole('radio', { name: 'Share' }).click();
  await expect(box(host)).toBeVisible();
  await expect(box(host)).toHaveCount(1);
  await expect(chip(host, 'Team')).toHaveAttribute('aria-pressed', 'true');
  await expect(field(host)).toHaveValue(TEAM.join(', '));
});

test('when claude.ai re-renders the invite area the box is back in the same place, once, with the picked state from the field', async ({
  context,
  panel,
}) => {
  await saveList(panel, 'Team', TEAM);
  await saveList(panel, 'Design', ['x@example.com']);
  const { host } = await openShare(context);
  await chip(host, 'Team').click();
  await expect(chip(host, 'Team')).toHaveAttribute('aria-pressed', 'true');

  // The old entry is thrown away: a box still attached to it must not be kept.
  await host.evaluate(() => {
    (window as unknown as { oldEntry: Element }).oldEntry = document.querySelector('[data-share-entry]')!;
    window.__standIn.rerenderPinned();
  });
  expect(await host.evaluate(() => (window as unknown as { oldEntry: Element }).oldEntry.isConnected)).toBe(
    false,
  );

  await expect(box(host)).toHaveCount(1);
  await expect(
    host.locator('[data-share-pinned] > [data-share-entry] + artishare-share-lists'),
    'right after the invite field, as before',
  ).toHaveCount(1);
  await expect(chip(host, 'Team')).toHaveAttribute('aria-pressed', 'true');
  await expect(chip(host, 'Design')).toHaveAttribute('aria-pressed', 'false');
  await expect(field(host)).toHaveValue(TEAM.join(', '));

  // And it still works, on the new field.
  await chip(host, 'Design').click();
  await expect(field(host)).toHaveValue([...TEAM, 'x@example.com'].join(', '));

  // Again and again: never two.
  for (let i = 0; i < 3; i++) await host.evaluate(() => window.__standIn.rerenderPinned());
  await expect(box(host)).toHaveCount(1);
  await expect(chip(host, 'Design')).toHaveAttribute('aria-pressed', 'true');
});

test('the dialog in the top frame (an artifact beside a chat) gets the box too, and it comes and goes', async ({
  context,
  panel,
}) => {
  await saveList(panel, 'Team', TEAM);
  const { page, host, share } = await openChatArtifact(context);
  await expect(box(host)).toHaveCount(0);

  await share();
  await expect(host.locator(DIALOG)).toBeVisible();
  await expect(box(host)).toHaveCount(1);
  await expect(chip(host, 'Team')).toBeVisible();
  await chip(host, 'Team').click();
  await expect(field(host)).toHaveValue(TEAM.join(', '));
  await expect(chip(host, 'Team')).toHaveAttribute('aria-pressed', 'true');

  await host.evaluate(() => window.__standIn.rerenderPinned());
  await expect(box(host)).toHaveCount(1);
  await expect(chip(host, 'Team')).toHaveAttribute('aria-pressed', 'true');

  await host.getByRole('button', { name: 'Close' }).click();
  await expect(box(host)).toHaveCount(0);
  await share();
  await expect(box(host)).toHaveCount(1);
  await expect(field(host)).toHaveValue('');
  expect(page.frames()).toHaveLength(1);
});

test('a Share dialog without an invite field gets no box and no error', async ({ context, panel }) => {
  await saveList(panel, 'Team', TEAM);
  const claude = await openArtifact(context, { noInvite: true });
  const problems = watchErrors(claude.page);
  await claude.share();
  await expect(claude.host.locator(DIALOG)).toBeVisible();
  await claude.page.waitForTimeout(500);
  await expect(box(claude.host)).toHaveCount(0);
  await expect(claude.host.locator(FIELD)).toHaveCount(0);

  // Re-rendering (nothing to re-render here) and closing are also quiet.
  await claude.host.evaluate(() => window.__standIn.rerenderPinned());
  await claude.host.getByRole('button', { name: 'Close' }).click();
  await expect(claude.host.locator('[data-share-pop]')).toHaveCount(0);
  expect(problems).toEqual([]);

  // The top-frame variant is the same.
  const chat = await openChatArtifact(context, { noInvite: true });
  const chatProblems = watchErrors(chat.page);
  await chat.share();
  await expect(chat.host.locator(DIALOG)).toBeVisible();
  await chat.page.waitForTimeout(500);
  await expect(box(chat.host)).toHaveCount(0);
  expect(chatProblems).toEqual([]);
});

test('pages without the dialog, and other dialogs, get no box', async ({ context, panel }) => {
  await saveList(panel, 'Team', TEAM);
  const { page, host, share } = await openChatArtifact(context);
  const problems = watchErrors(page);
  await page.waitForTimeout(300);
  await expect(box(host)).toHaveCount(0);

  // Some other dialog, in claude.ai's portal, that happens to have a text field of its own: an
  // invite-looking field outside the Share dialog's pinned area is not ours to decorate either.
  await host.evaluate(() => {
    const portal = document.createElement('div');
    portal.setAttribute('data-base-ui-portal', '');
    portal.id = 'other-dialog';
    portal.innerHTML = `
      <div role="dialog" aria-label="Rename">
        <input type="text" role="combobox" aria-label="Invite people by email" />
        <div data-share-entry><input type="text" aria-label="Name" /></div>
      </div>`;
    document.body.append(portal);
  });
  await page.waitForTimeout(300);
  await expect(box(host)).toHaveCount(0);
  await host.evaluate(() => document.getElementById('other-dialog')!.remove());

  // The real one still works afterwards.
  await share();
  await expect(box(host)).toHaveCount(1);
  expect(problems).toEqual([]);
});

test('moving to another artifact in the same tab, without a reload, still gives one working box', async ({
  context,
  panel,
}) => {
  await saveList(panel, 'Team', TEAM);
  const { page, host, share } = await openChatArtifact(context);
  await host.evaluate(() => {
    (window as unknown as { sameDocument: boolean }).sameDocument = true;
  });
  await share();
  await expect(box(host)).toHaveCount(1);
  await chip(host, 'Team').click();
  await expect(field(host)).toHaveValue(TEAM.join(', '));

  // The route changes while the dialog is open: the dialog goes, and so does the box.
  await host.evaluate(
    (uuid) => window.__standIn.navigate(`/chat/StandInChat02?artifact=${uuid}-2`),
    FRAME_UUID,
  );
  expect(page.url()).toContain('/chat/StandInChat02');
  expect(await host.evaluate(() => (window as unknown as { sameDocument?: boolean }).sameDocument)).toBe(
    true,
  );
  await expect(box(host)).toHaveCount(0);

  await share();
  await expect(host.locator(DIALOG)).toBeVisible();
  await expect(box(host)).toHaveCount(1);
  await expect(field(host)).toHaveValue('');
  await expect(chip(host, 'Team')).toHaveAttribute('aria-pressed', 'false');
  await chip(host, 'Team').click();
  await expect(field(host)).toHaveValue(TEAM.join(', '));
  await expect(host.locator('[role=listbox] [role=option][data-invite-email]')).toContainText(
    'Invite 3 people',
  );
});

test('moving to another artifact inside the artifact iframe works the same', async ({ context, panel }) => {
  await saveList(panel, 'Team', TEAM);
  const { page, host, share } = await openArtifact(context);
  await share();
  await expect(box(host)).toHaveCount(1);

  await host.evaluate((uuid) => window.__standIn.navigate(`/code/artifact/${uuid}-2`), FRAME_UUID);
  await expect(box(host)).toHaveCount(0);
  expect(host.url()).toContain(`${FRAME_UUID}-2`);

  await share();
  await expect(host.locator(DIALOG)).toBeVisible();
  await expect(box(host)).toHaveCount(1);
  await chip(host, 'Team').click();
  await expect(field(host)).toHaveValue(TEAM.join(', '));
  expect(page.frames()).toHaveLength(2);
});

test('the ArtiShare popup opens over the same tab while the dialog is open, and the box keeps working', async ({
  context,
  panel,
}) => {
  await saveList(panel, 'Team', TEAM);
  await saveList(panel, 'Design', ['x@example.com']);
  const { page, host } = await openShare(context);
  await chip(host, 'Team').click();
  await expect(field(host)).toHaveValue(TEAM.join(', '));

  // The panel tab is popup.html too; move it off so the only popup.html target is the real popup.
  await panel.goto('about:blank');
  await page.bringToFront();
  const evaluate = await openRealPopup(context);
  await expect
    .poll(() => evaluate(`document.querySelector('h1, h2, [role=heading]')?.textContent ?? ''`))
    .toContain('ArtiShare');
  // The popup shows what it always did: its tabs and the saved lists.
  await expect.poll(() => evaluate(`document.body.innerText.includes('Team')`)).toBe(true);

  // The dialog and the box are still there, once, as the popup left them.
  await expect(box(host)).toHaveCount(1);
  await expect(chip(host, 'Team')).toHaveAttribute('aria-pressed', 'true');

  // After the popup is gone (a press in the page closes it), the box still works.
  await page.bringToFront();
  await chip(host, 'Design').click();
  await expect(field(host)).toHaveValue([...TEAM, 'x@example.com'].join(', '));
  await expect(box(host)).toHaveCount(1);
});
