import type { BrowserContext, Frame } from '@playwright/test';
import { expect, test } from './fixtures';
import { openArtifact, openChatArtifact, routeClaude } from './claudePage';

// F001 tests the stand-in claude.ai page itself, not ArtiShare: the in-page box is built on top of
// it in later features, so what it does has to match the real dialog (harness/claude-share-dialog.md).

const OPTION = '[role=listbox] [role=option][data-invite-email]';
const FIELD = "input[role=combobox][aria-label='Invite people by email']";

/** What a script has to do to put text in a React-controlled input: the native setter plus an event. */
const fill = (host: Frame, value: string) =>
  host.evaluate((text) => {
    const input = document.querySelector<HTMLInputElement>('input[role=combobox]')!;
    const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!;
    descriptor.set!.call(input, text);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);

/** The same, but the way a naive script would: assigning `.value` and then firing the event. */
const fillNaively = (host: Frame, value: string) =>
  host.evaluate((text) => {
    const input = document.querySelector<HTMLInputElement>('input[role=combobox]')!;
    input.value = text;
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

const fieldValue = (host: Frame) => host.locator(FIELD).inputValue();

async function openShare(context: BrowserContext) {
  const claude = await openArtifact(context);
  await claude.share();
  await expect(claude.host.locator('[data-share-pop][data-open]')).toBeVisible();

  return claude;
}

test('the wrapper page and its iframe are served at claude.ai URLs, and nothing else is fetched', async ({
  context,
}) => {
  const { requests } = await routeClaude(context);
  const strangers: string[] = [];
  context.on('request', (request) => {
    const url = request.url();
    if (/^https?:/.test(url) && !url.startsWith('https://claude.ai/')) strangers.push(url);
  });
  const { page, host, share } = await openArtifact(context);

  expect(page.url()).toBe('https://claude.ai/artifact/StandInArtifact01');
  expect(host.url()).toMatch(/^https:\/\/claude\.ai\/code\/artifact\/[0-9a-f-]{36}\?m=light&chrome=none/);
  expect(host).not.toBe(page.mainFrame());
  // What the real iframe's <html> carries.
  const html = host.locator('html');
  await expect(html).toHaveAttribute('data-mode', 'light');
  await expect(html).toHaveAttribute('data-chrome', 'none');
  await expect(html).toHaveAttribute('data-embedded', '');
  await expect(html).toHaveAttribute('data-frame-uuid', /^[0-9a-f-]{36}$/);

  await share();
  await expect(host.locator('[data-share-pop]')).toBeVisible();
  // Anything else on claude.ai is a 404, and nothing at all goes elsewhere.
  expect(requests.every((url) => /^https:\/\/claude\.ai\/(artifact|code\/artifact)\//.test(url))).toBe(true);
  expect(strangers).toEqual([]);
});

test('the dialog has the real one’s markers, nesting and content, about 435 px wide', async ({ context }) => {
  const { host } = await openShare(context);
  const chain = [
    '[data-base-ui-portal]',
    '[data-cds-portal][data-mode=light]',
    '[role=presentation][data-open]',
    '[role=dialog][data-share-pop][data-open]',
    '[data-cds-popover-body]',
    '[data-share-body]',
    '[data-share-pinned]',
    '[data-share-entry]',
    '[data-invite-field]',
    '[data-invite-chips]',
    FIELD,
  ].join(' > ');
  await expect(host.locator(chain)).toHaveCount(1);
  // The popover is the portal's last child of <body>.
  expect(await host.evaluate(() => document.body.lastElementChild?.hasAttribute('data-base-ui-portal'))).toBe(
    true,
  );

  const dialog = host.locator('[role=dialog][data-share-pop]');
  await expect(dialog).toHaveAttribute('aria-labelledby', /.+/);
  const labelled = await dialog.getAttribute('aria-labelledby');
  await expect(host.locator(`[id="${labelled}"]`)).toHaveText('Test Artifact');
  await expect(
    host.locator('[data-share-head] [data-share-title-row] button[aria-label=Close][data-share-close]'),
  ).toBeVisible();
  await expect(host.locator('[data-share-settings-btn][aria-label="Share artifact settings"]')).toBeVisible();
  const tabs = host.locator('[data-share-tabs] [role=radiogroup][aria-label="Share or export"]');
  await expect(tabs.locator('[role=radio][data-checked]')).toHaveText('Share');
  await expect(tabs.locator('[role=radio][data-unchecked]')).toHaveText('Export');
  await expect(
    host.locator(`${FIELD}[placeholder="Invite people by email"][inputmode=email]`),
  ).toHaveAttribute('aria-haspopup', 'listbox');
  await expect(host.locator('[data-invite-field] > input[type=hidden]')).toHaveCount(1);
  await expect(host.locator('[data-invite-field] > span[role=status]')).toHaveCount(1);
  // "People with access" sits in the pinned area, after the entry (and after ArtiShare's box, which
  // the extension in these tests puts right behind the entry).
  await expect(host.locator('[data-share-pinned] > [data-share-entry] ~ span')).toHaveText(
    'People with access',
  );

  const view = host.locator('[data-share-view=main]');
  await expect(view).toHaveAttribute('data-share-tab-up', 'share');
  const owner = view.locator('[data-invitees][role=list]');
  await expect(owner).toContainText('(you)');
  await expect(owner.locator('button[role=combobox][data-disabled]')).toHaveText('Owner');
  const invited = view.locator('[data-ext-invites]');
  await expect(invited).toContainText('Invited by email');
  await expect(invited.locator('[role=list] > [role=listitem]')).toHaveCount(2);
  await expect(invited.locator('[data-name]')).toHaveText(['viewer@example.com', 'editor@example.com']);
  await expect(invited).toContainText('Invited · expires Dec 11');
  await expect(invited.locator('[data-invite-role-sel] > button[role=combobox]')).toHaveText([
    'Viewer',
    'Editor',
  ]);
  await expect(invited.locator('[data-invite-copy-link]')).toHaveCount(2);
  await expect(
    invited.locator('button[data-share-remove][aria-label="Remove viewer@example.com"]'),
  ).toBeVisible();
  await expect(view.locator('[data-general-access]')).toContainText('Only people invited');
  await expect(
    view.locator('[data-list-visibility][data-share-settings] [role=switch]'),
  ).toHaveAccessibleName('Show in Artifacts list');
  const footer = host.locator('[data-cds-popover-body] > [data-share-footer]');
  await expect(footer.locator('[data-share-audience-line]')).toHaveText(
    'Only people invited can open this link',
  );
  await expect(footer.locator('button[data-copy-link]')).toHaveText('Copy link');

  const box = await dialog.boundingBox();
  expect(box!.width).toBeGreaterThan(430);
  expect(box!.width).toBeLessThan(440);
});

test('the field is React-controlled: the native setter and an input event work, `.value =` does not, a paste appends', async ({
  context,
}) => {
  const { host } = await openShare(context);
  const option = host.locator(OPTION);
  await expect(option).toHaveCount(0);

  await fill(host, 'a@example.com, b@example.com');
  await expect(option).toHaveCount(1);
  await expect(option).toContainText('Invite 2 people');
  await expect(option).toContainText('a@example.com, b@example.com');
  await expect(option).toHaveAttribute('data-invite-email', 'a@example.com, b@example.com');
  // The suggestion is drawn outside the dialog, in a portal of its own.
  await expect(host.locator(`[data-share-pop] ${OPTION}`)).toHaveCount(0);
  await expect(host.locator(FIELD)).toHaveAttribute('aria-expanded', 'true');

  await fill(host, 'x@example.com');
  await expect(option).toContainText('Invite x@example.com');
  await expect(option).toContainText('By email');
  await expect(option).not.toContainText('people');

  // The tracker swallows this: React sees no change, so there is no state and no suggestion.
  await fill(host, '');
  await expect(option).toHaveCount(0);
  await fillNaively(host, 'a@example.com, b@example.com');
  await expect(option).toHaveCount(0);

  // A paste is cancelled and appended with ", ".
  await fill(host, 'a@example.com');
  await paste(host, 'b@example.com');
  expect(await fieldValue(host)).toBe('a@example.com, b@example.com');
  await expect(option).toContainText('Invite 2 people');
  await paste(host, 'c@example.com');
  expect(await fieldValue(host)).toBe('a@example.com, b@example.com, c@example.com');
  await expect(option).toContainText('Invite 3 people');
});

test('the option appears only when every entry is an address, and leaves out people already invited', async ({
  context,
}) => {
  const { host } = await openShare(context);
  const option = host.locator(OPTION);

  await fill(host, 'a@example.com\nb@example.com');
  await expect(option).toHaveCount(0);
  await fill(host, 'a@example.com,b@example.com');
  await expect(option).toHaveCount(0);
  await fill(host, 'a@example.com, ali');
  await expect(option).toHaveCount(0);
  await fill(host, 'ali');
  await expect(option).toHaveCount(0);
  await fill(host, 'a@example.com, ');
  await expect(option).toHaveCount(0);

  await fill(host, 'new@example.com, viewer@example.com');
  await expect(option).toContainText('Invite new@example.com');
  await expect(option).not.toContainText('viewer@example.com');
  await expect(option).toHaveAttribute('data-invite-email', 'new@example.com');

  // Only people already invited: nothing to offer. Case doesn't matter.
  await fill(host, 'Viewer@Example.com, editor@example.com');
  await expect(option).toHaveCount(0);

  // Removing an invitation makes that address new again.
  await host.getByRole('button', { name: 'Remove viewer@example.com' }).click();
  await fill(host, 'viewer@example.com');
  await expect(option).toContainText('Invite viewer@example.com');
});

test('choosing the option only records it in the page', async ({ context }) => {
  const { page, host } = await openShare(context);
  const { requests } = await routeClaude(context);
  const before = requests.length;
  await fill(host, 'a@example.com, b@example.com');
  expect(await host.evaluate(() => window.__standIn.invited)).toEqual([]);

  await host.locator(OPTION).click();
  expect(await host.evaluate(() => window.__standIn.invited)).toEqual([
    { emails: ['a@example.com', 'b@example.com'] },
  ]);
  await expect(host.locator(OPTION)).toHaveCount(0);
  expect(requests.length).toBe(before);
  // Nobody shows up in the list: nothing was invited.
  await expect(host.locator('[data-ext-invites] [role=listitem]')).toHaveCount(2);
  expect(page.frames().length).toBe(2);
});

test('the option can be reached and chosen from the keyboard', async ({ context }) => {
  const { host } = await openShare(context);
  await host.locator(FIELD).focus();
  await fill(host, 'a@example.com');
  await host.page().keyboard.press('Enter');
  expect(await host.evaluate(() => window.__standIn.invited)).toEqual([]);
  await host.page().keyboard.press('ArrowDown');
  await expect(host.locator(OPTION)).toHaveAttribute('data-highlighted', '');
  await host.page().keyboard.press('Enter');
  expect(await host.evaluate(() => window.__standIn.invited)).toEqual([{ emails: ['a@example.com'] }]);
});

test('the Export tab hides the pinned area and Share brings it back', async ({ context }) => {
  const { host } = await openShare(context);
  const pinned = host.locator('[data-share-pinned]');
  await expect(pinned).toBeVisible();
  await fill(host, 'a@example.com');

  await host.getByRole('radio', { name: 'Export' }).click();
  await expect(pinned).toBeHidden();
  await expect(host.locator('[data-share-view]')).toHaveAttribute('data-share-tab-up', 'export');
  await expect(host.locator('[data-share-export]')).toBeVisible();
  await expect(host.locator('[role=radio][data-checked]')).toHaveText('Export');
  await expect(host.locator(OPTION)).toHaveCount(0);

  await host.getByRole('radio', { name: 'Share' }).click();
  await expect(pinned).toBeVisible();
  await expect(host.locator('[data-share-view]')).toHaveAttribute('data-share-tab-up', 'share');
  expect(await fieldValue(host)).toBe('a@example.com');
  await expect(host.locator(OPTION)).toHaveCount(1);
});

test('Close, Escape and a click outside close the dialog, which lingers about 150 ms with data-closed', async ({
  context,
}) => {
  const { page, host, share } = await openShare(context);
  const dialog = host.locator('[data-share-pop]');
  await fill(host, 'a@example.com');

  // Close: marked data-closed straight away, gone after about 150 ms.
  const lingered = await host.evaluate(async () => {
    document.querySelector<HTMLElement>('[data-share-close]')!.click();
    const el = document.querySelector('[data-share-pop]');
    const marked = el?.hasAttribute('data-closed') && !el.hasAttribute('data-open');
    const start = performance.now();
    while (document.querySelector('[data-share-pop]')) await new Promise((r) => requestAnimationFrame(r));

    return { marked, ms: performance.now() - start };
  });
  expect(lingered.marked).toBe(true);
  expect(lingered.ms).toBeGreaterThan(100);
  expect(lingered.ms).toBeLessThan(500);
  await expect(host.locator(OPTION)).toHaveCount(0);
  await expect(host.locator('[data-base-ui-portal]')).toHaveCount(0);

  // Reopening builds a fresh dialog with an empty field.
  await share();
  await expect(dialog).toHaveCount(1);
  expect(await fieldValue(host)).toBe('');
  await fill(host, 'b@example.com');

  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);

  await share();
  await expect(dialog).toHaveCount(1);
  await host.locator('#artifact-button').click();
  await expect(dialog).toHaveCount(0);

  // A press on the wrapper, outside the iframe, closes it too, but not on its own Share button.
  await share();
  await expect(dialog).toHaveCount(1);
  await page.locator('header strong').click();
  await expect(dialog).toHaveCount(0);

  // Reopening during the animation replaces the old dialog, never stacks a second one.
  await share();
  await host.evaluate(() => {
    window.__standIn.close();
    window.__standIn.open();
  });
  await expect(dialog).toHaveCount(1);
  await expect(dialog).toHaveAttribute('data-open', '');
});

test('clicks inside the dialog and in the suggestion do not close it', async ({ context }) => {
  const { host } = await openShare(context);
  await host.locator('[data-share-title-row] h2').click();
  await expect(host.locator('[data-share-pop][data-open]')).toBeVisible();
  await fill(host, 'a@example.com');
  await host.locator(OPTION).hover();
  await host.locator(FIELD).click();
  await expect(host.locator('[data-share-pop][data-open]')).toBeVisible();
});

test('dark variant: the mode is on <html> and the portal, and can be switched while open', async ({
  context,
}) => {
  const { host, share } = await openArtifact(context, { mode: 'dark' });
  await expect(host.locator('html')).toHaveAttribute('data-mode', 'dark');
  await share();
  const portal = host.locator('[data-base-ui-portal]:has([data-share-pop]) > [data-cds-portal]');
  await expect(portal).toHaveAttribute('data-mode', 'dark');
  const dark = await host.locator('[data-share-pop]').evaluate((el) => getComputedStyle(el).backgroundColor);

  await fill(host, 'a@example.com');
  await host.evaluate(() => window.__standIn.setMode('light'));
  await expect(host.locator('html')).toHaveAttribute('data-mode', 'light');
  await expect(portal).toHaveAttribute('data-mode', 'light');
  // The suggestion's own portal follows too.
  await expect(host.locator('[role=listbox]').locator('xpath=ancestor::*[@data-cds-portal]')).toHaveAttribute(
    'data-mode',
    'light',
  );
  const light = await host.locator('[data-share-pop]').evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(light).not.toBe(dark);
});

test('top-frame variant: the dialog is in the page itself, with no iframe', async ({ context }) => {
  const { page, host, share } = await openChatArtifact(context);
  expect(page.frames()).toHaveLength(1);
  await share();
  await expect(
    host.locator('[data-share-pop][data-open] [data-share-pinned] [data-share-entry] ' + FIELD),
  ).toHaveCount(1);
  await fill(host, 'a@example.com, b@example.com');
  await expect(host.locator(OPTION)).toContainText('Invite 2 people');
  await page.keyboard.press('Escape');
  await expect(host.locator('[data-share-pop]')).toHaveCount(0);
});

test('no-invite variant: a dialog without the invite field', async ({ context }) => {
  const { host, share } = await openArtifact(context, { noInvite: true });
  await share();
  await expect(host.locator('[data-share-pop][data-open]')).toBeVisible();
  await expect(host.locator('[data-share-pinned]')).toContainText('People with access');
  await expect(host.locator('[data-share-entry], [data-invite-field]')).toHaveCount(0);
  await expect(host.locator(FIELD)).toHaveCount(0);
});

test('re-render hook: the pinned area is rebuilt from scratch and keeps the field’s text', async ({
  context,
}) => {
  const { host } = await openShare(context);
  await fill(host, 'a@example.com, b@example.com');
  await host.evaluate(() => {
    document.querySelector('[data-share-pinned]')!.setAttribute('data-old', '');
    document.querySelector('[data-share-entry]')!.setAttribute('data-old', '');
    window.__standIn.rerenderPinned();
  });
  await expect(host.locator('[data-share-pinned]')).toHaveCount(1);
  await expect(host.locator('[data-old]')).toHaveCount(0);
  await expect(host.locator('[data-share-pinned] > [data-share-entry] ' + FIELD)).toHaveCount(1);
  expect(await fieldValue(host)).toBe('a@example.com, b@example.com');
  await expect(host.locator(OPTION)).toContainText('Invite 2 people');
  // The rebuilt field is as controlled as the first.
  await fill(host, 'c@example.com');
  await expect(host.locator(OPTION)).toContainText('Invite c@example.com');
});
