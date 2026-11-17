import { readFileSync, readdirSync } from 'node:fs';
import { expect, test } from '@playwright/test';

// F014: the README, the privacy policy and the website describe the ArtiShare lists box in claude.ai's
// Share dialog. No browser is needed; this reads the files so the wording can't quietly drift.

const root = new URL('../', import.meta.url);
const text = (path: string) => readFileSync(new URL(path, root)).toString('utf8');
const flat = (html: string) => html.replace(/\s+/g, ' ');

const readme = text('README.md');
const privacy = flat(text('docs/privacy.html'));
const site = flat(text('docs/index.html'));

const sectionStart = readme.indexOf("### Optional: the ArtiShare lists box in claude.ai's Share dialog");
const section = readme.slice(sectionStart, readme.indexOf('## Good to know', sectionStart));

test("README: a section about the ArtiShare lists box in claude.ai's Share dialog", () => {
  expect(sectionStart).toBeGreaterThan(0);
  expect(section.length).toBeGreaterThan(500);
});

test('README: where it appears, chips with counts, search, and picking fills the field', () => {
  for (const phrase of [
    '**ArtiShare lists** box',
    "claude.ai's own Share dialog",
    '**Invite people by email** field',
    "isn't on the dialog's Export tab",
    '**A chip for each list**',
    'with the number of people in it',
    '**Search**',
    'list names and in addresses',
    '**Click a chip**',
    "put into claude.ai's field",
    'Pick several lists and they combine',
    'added once',
  ]) {
    expect(section, phrase).toContain(phrase);
  }
});

test("README: claude.ai's Invite sends and sets the permission; the box invites nobody", () => {
  for (const phrase of [
    '**You send it from claude.ai.**',
    'The box invites nobody',
    "claude.ai's own **Invite** option",
    "claude.ai's Invite sets the permission",
    'the ArtiShare popup',
  ]) {
    expect(section, phrase).toContain(phrase);
  }
});

test('README: the 50-people warning and the fallbacks', () => {
  for (const phrase of ['**Over 50 people:**', 'more than 50 addresses', '**Copy** button', '**Retry**']) {
    expect(section, phrase).toContain(phrase);
  }
});

test('README: the popup and side panel sections and the Limits table are still there', () => {
  for (const phrase of [
    '**Side panel:** the header',
    '### 1. Make a list',
    '### 3. Pick artifacts and lists',
    '### Optional: Manage access',
    '## Limits',
    '**At most 50 people outside your organization per artifact.**',
  ]) {
    expect(readme, phrase).toContain(phrase);
  }
  // The new section is linked from the popup's introduction, and the anchor resolves.
  expect(readme).toContain('(#optional-the-artishare-lists-box-in-claudeais-share-dialog)');
});

test('README: the layout names the content script', () => {
  expect(readme).toContain('share-lists.content');
});

test('privacy policy: it also runs on claude.ai, reads only the lists, fills the field when you pick, sends nothing', () => {
  const start = privacy.indexOf('<h2>The ArtiShare lists box on claude.ai</h2>');
  expect(start).toBeGreaterThan(0);
  const part = privacy.slice(start, privacy.indexOf('<h2>', start + 10));
  for (const phrase of [
    'also runs on claude.ai pages',
    'ArtiShare lists</strong> box',
    'reads your saved lists from the extension, and nothing else',
    'only when you pick a list or a person',
    "doesn't invite anyone itself",
    'sends nothing to any server',
    'makes no requests of its own',
    'ask ArtiShare for your lists and for nothing else',
    'only if you click its <strong>Copy</strong> button',
  ]) {
    expect(part, phrase).toContain(phrase);
  }
  // It still says ArtiShare talks only to claude.ai.
  expect(privacy).toContain('ArtiShare talks only to <strong>claude.ai</strong>');
});

test("privacy policy: 'last updated' is the day of the change or later", () => {
  const match = /Last updated: (\d{1,2}) (\w+) (\d{4})/.exec(privacy);
  expect(match).not.toBeNull();
  const updated = Date.parse(`${match![1]} ${match![2]} ${match![3]} UTC`);
  expect(updated).toBeGreaterThanOrEqual(Date.parse('17 November 2026 UTC'));
});

test('website: mentions the ArtiShare lists box in a sentence or two', () => {
  const at = site.indexOf('ArtiShare lists</strong> box');
  expect(at).toBeGreaterThan(0);
  const item = site.slice(at, site.indexOf('</li>', at));
  expect(item).toContain("claude.ai's own Share dialog");
  expect(item).toContain('a search across lists and people');
  expect(item).toContain("claude.ai's own <strong>Invite</strong>");
  expect(item).toContain('invites nobody');
  // The popup wording of the site is untouched.
  expect(site).toContain('Open in side panel');
  expect(site).toContain('Manage access</strong> icon');
});

test('no made-up screenshot of the box: no picture of it unless a human adds one', () => {
  const pictures = readdirSync(new URL('docs/images/', root)).filter((name) => name.endsWith('.png'));
  const ofTheBox = pictures.filter((name) => /share-?lists|in-?page|dialog/i.test(name));
  // A human may add one from real claude.ai; until then none of the docs points at one, and the
  // generator (which only knows the popup, the side panel and the stand-in) doesn't make one.
  if (ofTheBox.length === 0) {
    for (const [name, body] of [
      ['README.md', readme],
      ['docs/index.html', site],
    ]) {
      expect(body, name).not.toMatch(/<img[^>]*(share-?lists|in-?page|dialog)/i);
      expect(body, name).not.toMatch(/\]\(docs\/images\/[^)]*(share-?lists|in-?page|dialog)/i);
    }
  }
  const generator = text('scripts/screenshots.spec.ts');
  expect(generator).not.toMatch(/stand-?in|claudePage|share-lists/i);
});
