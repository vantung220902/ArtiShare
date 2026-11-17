import { describe, expect, it } from 'vitest';
import { togglePick, unfinishedEntries } from '../src/core/inviteField';

describe('unfinishedEntries', () => {
  it('lists entries that are not full addresses', () => {
    expect(unfinishedEntries('a@example.com, ali, b@, c@example.com')).toEqual(['ali', 'b@']);
    expect(unfinishedEntries('a@example.com, ')).toEqual([]);
    expect(unfinishedEntries('')).toEqual([]);
  });
});

describe('togglePick', () => {
  const team = ['a@example.com', 'b@example.com', 'c@example.com'];
  const design = ['c@example.com', 'd@example.com'];

  it('puts a list in an empty field', () => {
    expect(togglePick('', team, [])).toEqual({
      text: 'a@example.com, b@example.com, c@example.com',
      changed: 3,
      added: true,
    });
  });

  it('adds a second list without repeating shared addresses', () => {
    const first = togglePick('', team, []).text;
    expect(togglePick(first, design, [team])).toEqual({
      text: 'a@example.com, b@example.com, c@example.com, d@example.com',
      changed: 1,
      added: true,
    });
  });

  it('counts the same inbox once', () => {
    const first = togglePick('', ['A.B@gmail.com'], []).text;
    expect(togglePick(first, ['a.b+x@gmail.com', 'z@example.com'], []).text).toBe(
      'A.B@gmail.com, z@example.com',
    );
  });

  it('takes a list out but keeps what another picked list still has', () => {
    const both = 'a@example.com, b@example.com, c@example.com, d@example.com';
    expect(togglePick(both, team, [design])).toEqual({
      text: 'c@example.com, d@example.com',
      changed: 2,
      added: false,
    });
  });

  it('keeps what was typed, before and after, when picking and unpicking', () => {
    const picked = togglePick('x@example.com', team, []).text;
    expect(picked).toBe('x@example.com, a@example.com, b@example.com, c@example.com');
    expect(togglePick(picked, team, []).text).toBe('x@example.com');
  });

  it('moves an unfinished entry to the end when picking', () => {
    expect(togglePick('ali', team, []).text).toBe('a@example.com, b@example.com, c@example.com, ali');
    expect(togglePick('ali, x@example.com', team, []).text).toBe(
      'x@example.com, a@example.com, b@example.com, c@example.com, ali',
    );
  });

  it('leaves an unfinished entry where it is when unpicking', () => {
    expect(togglePick('a@example.com, ali, b@example.com, c@example.com', team, []).text).toBe('ali');
  });

  it('does nothing for a list with no addresses', () => {
    expect(togglePick('x@example.com', [], [])).toEqual({ text: 'x@example.com', changed: 0, added: true });
  });
});
