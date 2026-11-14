import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

// F018: the README and store pictures show the header icons, the Artifacts rows and the side panel.
// The pictures come from `npm run screenshots`; this checks they exist at the right size, that the
// README shows them with alt text, and that the generator only knows made-up addresses and ids. (The
// older popup-and-manage-access/F018 spec covers the four popup images.)

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

test('the generator shows the header icons and the Artifacts rows in the popup pictures', () => {
  // The popup is opened over an artifact tab, so the Manage access icon is in the header and the
  // tab's artifact is a row; a second link is added as a row too.
  expect(source).toContain("getByRole('button', { name: 'Manage access' })");
  expect(source).toContain('await expect(manage).toBeVisible()');
  expect(source).toContain('toHaveCount(2)');
  // From the top, so the rows are in the picture (the Preview button is below the fold).
  expect(source).not.toContain('scrollHeight');
  for (const name of ['share', 'preview', 'done', 'manage']) {
    expect(source, name).toContain(`\${DOCS}/${name}.png`);
  }
});

test('docs/images/sidepanel.png is the side panel, a tall picture drawn at 2x', () => {
  const { width, height } = size('docs/images/sidepanel.png');
  expect(width).toBe(800);
  expect(height).toBe(1600);
  // Opens the side panel page, in the Lists tab, with a list that needs the taller address box.
  expect(source).toContain("'sidepanel.html'");
  expect(source).toContain("getByRole('tab', { name: /Lists/ })");
  const count = /length: (\d+)/.exec(source.slice(source.indexOf('async function sidePanelImage')));
  expect(Number(count?.[1])).toBeGreaterThanOrEqual(30);
});

test('the README shows the side panel picture with alt text naming the side panel', () => {
  const tag = /<img src="docs\/images\/sidepanel\.png"[^>]*alt="([^"]+)"/.exec(readme);
  expect(tag, 'sidepanel.png is in the README').not.toBeNull();
  expect(tag![1]).toMatch(/side panel/i);
  expect(tag![1]).toMatch(/Lists/);
  // The Share picture says what is new in it.
  const share = /<img src="docs\/images\/share\.png"[^>]*alt="([^"]+)"/.exec(readme);
  expect(share![1]).toMatch(/rows/);
  expect(share![1]).toMatch(/Manage access/);
  expect(share![1]).toMatch(/side panel/i);
});

test('store screenshots are regenerated at 1280×800', () => {
  for (const name of ['1-share', '2-preview', '3-done']) {
    expect(size(`store/images/screenshot-${name}.png`), name).toEqual({ width: 1280, height: 800 });
    expect(source, name).toContain(`screenshot-${name}.png`);
  }
});

test('every address and artifact id in the generator is made up', () => {
  const ids = [...source.matchAll(/claude\.ai\/artifact\/(\w+)/g)].map((m) => m[1]);
  expect(ids.length).toBeGreaterThan(0);
  for (const id of ids) expect(id, id).toMatch(/^Ex4mple/);

  // Names are joined to a domain at run time (`${n}@acme.example`), so look at every domain.
  const domains = [...source.matchAll(/@([a-z][\w.]*)/g)].map((m) => m[1]).filter((d) => d?.includes('.'));
  expect(domains.length).toBeGreaterThan(0);
  for (const domain of domains) expect(domain, domain).toMatch(/\.example(\.com)?$|^example\.com$/);
  expect(source).not.toMatch(/@(gmail|outlook|yahoo|anthropic)\./);
});
