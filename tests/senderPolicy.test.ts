import { describe, expect, it } from 'vitest';
import type { MessageType } from '../src/lib/messages';
import { judgeSender } from '../src/lib/senderPolicy';

const ID = 'eeihicglfclmofckclcpjleekpddjflg';
const ALL: MessageType[] = [
  'config-get',
  'config-change',
  'whoami',
  'preview',
  'sharees',
  'change-access',
  'remove-invite',
  'start',
  'stop',
  'resume',
  'clear',
];

const script = (url: string | undefined) => ({ id: ID, tab: { id: 1 }, url });
const own = { id: ID, url: `chrome-extension://${ID}/popup.html` };

describe('a content script on claude.ai', () => {
  for (const type of ALL) {
    const reads = type === 'config-get';
    it(`${reads ? 'may' : 'may not'} send ${type}`, () => {
      const verdict = judgeSender(type, script('https://claude.ai/code/artifact/x'), ID);
      expect(verdict).toEqual(
        reads ? { allow: true } : { allow: false, reason: 'A claude.ai page can only read your lists.' },
      );
    });
  }

  it('is refused anything that is not a known message', () => {
    expect(judgeSender('anything', script('https://claude.ai/'), ID).allow).toBe(false);
    expect(judgeSender(undefined, script('https://claude.ai/'), ID).allow).toBe(false);
    expect(judgeSender({ toString: () => 'config-get' }, script('https://claude.ai/'), ID).allow).toBe(false);
  });
});

describe('a content script anywhere else', () => {
  for (const url of [
    undefined,
    '',
    'not a url',
    'http://claude.ai/',
    'https://claude.ai.evil.com/',
    'https://evil.com/https://claude.ai/',
    'https://claude.ai@evil.com/',
    'https://claude.ai:8443/',
    'https://www.claude.ai/',
    'https://example.com/',
    'about:blank',
    'data:text/html,hi',
  ]) {
    it(`gets nothing, not even config-get, from ${String(url)}`, () => {
      expect(judgeSender('config-get', script(url), ID).allow).toBe(false);
      expect(judgeSender('start', script(url), ID).allow).toBe(false);
    });
  }
});

describe("ArtiShare's own pages", () => {
  for (const type of ALL) {
    it(`may send ${type}, with or without a tab (the popup opened as a tab)`, () => {
      expect(judgeSender(type, own, ID).allow).toBe(true);
      const inTab = { ...own, tab: { id: 2 }, url: `chrome-extension://${ID}/sidepanel.html` };
      expect(judgeSender(type, inTab, ID).allow).toBe(true);
    });
  }

  it("don't pass for another extension's pages", () => {
    expect(judgeSender('start', { id: ID, url: 'chrome-extension://other/popup.html' }, ID).allow).toBe(
      false,
    );
  });
});

describe('a message from another extension', () => {
  it('is refused', () => {
    expect(judgeSender('config-get', { id: 'other', url: 'https://claude.ai/' }, ID).allow).toBe(false);
    expect(judgeSender('config-get', { url: 'https://claude.ai/' }, ID).allow).toBe(false);
  });
});
