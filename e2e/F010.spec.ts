import type { BrowserContext, Frame, Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { openArtifact, type StandInOptions } from './claudePage';

// F010: the box looks at home in claude.ai's dialog in light and dark, and works with the keyboard
// and a screen reader.

const BOX = 'artishare-share-lists';
const FIELD = "input[role=combobox][aria-label='Invite people by email']";
// Exactly 60 characters, and no space at the end, which a saved name would lose.
const LONG = 'Quarterly planning review group for the whole of the design!';

type SavedList = { name: string; emails: string[]; access?: 'view' | 'comment' | 'edit' };

const writeLists = (page: Page, lists: SavedList[]) =>
  page.evaluate(async (all) => {
    await chrome.storage.local.set({
      config: {
        version: 2,
        lists: all.map((l, i) => ({ id: `list-${i}`, access: 'view', ...l })),
        defaultSelection: { mode: 'some', listIds: [] },
      },
    });
  }, lists);

const LISTS: SavedList[] = [
  { name: 'Team', emails: ['a@example.com', 'b@example.com', 'c@example.com'], access: 'edit' },
  { name: 'Design', emails: ['d@example.com', 'e@example.com'] },
  { name: 'Reviewers', emails: ['r@example.com'] },
];

async function openShare(context: BrowserContext, options: StandInOptions = {}) {
  const claude = await openArtifact(context, options);
  await claude.share();
  await expect(claude.host.locator('[data-share-pop][data-open]')).toBeVisible();

  return claude;
}

const box = (host: Frame) => host.locator(BOX);
const chip = (host: Frame, name: string) => box(host).getByRole('button', { name: new RegExp(`^${name},`) });
const field = (host: Frame) => host.locator(FIELD);
const search = (host: Frame) => box(host).getByRole('searchbox', { name: 'Search lists or people' });
const invited = (host: Frame) => host.evaluate(() => window.__standIn.invited);

/** What has focus: the box's own parts are named, anything else by role or label. */
const focused = (host: Frame) =>
  host.evaluate((tag) => {
    let el: Element | null = document.activeElement;
    while (el?.shadowRoot?.activeElement) el = el.shadowRoot.activeElement;
    if (!el) return 'nothing';
    const inBox =
      el.getRootNode() instanceof ShadowRoot && (el.getRootNode() as ShadowRoot).host.localName === tag;

    return `${inBox ? 'box:' : ''}${el.getAttribute('aria-label') ?? el.getAttribute('role') ?? el.localName}`;
  }, BOX);

/**
 * The lowest contrast ratio among the text in the box that matches `selector`. The colour of each
 * piece of text is blended with its own opacity (and its parents') over what is behind it: the
 * box's own backgrounds, such as a picked chip's, over the dialog's.
 */
const lowestContrast = (host: Frame, selector: string) =>
  host.evaluate(
    ({ tag, selector: sel }) => {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 1;
      const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
      type Rgba = [number, number, number, number];
      const toRgba = (css: string): Rgba => {
        ctx.clearRect(0, 0, 1, 1);
        ctx.fillStyle = '#000';
        ctx.fillStyle = css;
        ctx.fillRect(0, 0, 1, 1);
        const data = ctx.getImageData(0, 0, 1, 1).data;

        return [data[0] ?? 0, data[1] ?? 0, data[2] ?? 0, (data[3] ?? 0) / 255];
      };
      const over = (top: Rgba, under: Rgba): Rgba => {
        const a = top[3] + under[3] * (1 - top[3]);

        const mix = (i: 0 | 1 | 2) => (top[i] * top[3] + under[i] * under[3] * (1 - top[3])) / a;

        return [mix(0), mix(1), mix(2), a];
      };
      const luminance = ([r, g, b]: Rgba) => {
        const f = (v: number) => {
          const c = v / 255;

          return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
        };

        return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
      };
      const host = document.querySelector(tag)!;
      // Behind the box: the nearest background of claude.ai's own dialog.
      let behind: Rgba = [255, 255, 255, 1];
      for (let el: Element | null = host.parentElement; el; el = el.parentElement) {
        const bg = toRgba(getComputedStyle(el).backgroundColor);
        if (bg[3] > 0) {
          behind = over(bg, behind);
          break;
        }
      }
      const root = host.shadowRoot!;
      let lowest = Infinity;
      let count = 0;
      for (const el of root.querySelectorAll(sel.replace('::placeholder', ''))) {
        const chain: Element[] = [];
        for (let e: Element | null = el; e && e !== root.host; e = e.parentElement) chain.unshift(e);
        let back = behind;
        for (const e of chain) {
          const bg = toRgba(getComputedStyle(e).backgroundColor);
          if (bg[3] > 0) back = over(bg, back);
        }
        const isPlaceholder = sel.includes('placeholder');
        const style = getComputedStyle(el, isPlaceholder ? '::placeholder' : null);
        const text = toRgba(style.color);
        let opacity = 1;
        for (const e of chain) opacity *= Number(getComputedStyle(e).opacity);
        if (isPlaceholder) opacity *= Number(style.opacity);
        text[3] *= opacity;
        const fg = over(text, back);
        const [a, b] = [luminance(fg), luminance(back)];
        lowest = Math.min(lowest, (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05));
        count += 1;
      }

      return { lowest, count };
    },
    { tag: BOX, selector },
  );

const TEXT = '.chip-name, .chip-count, .note, .heading, .result-name, .result-lists';

async function expectReadable(host: Frame, selector: string) {
  const { lowest, count } = await lowestContrast(host, selector);
  expect(count, `something matches ${selector}`).toBeGreaterThan(0);
  expect(lowest, `contrast of ${selector}`).toBeGreaterThanOrEqual(4.5);
}

/** Runs through every kind of text the box draws, in the theme the dialog is in now. */
async function expectEverythingReadable(host: Frame) {
  // Chips, one of them picked (a Can edit list, so its note shows too).
  // (Called again after a theme switch, with Team still picked from before: a click would undo it.)
  if ((await chip(host, 'Team').getAttribute('aria-pressed')) !== 'true') await chip(host, 'Team').click();
  await expect(chip(host, 'Team')).toHaveAttribute('aria-pressed', 'true');
  await expect(box(host).locator('.note.warning')).toBeVisible();
  await expectReadable(host, TEXT);
  await expectReadable(host, '.chip[aria-pressed=true] .chip-name, .chip[aria-pressed=true] .chip-count');
  await expectReadable(host, '.search');
  await expectReadable(host, '.search::placeholder');
  // Search rows, one of them picked.
  await search(host).fill('e');
  await expect(box(host).locator('.result').first()).toBeVisible();
  await expectReadable(host, TEXT);
  await expectReadable(host, '.result[aria-pressed=true] .result-name, .result[aria-pressed=true] span');
  // Nothing found.
  await search(host).fill('zzzz');
  await expect(box(host).locator('.note', { hasText: 'No lists or people match' })).toBeVisible();
  await expectReadable(host, '.note');
  await search(host).fill('');
}

test('light dialog: the box takes claude.ai’s font and colour, its chips are quiet, and all text is readable', async ({
  context,
  panel,
}) => {
  await writeLists(panel, LISTS);
  const { host } = await openShare(context);

  const look = await host.evaluate((tag) => {
    const root = document.querySelector(tag)!.shadowRoot!;
    const el = root.querySelector('.chip')!;
    const chipStyle = getComputedStyle(el);
    const dialog = document.querySelector('[role=dialog]')!;

    return {
      chipFont: chipStyle.fontFamily,
      boxFont: getComputedStyle(root.querySelector('.box')!).fontFamily,
      dialogFont: getComputedStyle(dialog).fontFamily,
      chipColor: chipStyle.color,
      dialogColor: getComputedStyle(dialog).color,
      chipBackground: chipStyle.backgroundColor,
      chipRadius: chipStyle.borderRadius,
    };
  }, BOX);
  expect(look.chipFont).toBe(look.dialogFont);
  expect(look.boxFont).toBe(look.dialogFont);
  expect(look.chipColor).toBe(look.dialogColor);
  // Quiet: no filled colour until picked, only a faint outline.
  expect(look.chipBackground).toBe('rgba(0, 0, 0, 0)');
  expect(look.chipRadius).toBe('999px');

  await expectEverythingReadable(host);
});

test('dark dialog: the box is dark too, and switching the theme with the dialog open switches the box', async ({
  context,
  panel,
}) => {
  await writeLists(panel, LISTS);
  const { host } = await openShare(context, { mode: 'dark' });

  const colour = () =>
    host.evaluate((tag) => {
      const chipEl = document.querySelector(tag)!.shadowRoot!.querySelector('.chip')!;
      const dialog = document.querySelector('[role=dialog]')!;

      return { chip: getComputedStyle(chipEl).color, dialog: getComputedStyle(dialog).color };
    }, BOX);

  const dark = await colour();
  expect(dark.chip).toBe(dark.dialog);
  // Light text on a dark dialog.
  expect(Number(dark.chip.match(/\d+/)![0])).toBeGreaterThan(200);
  await expectEverythingReadable(host);

  // Back to light while the dialog is open (claude.ai's theme switch).
  await host.evaluate(() => window.__standIn.setMode('light'));
  await expect.poll(async () => (await colour()).chip).not.toBe(dark.chip);
  const light = await colour();
  expect(light.chip).toBe(light.dialog);
  expect(Number(light.chip.match(/\d+/)![0])).toBeLessThan(80);
  await expectEverythingReadable(host);

  await host.evaluate(() => window.__standIn.setMode('dark'));
  await expect.poll(async () => (await colour()).chip).toBe(dark.chip);
  await expectEverythingReadable(host);
});

test('opening the dialog leaves focus where claude.ai puts it, and the box never takes it', async ({
  context,
  panel,
}) => {
  await writeLists(panel, LISTS);
  const { host } = await openShare(context);

  expect(await focused(host)).toBe('dialog');
  // The box is built a moment after the dialog; it stays out of focus then, and when lists change.
  await expect(chip(host, 'Team')).toBeVisible();
  await expect.poll(() => focused(host)).toBe('dialog');
  await writeLists(panel, [...LISTS, { name: 'Late', emails: ['l@example.com'] }]);
  await expect(chip(host, 'Late')).toBeVisible();
  expect(await focused(host)).toBe('dialog');
  // Nor does the search field's text or the box's own re-render do it: only the person's own click.
  await host.evaluate(() => window.__standIn.rerenderPinned());
  await expect(chip(host, 'Late')).toBeVisible();
  expect(await focused(host)).not.toMatch(/^box:/);
});

test('with only the keyboard: Tab through search and chips with a focus ring, pick, then reach claude.ai’s Invite', async ({
  context,
  panel,
}) => {
  await writeLists(panel, LISTS);
  const { host, page } = await openShare(context);
  const key = (k: string) => page.keyboard.press(k);

  await field(host).focus();
  await key('Tab');
  expect(await focused(host)).toBe('box:Search lists or people');
  // The outline of whatever in the box has focus.
  const ring = () =>
    host.evaluate(
      ({ tag, sel }) => {
        const el = document.querySelector(tag)!.shadowRoot!.querySelector(sel)!;
        const style = getComputedStyle(el);

        return { style: style.outlineStyle, width: Number.parseFloat(style.outlineWidth) };
      },
      { tag: BOX, sel: ':focus' },
    );
  expect(await ring()).toEqual({ style: 'solid', width: 2 });

  // The chips are in the order they are drawn (by name): Design, Reviewers, Team.
  for (const name of ['Design, 2 people', 'Reviewers, 1 person', 'Team, 3 people']) {
    await key('Tab');
    expect(await focused(host)).toBe(`box:${name}`);
    expect(await ring()).toEqual({ style: 'solid', width: 2 });
  }

  // Shift+Tab walks back along the chips to the search field and on to claude.ai's invite field.
  await key('Shift+Tab');
  expect(await focused(host)).toBe('box:Reviewers, 1 person');
  await key('Shift+Tab');
  await key('Shift+Tab');
  expect(await focused(host)).toBe('box:Search lists or people');
  await key('Shift+Tab');
  expect(await focused(host)).toBe('Invite people by email');

  // Enter and Space both pick a chip, and focus goes to the invite field.
  await chip(host, 'Team').focus();
  await key('Enter');
  await expect(field(host)).toHaveValue('a@example.com, b@example.com, c@example.com');
  expect(await focused(host)).toBe('Invite people by email');
  await expect(chip(host, 'Team')).toHaveAttribute('aria-pressed', 'true');

  // Back to the chips from the invite field, Space this time, which adds Design.
  await key('Tab');
  await key('Tab');
  expect(await focused(host)).toBe('box:Design, 2 people');
  await key('Space');
  await expect(field(host)).toHaveValue(
    'a@example.com, b@example.com, c@example.com, d@example.com, e@example.com',
  );
  expect(await focused(host)).toBe('Invite people by email');

  // From the invite field Arrow Down and Enter reach claude.ai's own option.
  await key('ArrowDown');
  await expect(host.getByRole('option', { name: /Invite 5 people/ })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  expect(await invited(host)).toEqual([]);
  await key('Enter');
  expect(await invited(host)).toEqual([
    { emails: ['a@example.com', 'b@example.com', 'c@example.com', 'd@example.com', 'e@example.com'] },
  ]);
});

test('Escape in the search field clears the text and keeps the dialog open; with it empty Escape closes the dialog', async ({
  context,
  panel,
}) => {
  await writeLists(panel, LISTS);
  const { host, page } = await openShare(context);
  const dialog = host.locator('[data-share-pop]');

  await search(host).fill('des');
  await expect(box(host).locator('.result')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(search(host)).toHaveValue('');
  await expect(chip(host, 'Design')).toBeVisible();
  await expect(dialog).toHaveAttribute('data-open', '');
  // Still in the search field, so another Escape is the person's call.
  expect(await focused(host)).toBe('box:Search lists or people');

  await page.keyboard.press('Escape');
  await expect(dialog).toHaveAttribute('data-closed', '');
  await expect(host.locator('[data-share-pop]')).toHaveCount(0);
});

test('Escape on a chip, which is not the search field, still closes the dialog', async ({
  context,
  panel,
}) => {
  await writeLists(panel, LISTS);
  const { host, page } = await openShare(context);

  await chip(host, 'Team').focus();
  await page.keyboard.press('Escape');
  await expect(host.locator('[data-share-pop]')).toHaveCount(0);
});

test('the box is a group named Share lists, chips are toggle buttons named with their count, and messages are polite', async ({
  context,
  panel,
}) => {
  await writeLists(panel, [...LISTS, { name: 'Empty', emails: [] }]);
  const { host } = await openShare(context);

  const group = host.getByRole('group', { name: 'Share lists' });
  await expect(group).toHaveCount(1);
  // The group holds every chip, including the one that can't be picked.
  await expect(group.getByRole('button')).toHaveCount(4);
  await expect(group.getByRole('button', { name: 'Team, 3 people' })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  await expect(group.getByRole('button', { name: 'Reviewers, 1 person' })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  await expect(group.getByRole('button', { name: 'Empty, 0 people' })).toHaveAttribute(
    'aria-pressed',
    'false',
  );

  const live = group.getByRole('status');
  await expect(live).toHaveAttribute('aria-live', 'polite');
  await expect(live).toHaveText('');
  await group.getByRole('button', { name: 'Team, 3 people' }).click();
  await expect(group.getByRole('button', { name: 'Team, 3 people' })).toHaveAttribute('aria-pressed', 'true');
  await expect(live).toHaveText('3 addresses added. Choose Invite 3 people to invite them.');
  // The live region is not drawn: it takes no room in the box.
  const size = await live.evaluate((el) => ({
    w: el.getBoundingClientRect().width,
    h: el.getBoundingClientRect().height,
  }));
  expect(size.w).toBeLessThanOrEqual(1);
  expect(size.h).toBeLessThanOrEqual(1);

  await group.getByRole('button', { name: 'Team, 3 people' }).click();
  await expect(live).toHaveText('3 addresses removed.');
});

test('at the dialog’s 435 px the box lines up with the invite field', async ({ context, panel }) => {
  await writeLists(panel, LISTS);
  const { host } = await openShare(context);

  const edges = await host.evaluate((tag) => {
    const entry = document.querySelector('[data-share-entry]')!.getBoundingClientRect();
    const mine = document.querySelector(tag)!.getBoundingClientRect();
    const search = document.querySelector(tag)!.shadowRoot!.querySelector('.search')!.getBoundingClientRect();

    return {
      dialog: document.querySelector('[data-share-pop]')!.getBoundingClientRect().width,
      entry: [entry.left, entry.right],
      box: [mine.left, mine.right],
      search: [search.left, search.right],
    };
  }, BOX);
  expect(edges.dialog).toBe(435);
  expect(edges.box).toEqual(edges.entry);
  expect(edges.search).toEqual(edges.entry);
});

test('in a narrow window chips wrap, nothing overflows sideways, and a 60-character name is cut with … but whole in its tooltip and name', async ({
  context,
  panel,
}) => {
  expect(LONG).toHaveLength(60);
  const name = LONG;
  await writeLists(panel, [
    { name, emails: ['l@example.com', 'm@example.com'] },
    { name: 'Team', emails: ['a@example.com', 'b@example.com', 'c@example.com'] },
    { name: 'Design', emails: ['d@example.com'] },
    { name: 'Reviewers', emails: ['r@example.com'] },
    { name: 'Marketing', emails: ['m1@example.com'] },
  ]);
  const { host, page } = await openArtifact(context);
  // 336 px wide leaves 320 px for the dialog (it keeps 8 px of margin on each side).
  await page.setViewportSize({ width: 336, height: 700 });
  await page.getByRole('button', { name: 'Share', exact: true }).click();
  await expect(host.locator('[data-share-pop][data-open]')).toBeVisible();

  const layout = await host.evaluate((tag) => {
    const root = document.querySelector(tag)!.shadowRoot!;
    const doc = document.documentElement;
    const chips = [...root.querySelectorAll('.chip')].map((c) => c.getBoundingClientRect());
    const area = root.querySelector('.chips')!;
    const long = [...root.querySelectorAll('.chip-name')].find((n) =>
      n.textContent?.startsWith('Quarterly'),
    )!;

    return {
      dialog: document.querySelector('[data-share-pop]')!.getBoundingClientRect().width,
      pageOverflow: doc.scrollWidth - doc.clientWidth,
      boxOverflow: root.querySelector('.box')!.scrollWidth - root.querySelector('.box')!.clientWidth,
      chipsOverflow: area.scrollWidth - area.clientWidth,
      rows: new Set(chips.map((c) => Math.round(c.top))).size,
      areaRight: area.getBoundingClientRect().right,
      rights: chips.map((c) => c.right),
      cut: long.scrollWidth > long.clientWidth,
      ellipsis: getComputedStyle(long).textOverflow,
    };
  }, BOX);
  expect(layout.dialog).toBe(320);
  expect(layout.pageOverflow).toBeLessThanOrEqual(0);
  expect(layout.boxOverflow).toBeLessThanOrEqual(0);
  expect(layout.chipsOverflow).toBeLessThanOrEqual(0);
  expect(layout.rows).toBeGreaterThan(1);
  for (const right of layout.rights) expect(right).toBeLessThanOrEqual(layout.areaRight + 0.5);
  expect(layout.cut).toBe(true);
  expect(layout.ellipsis).toBe('ellipsis');

  const long = box(host).locator('.chip', { hasText: 'Quarterly' });
  await expect(long).toHaveAttribute('title', name);
  await expect(long).toHaveAccessibleName(`${name}, 2 people`);
  expect(await long.evaluate((el) => (el as HTMLElement).innerText)).toContain(name);

  // Results are not cut sideways either.
  await search(host).fill('quarterly');
  await expect(box(host).locator('.result')).toHaveCount(1);
  const wide = await host.evaluate((tag) => {
    const root = document.querySelector(tag)!.shadowRoot!;
    const results = root.querySelector('.results')!;

    return results.scrollWidth - results.clientWidth;
  }, BOX);
  expect(wide).toBeLessThanOrEqual(0);
  expect(await invited(host)).toEqual([]);
});
