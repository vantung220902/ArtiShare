import type { BrowserContext, Frame, Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { openArtifact, openChatArtifact } from './claudePage';

// F012: if claude.ai's field won't take the addresses (it ignores what a script puts in it, or it is
// gone), the box says so and lets the person copy them and paste them in. Only the stand-in is used.

const BOX = 'artishare-share-lists';
const FIELD = "input[role=combobox][aria-label='Invite people by email']";
const FAILED = "Couldn't put the addresses in claude.ai's field. Copy them and paste them in.";
const TEAM = ['a@example.com', 'b@example.com', 'c@example.com'];
const TEAM_TEXT = TEAM.join(', ');

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

type Variant = 'iframe' | 'top';

async function openShare(context: BrowserContext, variant: Variant = 'iframe') {
  const claude = variant === 'iframe' ? await openArtifact(context) : await openChatArtifact(context);
  const errors: string[] = [];
  claude.page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  claude.page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console: ${msg.text()}`);
  });
  await claude.share();
  await expect(claude.host.locator('[data-share-pop][data-open]')).toBeVisible();

  return { ...claude, errors };
}

const box = (host: Frame) => host.locator(BOX);
const chip = (host: Frame, name: string) => box(host).getByRole('button', { name: new RegExp(`^${name},`) });
const field = (host: Frame) => host.locator(FIELD);
const alert = (host: Frame) => box(host).getByRole('alert');
const copyButton = (host: Frame, label: string | RegExp) =>
  box(host).getByRole('button', { name: label, exact: typeof label === 'string' });

/** Makes the field drop what a script puts in it, like a field that ignores programmatic input. */
const refuseScripts = (host: Frame, on = true) =>
  host.evaluate((value) => {
    window.__standIn.ignoreScriptInput = value;
  }, on);

const invited = (host: Frame) => host.evaluate(() => window.__standIn.invited.flatMap((i) => i.emails));

for (const variant of ['iframe', 'top'] as const) {
  test(`a field that ignores the fill: the box says so and copies the addresses (${variant})`, async ({
    context,
    panel,
  }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'https://claude.ai' });
    await writeLists(panel, [{ name: 'Team 3', emails: TEAM }]);
    const { page, host, errors } = await openShare(context, variant);
    await expect(chip(host, 'Team 3')).toBeVisible();
    await refuseScripts(host);

    await chip(host, 'Team 3').click();
    await expect(alert(host)).toHaveText(FAILED);
    await expect(copyButton(host, 'Copy 3 addresses')).toBeVisible();
    // A silent no-op is not success: nothing says added, the chip isn't pressed, the field is empty.
    await expect(field(host)).toHaveValue('');
    await expect(chip(host, 'Team 3')).toHaveAttribute('aria-pressed', 'false');
    await expect(box(host).locator('output')).toHaveText('');
    await expect(box(host).getByText(/addresses added/)).toHaveCount(0);

    await copyButton(host, 'Copy 3 addresses').click();
    await expect(copyButton(host, 'Copied')).toBeVisible();
    await expect(box(host).locator('output')).toContainText('Copied');
    await expect.poll(() => host.evaluate(() => navigator.clipboard.readText())).toBe(TEAM_TEXT);

    // Pasting it into claude.ai's field gives claude.ai's own option; the person chooses it.
    await field(host).focus();
    await page.keyboard.press('ControlOrMeta+V');
    await expect(field(host)).toHaveValue(TEAM_TEXT);
    await expect(host.getByRole('option', { name: 'Invite 3 people' })).toBeVisible();
    // The field now holds them, so the box no longer says they are missing.
    await expect(alert(host)).toHaveCount(0);
    await expect(chip(host, 'Team 3')).toHaveAttribute('aria-pressed', 'true');

    // The button goes back to its label after a moment.
    expect(await invited(host)).toEqual([]);
    await host.getByRole('option', { name: 'Invite 3 people' }).click();
    expect(await invited(host)).toEqual(TEAM);
    expect(errors).toEqual([]);
  });
}

test('the copy button goes back to its label after a moment', async ({ context, panel }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'https://claude.ai' });
  await writeLists(panel, [{ name: 'Team 3', emails: TEAM }]);
  const { host } = await openShare(context);
  await refuseScripts(host);
  await chip(host, 'Team 3').click();
  await copyButton(host, 'Copy 3 addresses').click();
  await expect(copyButton(host, 'Copied')).toBeVisible();
  await expect(copyButton(host, 'Copy 3 addresses')).toBeVisible({ timeout: 5000 });
});

test('the field disappearing before the click gives the same message and copy button', async ({
  context,
  panel,
}) => {
  await writeLists(panel, [{ name: 'Team 3', emails: TEAM }]);
  const { host, errors } = await openShare(context);
  await expect(chip(host, 'Team 3')).toBeVisible();

  // Taking the field out of the page takes the box down with it, so claude.ai's field changes its
  // markup instead (the box only watches for nodes coming and going): it is still there, but the box
  // can no longer find it.
  await host.evaluate((selector) => document.querySelector(selector)?.setAttribute('role', 'textbox'), FIELD);

  await chip(host, 'Team 3').click();
  await expect(alert(host)).toHaveText(FAILED);
  await expect(copyButton(host, 'Copy 3 addresses')).toBeVisible();
  expect(errors).toEqual([]);
});

test('what the person typed stays in the copy, and a person row works the same way', async ({
  context,
  panel,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'https://claude.ai' });
  await writeLists(panel, [{ name: 'Team 3', emails: TEAM }]);
  const { host } = await openShare(context);
  await field(host).fill('x@example.com');
  await refuseScripts(host);

  await chip(host, 'Team 3').click();
  await expect(alert(host)).toHaveText(FAILED);
  await expect(copyButton(host, 'Copy 4 addresses')).toBeVisible();
  await copyButton(host, 'Copy 4 addresses').click();
  await expect
    .poll(() => host.evaluate(() => navigator.clipboard.readText()))
    .toBe(`x@example.com, ${TEAM_TEXT}`);
  // The field kept what the person typed.
  await expect(field(host)).toHaveValue('x@example.com');

  await box(host).getByRole('searchbox', { name: 'Search lists or people' }).fill('b@example');
  await box(host)
    .getByRole('button', { name: /b@example\.com/ })
    .click();
  await expect(alert(host)).toHaveText(FAILED);
  await expect(copyButton(host, 'Copy 2 addresses')).toBeVisible();
});

test('the clipboard refused: the addresses show selected in a read-only box', async ({ context, panel }) => {
  await writeLists(panel, [{ name: 'Team 3', emails: TEAM }]);
  const { host, errors } = await openShare(context);
  await refuseScripts(host);
  // The fake build reads this mark and makes the clipboard say no (a stub of navigator.clipboard
  // here would not reach the content script's own world).
  await host.evaluate(() => {
    document.documentElement.dataset.artishareRefuseClipboard = '';
  });

  await chip(host, 'Team 3').click();
  await expect(box(host).locator('textarea')).toHaveCount(0);
  await copyButton(host, 'Copy 3 addresses').click();

  const manual = box(host).getByRole('textbox', { name: 'Addresses to copy' });
  await expect(manual).toHaveValue(TEAM_TEXT);
  await expect(manual).toHaveAttribute('readonly', '');
  await expect(box(host).getByText(/Couldn't copy/)).toBeVisible();
  await expect(copyButton(host, 'Copied')).toHaveCount(0);
  // Selected, so Ctrl+C takes all of it.
  expect(
    await manual.evaluate((el: HTMLTextAreaElement) => [el.selectionStart, el.selectionEnd, el.value.length]),
  ).toEqual([0, TEAM_TEXT.length, TEAM_TEXT.length]);
  expect(errors).toEqual([]);
});

test('once the field takes input again, the next click fills it and the note goes', async ({
  context,
  panel,
}) => {
  await writeLists(panel, [{ name: 'Team 3', emails: TEAM }]);
  const { host } = await openShare(context);
  await refuseScripts(host);
  await chip(host, 'Team 3').click();
  await expect(alert(host)).toHaveText(FAILED);

  await refuseScripts(host, false);
  await chip(host, 'Team 3').click();
  await expect(field(host)).toHaveValue(TEAM_TEXT);
  await expect(alert(host)).toHaveCount(0);
  await expect(copyButton(host, /^Copy /)).toHaveCount(0);
  await expect(box(host).locator('output')).toContainText('3 addresses added.');
});

test('taking a list out of a field that refuses says so, with no copy button', async ({ context, panel }) => {
  await writeLists(panel, [{ name: 'Team 3', emails: TEAM }]);
  const { host } = await openShare(context);
  await chip(host, 'Team 3').click();
  await expect(field(host)).toHaveValue(TEAM_TEXT);

  await refuseScripts(host);
  await chip(host, 'Team 3').click();
  await expect(alert(host)).toHaveText(
    "Couldn't take the addresses out of claude.ai's field. Remove them there yourself.",
  );
  await expect(copyButton(host, /^Copy /)).toHaveCount(0);
  await expect(field(host)).toHaveValue(TEAM_TEXT);
});
