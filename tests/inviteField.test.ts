import { describe, expect, it } from 'vitest';
import {
  addressCount,
  fieldHolds,
  fieldKeys,
  inviteText,
  isPicked,
  OUTSIDE_LIMIT,
  overLimit,
} from '../src/core/inviteField';

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

describe('fieldHolds', () => {
  it('holds the same entries whatever the separators', () => {
    expect(fieldHolds('a@example.com, b@example.com', 'a@example.com,b@example.com')).toBe(true);
    expect(fieldHolds('', '')).toBe(true);
  });

  it('does not hold a field that kept its old text, or lost some entries', () => {
    expect(fieldHolds('', 'a@example.com')).toBe(false);
    expect(fieldHolds('x@example.com', 'a@example.com')).toBe(false);
    expect(fieldHolds('a@example.com', 'a@example.com, b@example.com')).toBe(false);
    expect(fieldHolds('b@example.com, a@example.com', 'a@example.com, b@example.com')).toBe(false);
  });
});

describe('addressCount and overLimit', () => {
  const crowd = (n: number) => Array.from({ length: n }, (_, i) => `p${i}@example.com`).join(', ');

  it('counts different inboxes, not entries', () => {
    expect(addressCount('Ab@gmail.com, ab+x@gmail.com, c@example.com')).toBe(2);
    expect(addressCount('')).toBe(0);
  });

  it('does not count an unfinished entry', () => {
    expect(addressCount('a@example.com, ali')).toBe(1);
  });

  it('is over the limit only above 50', () => {
    expect(OUTSIDE_LIMIT).toBe(50);
    expect(overLimit(crowd(45))).toBe(false);
    expect(overLimit(crowd(50))).toBe(false);
    expect(overLimit(crowd(51))).toBe(true);
    expect(overLimit(`${crowd(50)}, ali`)).toBe(false);
  });
});
