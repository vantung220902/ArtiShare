import { readFileSync } from 'node:fs';
import type { BrowserContext, Frame, Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { openArtifact, openChatArtifact, render } from './claudePage';

// F013: pages on claude.ai can only read the lists through ArtiShare (never start a run or change
// anything), and the box itself sends nothing. Everything runs against the stand-in.

const BOX = 'artishare-share-lists';
const FIELD = "input[role=combobox][aria-label='Invite people by email']";

const ZEBRA = ['zebra1@example.com', 'zebra2@example.com'];
const QUOKKA = ['quokka1@example.com', 'quokka2@example.com', 'quokka3@example.com'];

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

const LISTS = [
  { name: 'Zebra Squad', emails: ZEBRA },
  { name: 'Quokka Crew', emails: QUOKKA },
];

async function openShare(context: BrowserContext, open = openArtifact, options = {}) {
  const claude = await open(context, options);
  await claude.share();
  await expect(claude.host.locator('[data-share-pop][data-open]')).toBeVisible();

  return claude;
}

const box = (host: Frame) => host.locator(BOX);
const chip = (host: Frame, name: string) => box(host).getByRole('button', { name: new RegExp(`^${name},`) });
const search = (host: Frame) => box(host).getByRole('searchbox', { name: 'Search lists or people' });

/**
 * Sends `message` the way a content script would: from the isolated world ArtiShare's script runs
 * in, on the claude.ai page. (A page's own scripts have no `chrome.runtime` at all, see below.)
 * Returns one reply per frame that has such a world.
 */
async function fromContentScripts(context: BrowserContext, page: Page, message: object) {
  const cdp = await context.newCDPSession(page);
  const worlds: { id: number; name: string; origin: string; frameId: string }[] = [];
  cdp.on('Runtime.executionContextCreated', ({ context: c }) => {
    if (!c.auxData?.isDefault && c.auxData?.type === 'isolated') {
      worlds.push({ id: c.id, name: c.name, origin: c.origin, frameId: String(c.auxData.frameId) });
    }
  });
  await cdp.send('Runtime.enable');
  await expect.poll(() => worlds.filter((w) => w.name === 'ArtiShare').length).toBeGreaterThan(0);
  const replies: unknown[] = [];
  for (const world of worlds.filter((w) => w.name === 'ArtiShare')) {
    const { result, exceptionDetails } = await cdp.send('Runtime.evaluate', {
      contextId: world.id,
      awaitPromise: true,
      returnByValue: true,
      expression: `chrome.runtime.sendMessage(${JSON.stringify(message)})`,
    });
    expect(exceptionDetails, JSON.stringify(exceptionDetails)).toBeUndefined();
    replies.push(result.value);
  }
  await cdp.detach();

  return replies;
}

const storedKeys = (panel: Page) =>
  panel.evaluate(async () => {
    const all = await chrome.storage.local.get(null);

    return { keys: Object.keys(all).sort(), config: JSON.stringify(all.config), run: all.run ?? null };
  });

const NO_START = {
  type: 'start',
  label: 'Sneaky',
  accountEmail: 'me@example.com',
  plans: [
    {
      artifact: { id: 'x', kind: 'artifact' },
      toInvite: [{ email: 'victim@example.com', access: 'view' }],
      toChange: [],
      skipped: [],
    },
  ],
};

const REFUSED = [
  NO_START,
  { type: 'config-change', change: { type: 'clear-lists' } },
  {
    type: 'config-change',
    change: {
      type: 'save-list',
      list: { id: 'evil', name: 'Evil', emails: ['evil@example.com'], access: 'edit' },
      expected: null,
    },
  },
  { type: 'whoami' },
  { type: 'preview', artifacts: [], invites: [] },
  { type: 'sharees', artifact: { id: 'x', kind: 'artifact' } },
  { type: 'change-access', artifact: { id: 'x', kind: 'artifact' }, inviteId: 'i', access: 'edit' },
  { type: 'remove-invite', artifact: { id: 'x', kind: 'artifact' }, inviteId: 'i' },
  { type: 'stop' },
  { type: 'resume' },
  { type: 'clear' },
  { type: 'no-such-message' },
  {},
];

for (const variant of ['iframe', 'top'] as const) {
  test(`a claude.ai page can read the lists and nothing else (${variant})`, async ({ context, panel }) => {
    await writeLists(panel, LISTS);
    const before = await storedKeys(panel);
    const { page, host } = await openShare(context, variant === 'iframe' ? openArtifact : openChatArtifact);
    await expect(chip(host, 'Zebra Squad')).toBeVisible();

    // The one thing it may do, and what the box itself does.
    const reads = await fromContentScripts(context, page, { type: 'config-get' });
    expect(reads.length).toBeGreaterThan(0);
    for (const reply of reads) {
      expect(reply).toMatchObject({
        ok: true,
        data: { lists: [{ name: 'Zebra Squad' }, { name: 'Quokka Crew' }] },
      });
    }

    for (const message of REFUSED) {
      for (const reply of await fromContentScripts(context, page, message)) {
        expect(reply, JSON.stringify(message)).toEqual({
          ok: false,
          error: 'A claude.ai page can only read your lists.',
        });
      }
    }

    // Nothing happened: no run, the lists as they were, and no invitation went anywhere.
    expect(await storedKeys(panel)).toEqual(before);
    expect(await host.evaluate(() => window.__standIn.invited)).toEqual([]);
    expect(
      await panel.evaluate(
        async () => (await chrome.runtime.sendMessage({ type: 'config-get' })).data.lists.length,
      ),
    ).toBe(2);
    // The box carries on working after the refusals.
    await chip(host, 'Zebra Squad').click();
    await expect(host.locator(FIELD)).toHaveValue(ZEBRA.join(', '));
  });
}

test("the popup and side panel's own pages can still send everything", async ({ panel, sidePanel }) => {
  for (const page of [panel, sidePanel]) {
    const replies = await page.evaluate(async () => {
      const send = (message: object) => chrome.runtime.sendMessage(message) as Promise<{ ok: boolean }>;

      return [
        await send({ type: 'config-get' }),
        await send({ type: 'whoami' }),
        await send({ type: 'sharees', artifact: { id: 'x', kind: 'artifact' } }),
        await send({ type: 'stop' }),
        await send({ type: 'clear' }),
      ];
    });
    for (const reply of replies) expect(reply).toMatchObject({ ok: true });
  }
});

test("a page's own scripts have no way to message ArtiShare", async ({ context, panel }) => {
  await writeLists(panel, LISTS);
  const { page, host } = await openShare(context);
  for (const frame of [page.mainFrame(), host]) {
    const reachable = await frame.evaluate(() => {
      const runtime = (window as unknown as { chrome?: { runtime?: { sendMessage?: unknown } } }).chrome
        ?.runtime;

      return typeof runtime?.sendMessage;
    });
    expect(reachable).toBe('undefined');
  }
});

test('opening Share, searching, picking and closing makes no request of its own', async ({
  context,
  panel,
}) => {
  await writeLists(panel, LISTS);
  const urls: string[] = [];
  context.on('request', (request) => urls.push(request.url()));
  const { page, host } = await openShare(context);
  await expect(chip(host, 'Zebra Squad')).toBeVisible();
  // Everything the page itself loaded: the wrapper and its frame, from the stand-in.
  const loaded = [...urls];
  expect(loaded.length).toBeGreaterThan(0);
  for (const url of loaded) expect(url).toMatch(/^https:\/\/claude\.ai\/(code\/)?artifact\//);

  // The chips, the search (a list and a person), the field, unpicking, and closing the dialog.
  await chip(host, 'Zebra Squad').click();
  await chip(host, 'Quokka Crew').click();
  await chip(host, 'Zebra Squad').click();
  await search(host).fill('zebra');
  await box(host).locator('.result').first().click();
  await search(host).fill('quokka2');
  await box(host).locator('.result').first().click();
  await search(host).fill('');
  await host.locator(FIELD).focus();
  await page.keyboard.press('Tab');
  await host.locator('[data-share-close]').click();
  await expect(host.locator('[data-share-pop]')).toHaveCount(0);
  await expect(box(host)).toHaveCount(0);
  // And again, so a second box is not any different.
  await page.getByRole('button', { name: 'Share', exact: true }).click();
  await expect(chip(host, 'Zebra Squad')).toBeVisible();
  await chip(host, 'Quokka Crew').click();

  expect(urls).toEqual(loaded);
  expect(await host.evaluate(() => window.__standIn.invited)).toEqual([]);
});

/** Everything a page's own scripts can see changing: added nodes, attribute and text changes. */
const watchDom = (context: BrowserContext) =>
  context.addInitScript(() => {
    const log: string[] = [];
    (window as unknown as { __domLog: string[] }).__domLog = log;
    const attach = () => {
      new MutationObserver((records) => {
        for (const r of records) {
          if (r.type === 'characterData') log.push(r.target.textContent ?? '');
          if (r.type === 'attributes')
            log.push(`${r.attributeName}=${(r.target as Element).getAttribute(r.attributeName ?? '')}`);
          for (const node of r.addedNodes)
            log.push(node instanceof Element ? node.outerHTML : (node.textContent ?? ''));
        }
      }).observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
    };
    attach();
  });

/** What is in a frame's DOM right now as its own scripts see it, field values included. */
const visibleDom = (frame: Frame) =>
  frame.evaluate(() => {
    const values = [...document.querySelectorAll('input, textarea')].map(
      (i) => (i as HTMLInputElement).value,
    );

    return [
      document.documentElement.outerHTML,
      ...values,
      ...((window as unknown as { __domLog: string[] }).__domLog ?? []),
    ].join('\n');
  });

test("the box's shadow root reads null from the page, and nothing the person hasn't picked is in claude.ai's DOM", async ({
  context,
  panel,
}) => {
  await writeLists(panel, LISTS);
  await watchDom(context);
  const { page, host } = await openShare(context, openArtifact, { closedShadow: true });
  await expect(host.locator(`[data-share-entry] + ${BOX}`)).toHaveCount(1);
  for (const frame of [page.mainFrame(), host]) {
    expect(await frame.evaluate((tag) => document.querySelector(tag)?.shadowRoot ?? null, BOX)).toBeNull();
  }
  const secret = /Zebra|Quokka|zebra|quokka/;
  for (const frame of [page.mainFrame(), host]) expect(await visibleDom(frame)).not.toMatch(secret);

  // The page also can't get to the box through `elementFromPoint` or the host's children.
  expect(
    await host.evaluate((tag) => {
      const hostEl = document.querySelector(tag)!;

      return [hostEl.childElementCount, hostEl.textContent, (hostEl as HTMLElement).innerText];
    }, BOX),
  ).toEqual([0, '', '']);
});

test('only what the person picks reaches claude.ai: the field and its option, never the names or the rest', async ({
  context,
  panel,
}) => {
  await writeLists(panel, LISTS);
  await watchDom(context);
  const { page, host } = await openShare(context);
  await expect(chip(host, 'Zebra Squad')).toBeVisible();
  const everything = async () => (await Promise.all([page.mainFrame(), host].map(visibleDom))).join('\n');
  expect(await everything()).not.toMatch(/Zebra|Quokka|zebra|quokka/);

  // Hovering, searching, and typing in the search show people and names only inside the box.
  await chip(host, 'Quokka Crew').hover();
  await search(host).fill('qu');
  await expect(box(host).locator('.result')).not.toHaveCount(0);
  expect(await everything()).not.toMatch(/Zebra|Quokka|zebra|quokka/);

  // Picking the Zebra list puts its addresses, and only those, in claude.ai's field.
  await search(host).fill('');
  await chip(host, 'Zebra Squad').click();
  await expect(host.locator(FIELD)).toHaveValue(ZEBRA.join(', '));
  const picked = await everything();
  for (const email of ZEBRA) expect(picked).toContain(email);
  expect(picked).not.toMatch(/Quokka|quokka|Zebra Squad/);

  // And one person from the other list brings only that person, not their list or its name.
  await search(host).fill('quokka2');
  await box(host).locator('.result').first().click();
  const both = await everything();
  expect(both).toContain('quokka2@example.com');
  expect(both).not.toMatch(/quokka1|quokka3|Quokka Crew|Zebra Squad/);
});

test('the content script is only on https://claude.ai/*', async ({ context, panel }) => {
  const manifest = JSON.parse(
    readFileSync(new URL('../.output/chrome-mv3-fake/manifest.json', import.meta.url)).toString('utf8'),
  ) as { content_scripts: { matches: string[] }[]; host_permissions: string[] };
  expect(manifest.content_scripts.flatMap((s) => s.matches)).toEqual(['https://claude.ai/*']);
  expect(manifest.host_permissions).toEqual(['https://claude.ai/*']);

  // The same page served from other sites (here only locally, nothing is fetched) gets no box.
  await writeLists(panel, LISTS);
  for (const origin of ['https://example.com', 'https://claude.ai.example.com', 'http://claude.ai']) {
    await context.route(`${origin}/**`, (route) =>
      route.fulfill({ contentType: 'text/html; charset=utf-8', body: render('chat.html') }),
    );
    const page = await context.newPage();
    await page.goto(`${origin}/chat/x`);
    await page.getByRole('button', { name: 'Share', exact: true }).click();
    await expect(page.locator('[data-share-pop][data-open]')).toBeVisible();
    await page.waitForTimeout(500);
    await expect(page.locator(BOX)).toHaveCount(0);
    await page.close();
  }
  // The control: on claude.ai the same page gets one.
  const { host } = await openShare(context, openChatArtifact);
  await expect(chip(host, 'Zebra Squad')).toBeVisible();
});

test('a frame without a Share dialog is only watched for one, whatever its page does', async ({
  context,
  panel,
}) => {
  await writeLists(panel, LISTS);
  const { page, host } = await openChatArtifact(context);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

  // A chat streaming text: thousands of changes deep in the page, none of them a new child of <body>.
  const started = Date.now();
  await host.evaluate(async () => {
    const main = document.querySelector('main')!;
    for (let round = 0; round < 50; round++) {
      const row = document.createElement('div');
      for (let i = 0; i < 100; i++) {
        const p = document.createElement('p');
        p.textContent = `streamed ${round} ${i}`;
        row.append(p);
      }
      main.append(row);
      row.querySelectorAll('p').forEach((p) => (p.textContent += ' more'));
      await new Promise((r) => setTimeout(r, 0));
    }
  });
  expect(Date.now() - started).toBeLessThan(5000);
  await expect(box(host)).toHaveCount(0);

  // Still watching: opening Share afterwards brings the box.
  await page.getByRole('button', { name: 'Share', exact: true }).click();
  await expect(chip(host, 'Zebra Squad')).toBeVisible();
  expect(errors).toEqual([]);

  // The watcher looks only at what is added to <body> (no `subtree`), and at the open dialog itself.
  const source = readFileSync(
    new URL('../src/entrypoints/share-lists.content/index.tsx', import.meta.url),
  ).toString('utf8');
  expect(source).toContain('body.observe(document.body, { childList: true })');
});
