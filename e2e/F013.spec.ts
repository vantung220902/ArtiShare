import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

// F013: the screenshots show Manage access with the lists each person is in, and Save to a list.
// The pictures come from `npm run screenshots`; this checks they exist at the right size, that the
// generator builds the scene the steps describe (and waits for it before taking the picture), that
// the README shows manage-save.png beside manage.png with alt text, and that everything is made up.

const root = new URL('..', import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root));
const source = read('scripts/screenshots.spec.ts').toString();
const readme = read('README.md').toString();

/** Width and height from a PNG's IHDR chunk. */
function size(path: string) {
  const png = read(path);
  expect(png.subarray(1, 4).toString(), `${path} is a PNG`).toBe('PNG');

  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}

/** The generator's code between the line that matches `from` and the next one that matches `to`. */
function between(from: string, to: string) {
  const start = source.indexOf(from);
  expect(start, `${from} is in the generator`).toBeGreaterThan(-1);
  const end = source.indexOf(to, start);
  expect(end, `${to} follows`).toBeGreaterThan(start);

  return source.slice(start, end);
}

test('manage.png is Manage access over a Shared artifact: one person in a list, two in none, the note', () => {
  expect(source).toContain("const SHARED = 'https://claude.ai/artifact/Ex4mpleShared");
  const scene = between('await tab.goto(SHARED)', '`${DOCS}/manage.png`');
  // A saved list holds one of the fake's three people, so one reads 'In Partners'…
  expect(scene).toContain("fill('viewer@example.com')");
  expect(scene).toContain("'In Partners'");
  // …and the other two read 'Not in a list', with the note and the button under them.
  expect(scene).toContain("'Not in a list'");
  expect(scene).toContain('toHaveCount(2)');
  expect(scene).toContain("2 people aren't in any of your lists.");
  expect(scene).toContain('toHaveCount(4)'); // you (owner) and the three people
  const { width, height } = size('docs/images/manage.png');
  expect(width).toBe(760);
  expect(height).toBeGreaterThan(400);
  expect(height).toBeLessThanOrEqual(1200);
});

test('manage-save.png is Save to a list with the boxes ticked, New list picked and a name typed', () => {
  const scene = between("name: 'Save to a list' }).click()", '`${DOCS}/manage-save.png`');
  expect(scene).toContain("getByRole('checkbox', { checked: true })");
  expect(scene).toContain("getByRole('radio', { name: 'New list' })).toBeChecked()");
  expect(scene).toContain("fill('Pending reviewers')");
  // The sticky Save bar would hide the Permission field if the picture were taken from the top.
  expect(source).toContain('`${DOCS}/manage-save.png`, true)');
  const { width, height } = size('docs/images/manage-save.png');
  expect(width).toBe(760);
  expect(height).toBeGreaterThan(400);
  expect(height).toBeLessThanOrEqual(1200);
});

test('the README shows manage-save.png right beside manage.png, with alt text for each', () => {
  const manage = /<img src="docs\/images\/manage\.png"[^>]*alt="([^"]+)">/.exec(readme);
  const save = /<img src="docs\/images\/manage-save\.png"[^>]*alt="([^"]+)">/.exec(readme);
  expect(manage, 'manage.png is in the README').not.toBeNull();
  expect(save, 'manage-save.png is in the README').not.toBeNull();
  // Next to each other: only the spacer is between the two tags, so they share a row.
  expect(readme).toMatch(
    /<img src="docs\/images\/manage\.png"[^>]*>\s*&nbsp;\s*<img src="docs\/images\/manage-save\.png"[^>]*>/,
  );
  expect(manage![1]).toMatch(/popup/i);
  expect(manage![1]).toMatch(/Manage access/);
  expect(manage![1]).toMatch(/lists/i);
  expect(manage![1]).toMatch(/Save to a list/);
  expect(save![1]).toMatch(/popup/i);
  expect(save![1]).toMatch(/Save to a list/);
  expect(save![1]).toMatch(/New list/);
  expect(save![1]).toMatch(/name/i);
  // The other pictures are still there.
  for (const name of ['share', 'preview', 'done', 'sidepanel']) {
    expect(readme, name).toContain(`docs/images/${name}.png`);
  }
});

test('the store screenshots stay 1280×800', () => {
  for (const name of ['1-share', '2-preview', '3-done', '4-manage', '5-save']) {
    expect(size(`store/images/screenshot-${name}.png`), name).toEqual({ width: 1280, height: 800 });
    expect(source, name).toContain(`screenshot-${name}.png`);
  }
});

test('every address and artifact id the generator uses is made up', () => {
  const ids = [...source.matchAll(/claude\.ai\/artifact\/(\w+)/g)].map((m) => m[1]);
  expect(ids.length).toBeGreaterThan(0);
  for (const id of ids) expect(id, id).toMatch(/^Ex4mple/);

  const domains = [...source.matchAll(/@([a-z][\w.]*)/g)].map((m) => m[1]).filter((d) => d?.includes('.'));
  expect(domains).toContain('example.com'); // viewer@example.com
  for (const domain of domains) expect(domain, domain).toMatch(/\.example(\.com)?$|^example\.com$/);
  expect(source).not.toMatch(/@(gmail|outlook|yahoo|anthropic)\./);
});
