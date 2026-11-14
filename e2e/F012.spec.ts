import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

// F012: the docs describe Use popup instead opening the popup, and saving people with access to a
// list. No browser is needed; this reads the files so the wording can't quietly drift back.

const root = new URL('..', import.meta.url);
const text = (path: string) => readFileSync(new URL(path, root)).toString('utf8');

const readme = text('README.md');
const listing = text('store/listing.md');
const site = text('docs/index.html').replace(/\s+/g, ' ');

const sidePanelParagraph = readme.slice(
  readme.indexOf('**Side panel:**'),
  readme.indexOf('\n', readme.indexOf('**Side panel:**')),
);
const manageSection = readme.slice(
  readme.indexOf('### Optional: Manage access'),
  readme.indexOf('## Good to know'),
);

test('README side panel: Use popup instead opens the popup and closes every side panel', () => {
  for (const phrase of [
    '**Use popup instead**',
    'opens the popup straight away and closes the side panel',
    'in your other windows',
  ]) {
    expect(sidePanelParagraph, phrase).toContain(phrase);
  }
});

test("README side panel: what happens when Chrome can't open the popup", () => {
  for (const phrase of [
    "If Chrome can't open the popup",
    'the side panel stays open',
    "Switched to the popup, but Chrome couldn't open it",
    'click the ArtiShare icon in the toolbar',
    'when Chrome refuses',
    'just "Switched to the popup." in a Chrome older than 127',
    '**Open popup**',
  ]) {
    expect(sidePanelParagraph, phrase).toContain(phrase);
  }
});

test('README Manage access: the lists each person is in and Save to a list', () => {
  for (const phrase of [
    "which of your lists they're in",
    '_Not in a list_',
    "aren't in any of your lists",
    '**Save to a list**',
    'a checkbox per person',
    '**Select all**',
    '**New list**',
    '**Add to an existing list**',
    'Saved 3 people to Team.',
    'Added 3 people to Team.',
    '**Add 3 people to Team**',
    '**Open list**',
    'their access to the artifact stays as it is',
  ]) {
    expect(manageSection, phrase).toContain(phrase);
  }
});

test('store listing: the side panel and Manage access say the same', () => {
  expect(listing).toContain(
    '"Use popup instead" icon opens the popup straight away and closes the side panel',
  );
  expect(listing).toContain("if Chrome can't open the popup, the side panel stays open");
  expect(listing).toContain('"Save to a list" saves the people who aren\'t in any list');
  expect(listing).toContain("Their access to the artifact doesn't change");
});

test('website: Use popup instead and Save to a list', () => {
  expect(site).toContain(
    '<strong>Use popup instead</strong> opens the popup again and closes the side panel',
  );
  expect(site).toContain("<strong>Save to a list</strong> saves the people who aren't in any list");
  expect(site).toContain("their access to the artifact doesn't change");
});

test('nothing says Use popup instead only switches the toolbar icon', () => {
  for (const [name, body] of [
    ['README.md', readme],
    ['store/listing.md', listing],
    ['docs/index.html', site],
  ]) {
    expect(body, name).not.toMatch(/Use popup instead[^.]*(only|just) (switch|chang|mak)/i);
    expect(body, name).not.toContain('moves it back');
    expect(body, name).not.toContain('makes the toolbar icon open the popup again');
  }
});

test("the README's Limits table is still there", () => {
  const limits = readme.slice(readme.indexOf('## Limits'));
  expect(limits).toContain('What ArtiShare does');
  expect(limits).toContain("claude.ai's own sharing rules");
});
