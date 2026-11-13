import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

// F018: the README and store screenshots show the popup. The pictures themselves come from
// `npm run screenshots`; this checks they exist at the right size, that the README points at them,
// and that none of them carries a real address or artifact id (the generator only knows made-up ones,
// so the same list of ids is checked in its source).

const root = new URL('..', import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root));

/** Width and height from a PNG's IHDR chunk. */
function size(path: string) {
  const png = read(path);
  expect(png.subarray(1, 4).toString(), `${path} is a PNG`).toBe('PNG');

  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}

test('README images are the popup at 380 px (drawn at 2x), up to 600 px tall', () => {
  for (const name of ['share', 'preview', 'done', 'manage']) {
    const { width, height } = size(`docs/images/${name}.png`);
    expect(width, name).toBe(760);
    expect(height, name).toBeGreaterThan(400);
    expect(height, name).toBeLessThanOrEqual(1200);
  }
});

test('store screenshots are 1280×800', () => {
  for (const name of ['1-share', '2-preview', '3-done']) {
    expect(size(`store/images/screenshot-${name}.png`), name).toEqual({ width: 1280, height: 800 });
  }
});

test('the README shows all four images, each with alt text naming the popup', () => {
  const readme = read('README.md').toString();
  for (const name of ['share', 'preview', 'done', 'manage']) {
    const tag = new RegExp(`<img src="docs/images/${name}\\.png"[^>]*alt="([^"]+)"`).exec(readme);
    expect(tag, `${name}.png is in the README`).not.toBeNull();
    expect(tag![1]).toMatch(/popup/i);
  }
  expect(readme).not.toContain('alt="Share tab: pick artifacts and lists"');
});

test('the screenshot generator only uses made-up addresses and artifact ids', () => {
  const source = read('scripts/screenshots.spec.ts').toString();
  const ids = [...source.matchAll(/claude\.ai\/artifact\/(\w+)/g)].map((m) => m[1]);
  expect(ids.length).toBeGreaterThan(0);
  for (const id of ids) expect(id, id).toMatch(/^Ex4mple/);

  const addresses = [...source.matchAll(/[\w.]+@([\w.]+)/g)].map((m) => m[1]);
  for (const domain of addresses) expect(domain, domain).toMatch(/\.example$|^example\.com$/);
  // The names are joined to a domain at run time (`${n}@acme.example`).
  expect(source).not.toMatch(/@(gmail|outlook|yahoo|anthropic)\./);
});
