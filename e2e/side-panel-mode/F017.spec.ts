import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

// F017: the docs describe the side panel choice, the Manage access icon and the Artifacts rows. No
// browser is needed; this reads the files so the wording can't quietly drift back.

const root = new URL('../..', import.meta.url);
const text = (path: string) => readFileSync(new URL(path, root)).toString('utf8');

const readme = text('README.md');
const listing = text('store/listing.md');
const site = text('docs/index.html').replace(/\s+/g, ' ');

test('README: the side panel choice, remembered, with work carried over', () => {
  for (const phrase of [
    'Open in side panel',
    'Use popup instead',
    'The choice is remembered',
    'Your work comes with you',
  ]) {
    expect(readme, phrase).toContain(phrase);
  }
});

test('README: Artifacts rows, pasting, This tab, × with Undo and no automatic re-adding', () => {
  for (const phrase of [
    'each artifact is a row',
    'Paste any number of links',
    '**This tab**',
    'switch to another artifact tab',
    '**Undo**',
    "isn't added back by itself",
  ]) {
    expect(readme, phrase).toContain(phrase);
  }
});

test('README: Manage access is a header icon', () => {
  const section = readme.slice(readme.indexOf('### Optional: Manage access'));
  expect(section).toContain('sits in the header');
});

test('store listing: sidePanel is justified and the description names the side panel', () => {
  expect(listing).toMatch(/\| `sidePanel`\s+\|/);
  const description = listing.slice(listing.indexOf('**Description:**'), listing.indexOf('**Support URL:**'));
  expect(description).toContain('side panel');
  expect(description).toContain('people icon in the header');
});

test('website: mentions the side panel and the Manage access icon', () => {
  expect(site).toContain('Open in side panel');
  expect(site).toContain('Manage access</strong> icon');
});

test("CLAUDE.md's layout names the side panel entrypoint", () => {
  expect(text('CLAUDE.md')).toMatch(/`popup\/`.*`sidepanel\/`/);
});

test('no doc says Manage access is at the bottom of the Share tab', () => {
  for (const [name, body] of [
    ['README.md', readme],
    ['store/listing.md', listing],
    ['docs/index.html', site],
  ]) {
    expect(body, name).not.toContain('bottom of the Share tab');
  }
});
