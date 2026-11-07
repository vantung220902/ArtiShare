import { describe, expect, it } from 'vitest';
import { domainOf, isValidEmail, mergeEmails, normalizeEmail, parseEmails } from '../src/core/emails';

describe('normalizeEmail', () => {
  it('trims, lowercases and strips wrappers', () => {
    expect(normalizeEmail('  Alice@Example.COM ')).toBe('alice@example.com');
    expect(normalizeEmail('<bob@x.io>')).toBe('bob@x.io');
    expect(normalizeEmail('"carol@x.io",')).toBe('carol@x.io');
    expect(normalizeEmail('mailto:dan@x.io')).toBe('dan@x.io');
  });
});

describe('isValidEmail', () => {
  it.each(['a@b.co', 'first.last+tag@sub.domain.org', "o'neil@x.ie"])('accepts %s', (e) => {
    expect(isValidEmail(e)).toBe(true);
  });
  it.each(['a@b', '@b.co', 'a@@b.co', 'a b@c.co', 'a@-b.co', 'a@b..co', ''])('rejects %s', (e) => {
    expect(isValidEmail(e)).toBe(false);
  });
});

describe('parseEmails', () => {
  it('splits on commas, semicolons, whitespace and newlines', () => {
    const r = parseEmails('a@x.io, b@x.io;c@x.io\n d@x.io\te@x.io');
    expect(r.valid).toEqual(['a@x.io', 'b@x.io', 'c@x.io', 'd@x.io', 'e@x.io']);
    expect(r.invalid).toEqual([]);
  });

  it('reads any column of a CSV export and ignores headers and names', () => {
    const csv = ['name,email,role', '"Smith, Alice",alice@acme.com,PM', 'Bob Jones,BOB@acme.com,Dev'].join('\n');
    expect(parseEmails(csv).valid).toEqual(['alice@acme.com', 'bob@acme.com']);
  });

  it('handles "Name <email>" entries', () => {
    expect(parseEmails('Alice <alice@acme.com>, Bob<bob@acme.com>').valid).toEqual(['alice@acme.com', 'bob@acme.com']);
  });

  it('reports invalid tokens and duplicates', () => {
    const r = parseEmails('a@x.io broken@ A@X.IO nope@nowhere');
    expect(r.valid).toEqual(['a@x.io']);
    expect(r.invalid).toEqual(['broken@', 'nope@nowhere']);
    expect(r.duplicates).toEqual(['a@x.io']);
  });

  it('returns nothing for empty input', () => {
    expect(parseEmails('   ')).toEqual({ valid: [], invalid: [], duplicates: [] });
  });
});

describe('mergeEmails', () => {
  it('merges, normalizes, drops invalid and keeps first-seen order', () => {
    expect(mergeEmails(['B@x.io', 'a@x.io'], ['a@x.io', 'bad', 'c@x.io'])).toEqual(['b@x.io', 'a@x.io', 'c@x.io']);
  });
});

describe('domainOf', () => {
  it('returns the lowercased domain', () => {
    expect(domainOf('a@NimbleHQ.co')).toBe('nimblehq.co');
    expect(domainOf('nodomain')).toBe('');
  });
});
