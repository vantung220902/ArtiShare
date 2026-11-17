import { describe, expect, it } from 'vitest';
import { fieldKeys, inviteText, isPicked } from '../src/core/inviteField';

describe('inviteText', () => {
  it('joins with a comma and a space, in the list order', () => {
    expect(inviteText(['a@example.com', 'b@example.com', 'c@example.com'])).toBe(
      'a@example.com, b@example.com, c@example.com',
    );
  });

  it('writes an address once when two are the same inbox', () => {
    expect(inviteText(['A.B@gmail.com', 'A.B+x@gmail.com', 'c@example.com'])).toBe(
      'A.B@gmail.com, c@example.com',
    );
  });

  it('is empty for no addresses', () => {
    expect(inviteText([])).toBe('');
  });
});

describe('fieldKeys and isPicked', () => {
  it('reads entries split by commas, spaces and newlines', () => {
    expect([...fieldKeys('a@example.com,b@example.com\nC@Example.com; d@example.com ')]).toEqual([
      'a@example.com',
      'b@example.com',
      'c@example.com',
      'd@example.com',
    ]);
  });

  it('picks a list only when all its addresses are there', () => {
    const team = ['a@example.com', 'b@example.com'];
    expect(isPicked(team, 'a@example.com, b@example.com, x@example.com')).toBe(true);
    expect(isPicked(team, 'a@example.com')).toBe(false);
    expect(isPicked(team, '')).toBe(false);
    expect(isPicked([], 'a@example.com')).toBe(false);
  });
});
