import { readFileSync } from 'node:fs';
import type { BrowserContext, Frame, Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { openArtifact, openChatArtifact } from './claudePage';

// F002: the ArtiShare lists box under claude.ai's invite field, with a chip per saved list. The page is
// the stand-in from F001. The fake build leaves the box's shadow root open so these tests can look
// inside it; the one test that needs it closed says so.

const BOX = 'artishare-share-lists';
const FIELD = "input[role=combobox][aria-label='Invite people by email']";

/** Saves a list through the background, as the Lists tab does. */
async function saveList(page: Page, name: string, emails: string[]) {
  await page.evaluate(
    async (args) => {
      const reply = (await chrome.runtime.sendMessage({
        type: 'config-change',
        change: {
          type: 'save-list',
          list: { id: crypto.randomUUID(), name: args.name, emails: args.emails, access: 'view' },
          expected: null,
        },
      })) as { ok: boolean; error?: string };
      if (!reply.ok) throw new Error(reply.error);
    },
    { name, emails },
  );
}

async function openShare(context: BrowserContext, open = openArtifact) {
  const claude = await open(context);
  await claude.share();
  await expect(claude.host.locator('[data-share-pop][data-open]')).toBeVisible();

  return claude;
}

const box = (host: Frame) => host.locator(BOX);
const chips = (host: Frame) => box(host).locator('button.chip');

test('saving two lists in the popup, the box shows a chip for each, in the Lists tab order', async ({
  context,
  panel,
}) => {
  await panel.getByRole('tab', { name: /Lists/ }).click();
  const lists = panel.getByRole('tabpanel', { name: /Lists/ });
  for (const [name, emails] of [
    ['Team', 'a@example.com\nb@example.com\nc@example.com'],
    ['Design', 'd@example.com\ne@example.com'],
  ] as const) {
    await lists.getByRole('button', { name: 'New list' }).click();
    // A list just saved stays open in the tab, so the new form is told apart by its '(optional)'.
    await lists.getByRole('textbox', { name: 'List name (optional)', exact: true }).fill(name);
    await lists.getByLabel('Email addresses').last().fill(emails);
    await lists.getByRole('button', { name: 'Save list' }).click();
  }
  await expect(panel.getByRole('tab', { name: /Lists/ })).toContainText('2');
  // The order the Lists tab shows them in.
  await expect(lists.locator('.choices.nested .truncate')).toHaveText(['Design', 'Team']);

  const { host } = await openShare(context);
  const group = box(host).getByRole('group', { name: 'ArtiShare lists' });
  await expect(group).toBeVisible();
  await expect(group.getByRole('heading', { name: 'ArtiShare lists' })).toBeVisible();
  await expect(chips(host)).toHaveText(['Design 2', 'Team 3']);
  await expect(chips(host).nth(0)).toHaveAccessibleName('Design, 2 people');
  await expect(chips(host).nth(1)).toHaveAccessibleName('Team, 3 people');
  await expect(group.getByRole('searchbox', { name: 'Search lists or people' })).toBeVisible();
  await expect(group.getByPlaceholder('Search lists or people')).toBeVisible();
});

test('the box is one element right after the invite area, above People with access', async ({
  context,
  panel,
}) => {
  await saveList(panel, 'Team', ['a@example.com']);
  const { host } = await openShare(context);
  await expect(box(host)).toHaveCount(1);
  // Same parent, right after [data-share-entry], and before 'People with access'.
  await expect(host.locator(`[data-share-pinned] > [data-share-entry] + ${BOX} + span`)).toHaveText(
    'People with access',
  );
  const [entry, mine, people] = await host.evaluate((tag) => {
    const top = (selector: string) => document.querySelector(selector)!.getBoundingClientRect().bottom;
    const spans = [...document.querySelectorAll('[data-share-pinned] > span')];

    return [
      top('[data-share-entry]'),
      document.querySelector(tag)!.getBoundingClientRect().top,
      spans.find((s) => s.textContent === 'People with access')!.getBoundingClientRect().top,
    ];
  }, BOX);
  expect(mine).toBeGreaterThanOrEqual(entry!);
  expect(people).toBeGreaterThanOrEqual(mine!);
});

test('claude.ai’s own parts of the dialog still work with the box there', async ({ context, panel }) => {
  await saveList(panel, 'Team', ['a@example.com', 'b@example.com']);
  const { host, page } = await openShare(context);
  await expect(chips(host)).toHaveCount(1);

  // The field takes typing and claude.ai offers its option.
  await host.locator(FIELD).fill('new@example.com');
  await expect(host.locator('[role=listbox] [role=option][data-invite-email]')).toContainText(
    'Invite new@example.com',
  );
  await host.locator(FIELD).fill('');
  await expect(host.locator('[data-share-view=main]')).toContainText('viewer@example.com');
  await expect(host.locator('[data-share-pinned] > span')).toHaveText('People with access');

  // Tabs: Export hides the field and the box with it, Share brings both back.
  const tabs = host.locator('[data-share-tabs]');
  await tabs.getByRole('radio', { name: 'Export' }).click();
  await expect(host.locator(FIELD)).toBeHidden();
  await expect(box(host)).toBeHidden();
  await tabs.getByRole('radio', { name: 'Share' }).click();
  await expect(host.locator(FIELD)).toBeVisible();
  await expect(chips(host)).toHaveText(['Team 2']);

  // Copy link works, and so does Close, which takes the box with it.
  await host.locator('[data-copy-link]').click();
  expect(await host.evaluate(() => window.__standIn.copied)).toBe(1);
  await host.locator('[data-share-close]').click();
  await expect(host.locator('[data-share-pop]')).toHaveCount(0);
  await expect(box(host)).toHaveCount(0);
  expect(await host.evaluate(() => window.__standIn.invited)).toEqual([]);
  expect(page.url()).toContain('/artifact/');
});

test('the box has a closed shadow root: the page can’t read into it', async ({ context, panel }) => {
  await saveList(panel, 'Team', ['a@example.com', 'b@example.com', 'c@example.com']);
  const claude = await openArtifact(context, { closedShadow: true });
  await claude.share();
  const { host, page } = claude;
  await expect(host.locator(`[data-share-entry] + ${BOX}`)).toHaveCount(1);
  expect(await host.evaluate((tag) => document.querySelector(tag)!.shadowRoot, BOX)).toBeNull();

  // The box is there nevertheless: the debugger sees closed roots, the page's scripts don't.
  const cdp = await context.newCDPSession(page);
  const { root } = await cdp.send('DOM.getDocument', { depth: -1, pierce: true });
  const text: string[] = [];
  const walk = (node: {
    nodeValue?: string;
    children?: unknown[];
    shadowRoots?: unknown[];
    contentDocument?: unknown;
  }) => {
    if (node.nodeValue) text.push(node.nodeValue);
    for (const child of [...(node.children ?? []), ...(node.shadowRoots ?? [])]) walk(child as typeof node);
    if (node.contentDocument) walk(node.contentDocument as typeof node);
  };
  walk(root);
  expect(text).toContain('ArtiShare lists');
  expect(text).toContain('Team');
});

test('the box also appears when the dialog is in the top frame, as beside a chat', async ({
  context,
  panel,
}) => {
  await saveList(panel, 'Team', ['a@example.com']);
  const { host } = await openShare(context, openChatArtifact);
  await expect(chips(host)).toHaveText(['Team 1']);
  await expect(host.locator(`[data-share-entry] + ${BOX}`)).toHaveCount(1);
});

test('with no lists the box says so and has no search', async ({ context }) => {
  const { host } = await openShare(context);
  await expect(box(host)).toContainText("No saved lists yet. Make one in ArtiShare's Lists tab.");
  await expect(box(host).getByRole('searchbox')).toHaveCount(0);
});

test('a dialog without the invite field gets no box', async ({ context, panel }) => {
  await saveList(panel, 'Team', ['a@example.com']);
  const claude = await openArtifact(context, { noInvite: true });
  const errors: string[] = [];
  claude.page.on('console', (message) => message.type() === 'error' && errors.push(message.text()));
  await claude.share();
  await expect(claude.host.locator('[data-share-pop][data-open]')).toBeVisible();
  await expect(box(claude.host)).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('no list is invited by opening Share, and nothing leaves the stand-in page', async ({
  context,
  panel,
}) => {
  await saveList(panel, 'Team', ['a@example.com']);
  const strangers: string[] = [];
  context.on('request', (request) => {
    const url = request.url();
    if (/^https?:/.test(url) && !url.startsWith('https://claude.ai/')) strangers.push(url);
  });
  const { host, page } = await openShare(context);
  await expect(chips(host)).toHaveCount(1);
  expect(strangers).toEqual([]);
  expect(await host.evaluate(() => window.__standIn.invited)).toEqual([]);
  // The popup's Share tab has no run.
  await panel.getByRole('tab', { name: 'Share' }).click();
  await expect(panel.getByText('Done', { exact: true })).toHaveCount(0);
  await page.close();
});

test('the built manifest adds only the content script: permissions, host permissions and key are unchanged', () => {
  const manifest = JSON.parse(
    readFileSync(new URL('../.output/chrome-mv3-fake/manifest.json', import.meta.url)).toString('utf8'),
  ) as {
    permissions: string[];
    host_permissions: string[];
    key: string;
    content_scripts: { matches: string[]; all_frames: boolean; js: string[]; css?: string[] }[];
    web_accessible_resources?: unknown;
  };
  expect(manifest.permissions.toSorted()).toEqual(['scripting', 'sidePanel', 'storage']);
  expect(manifest.host_permissions).toEqual(['https://claude.ai/*']);
  const config = readFileSync(new URL('../wxt.config.ts', import.meta.url)).toString('utf8');
  expect(config).toContain(manifest.key);
  expect(manifest.content_scripts).toHaveLength(1);
  const [script] = manifest.content_scripts;
  expect(script!.matches).toEqual(['https://claude.ai/*']);
  expect(script!.all_frames).toBe(true);
  expect(script!.css).toBeUndefined();
  expect(manifest.web_accessible_resources).toBeUndefined();
});
