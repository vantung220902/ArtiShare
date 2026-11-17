import type { BrowserContext, Frame, Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { openArtifact, openChatArtifact } from './claudePage';

// F011: when the box can't read the lists (damaged storage, a background that doesn't answer, an
// extension that was updated under an open tab) it says what to do, and claude.ai's dialog keeps working.

const BOX = 'artishare-share-lists';
const FIELD = "input[role=combobox][aria-label='Invite people by email']";
const DAMAGED = "Couldn't read your lists";
const DAMAGED_DETAIL = 'Saved lists have an unsupported or damaged format. They were not changed.';
const UPDATED = 'ArtiShare was updated. Reload this page to use your lists.';

const TEAM = ['a@example.com', 'b@example.com', 'c@example.com'];

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

/** Something under the `config` key that ArtiShare can't make sense of. */
const damageLists = (page: Page) =>
  page.evaluate(async () => {
    await chrome.storage.local.set({ config: { version: 99, lists: 'not a list' } });
  });

const setSilent = (page: Page, silent: boolean) =>
  page.evaluate(async (on) => {
    if (on) await chrome.storage.session.set({ fakeSilentConfigGet: true });
    else await chrome.storage.session.remove('fakeSilentConfigGet');
  }, silent);

/** Everything the page throws or logs as an error, for 'nothing throws in the console'. */
function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console: ${msg.text()}`);
  });

  return errors;
}

type Variant = 'iframe' | 'top';

async function openShare(context: BrowserContext, variant: Variant = 'iframe') {
  const claude = variant === 'iframe' ? await openArtifact(context) : await openChatArtifact(context);
  const errors = watchErrors(claude.page);
  await claude.share();
  await expect(claude.host.locator('[data-share-pop][data-open]')).toBeVisible();

  return { ...claude, errors };
}

const box = (host: Frame) => host.locator(BOX);
const chip = (host: Frame, name: string) => box(host).getByRole('button', { name: new RegExp(`^${name},`) });
const retry = (host: Frame) => box(host).getByRole('button', { name: 'Retry', exact: true });
const field = (host: Frame) => host.locator(FIELD);

/** claude.ai's own dialog still does its job: its field offers Invite and the Invite is sent. */
async function claudeStillInvites(host: Frame, email: string) {
  await field(host).fill(email);
  const option = host.getByRole('option', { name: new RegExp(`Invite ${email.replace('.', '\\.')}`) });
  await expect(option).toBeVisible();
  await option.click();
  await expect.poll(() => host.evaluate(() => window.__standIn.invited.length)).toBeGreaterThan(0);
  const invited = await host.evaluate(() => window.__standIn.invited.flatMap((i) => i.emails));
  expect(invited).toContain(email);
}

/** claude.ai's dialog closes and opens again, with one box each time. */
async function dialogOpensAndCloses(page: Page, host: Frame) {
  await host.evaluate(() => window.__standIn.close());
  await expect(host.locator('[data-share-pop][data-open]')).toHaveCount(0);
  await expect(box(host)).toHaveCount(0);
  await page.getByRole('button', { name: 'Share', exact: true }).click();
  await expect(host.locator('[data-share-pop][data-open]')).toBeVisible();
  await expect(box(host)).toHaveCount(1);
}

for (const variant of ['iframe', 'top'] as const) {
  test(`damaged saved lists: the box says why, with Retry, and claude.ai still works (${variant})`, async ({
    context,
    panel,
  }) => {
    await damageLists(panel);
    const { page, host, errors } = await openShare(context, variant);

    await expect(box(host)).toHaveCount(1);
    await expect(box(host).getByRole('alert')).toHaveText(`${DAMAGED}: ${DAMAGED_DETAIL}`);
    await expect(retry(host)).toBeVisible();
    await expect(box(host).locator('.chip')).toHaveCount(0);

    // Retry reads again, and it is still damaged: the same message, still one box.
    await retry(host).click();
    await expect(box(host).getByRole('alert')).toHaveText(`${DAMAGED}: ${DAMAGED_DETAIL}`);
    await expect(box(host)).toHaveCount(1);

    await claudeStillInvites(host, 'x@example.com');
    await dialogOpensAndCloses(page, host);
    await expect(box(host).getByRole('alert')).toContainText(DAMAGED);
    expect(errors).toEqual([]);
  });
}

test('fixing the saved lists brings the chips back, and Retry works too', async ({ context, panel }) => {
  await damageLists(panel);
  const { host, errors } = await openShare(context);
  await expect(box(host).getByRole('alert')).toContainText(DAMAGED);

  await writeLists(panel, [{ name: 'Team', emails: TEAM }]);
  await expect(chip(host, 'Team')).toHaveText('Team 3');
  await expect(box(host).getByRole('alert')).toHaveCount(0);
  await expect(retry(host)).toHaveCount(0);
  await expect(box(host)).toHaveCount(1);

  // The chips work again.
  await chip(host, 'Team').click();
  await expect(field(host)).toHaveValue(TEAM.join(', '));
  expect(errors).toEqual([]);
});

test('Retry after the lists are fixed reads them again', async ({ context, panel }) => {
  // The background doesn't answer, so the box is on its Retry; the lists are saved meanwhile.
  await writeLists(panel, [{ name: 'Team', emails: TEAM }]);
  await setSilent(panel, true);
  const { host } = await openShare(context);
  await expect(box(host).getByRole('alert')).toContainText("Couldn't reach ArtiShare", { timeout: 10_000 });

  await setSilent(panel, false);
  await retry(host).click();
  await expect(chip(host, 'Team')).toHaveText('Team 3');
  await expect(box(host)).toHaveCount(1);
});

test('a background that does not answer within a few seconds: the box says it could not reach ArtiShare', async ({
  context,
  panel,
}) => {
  await writeLists(panel, [{ name: 'Team', emails: TEAM }]);
  await setSilent(panel, true);
  const { page, host, errors } = await openShare(context);
  const started = Date.now();

  // Nothing yet: the box waits quietly rather than saying something wrong.
  await expect(box(host)).toHaveCount(1);
  await expect(box(host).getByRole('alert')).toHaveCount(0);
  await expect(box(host).getByRole('alert')).toContainText("Couldn't reach ArtiShare", { timeout: 10_000 });
  expect(Date.now() - started).toBeGreaterThan(2000);
  await expect(retry(host)).toBeVisible();
  await expect(box(host)).toHaveCount(1);

  // Retry while it is still silent: it waits again, then says so again, still one box.
  await retry(host).click();
  await expect(box(host).getByRole('alert')).toContainText("Couldn't reach ArtiShare", { timeout: 10_000 });
  await expect(box(host)).toHaveCount(1);

  await claudeStillInvites(host, 'y@example.com');
  await dialogOpensAndCloses(page, host);
  expect(errors).toEqual([]);
});

/**
 * The extension reloaded under a tab that stays open: Chrome leaves the page's old content script
 * running without `chrome.runtime.id`, so every `chrome.*` call from it throws.
 */
async function reloadExtension(context: BrowserContext, panel: Page) {
  const worker = context.serviceWorkers()[0]!;
  await panel.close();
  // The worker goes away in the middle of the call, so the call itself never answers.
  await worker.evaluate(() => chrome.runtime.reload()).catch(() => {});
  await expect.poll(() => context.serviceWorkers().every((w) => w !== worker)).toBe(true);
}

test('after the extension is reloaded, opening Share says to reload the page, and nothing throws', async ({
  context,
  panel,
}) => {
  await writeLists(panel, [{ name: 'Team', emails: TEAM }]);
  const claude = await openArtifact(context);
  const errors = watchErrors(claude.page);
  const { page, host } = claude;
  await reloadExtension(context, panel);

  await claude.share();
  await expect(host.locator('[data-share-pop][data-open]')).toBeVisible();
  await expect(box(host)).toHaveCount(1);
  await expect(box(host).getByRole('alert')).toHaveText(UPDATED);
  // Nothing to retry: only reloading the page helps.
  await expect(retry(host)).toHaveCount(0);
  await expect(box(host).locator('.chip')).toHaveCount(0);

  await claudeStillInvites(host, 'z@example.com');
  await dialogOpensAndCloses(page, host);
  await expect(box(host).getByRole('alert')).toHaveText(UPDATED);
  expect(errors).toEqual([]);
});

test('clicking a chip in an open box after the extension is reloaded says the same', async ({
  context,
  panel,
}) => {
  await writeLists(panel, [{ name: 'Team', emails: TEAM }]);
  const { page, host, errors } = await openShare(context);
  await expect(chip(host, 'Team')).toHaveText('Team 3');
  await reloadExtension(context, panel);

  await chip(host, 'Team').click();
  await expect(box(host).getByRole('alert')).toHaveText(UPDATED);
  await expect(box(host)).toHaveCount(1);
  // The lists from before the update are not used: nothing was put in the field.
  await expect(field(host)).toHaveValue('');

  await claudeStillInvites(host, 'w@example.com');
  await dialogOpensAndCloses(page, host);
  expect(errors).toEqual([]);
});
