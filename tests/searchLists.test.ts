import { describe, expect, it } from 'vitest';
import type { EmailList } from '../src/core/config';
import { capResults, searchLists } from '../src/core/search';

const list = (name: string, emails: string[]): EmailList => ({ id: name, name, emails, access: 'view' });
const TEAM = list('Team', ['alice@example.com', 'bob@example.com']);
const DESIGN = list('Design', ['alice@example.com', 'dana@example.com']);

describe('searchLists', () => {
  it('finds a list by part of its name', () => {
    const result = searchLists([TEAM, DESIGN], 'des');

    expect(result.lists.map((l) => l.name)).toEqual(['Design']);
    expect(result.people).toEqual([]);
  });

  it('finds a person once, with the lists in the Lists tab order', () => {
    const result = searchLists([TEAM, DESIGN], 'alice');

    expect(result.lists).toEqual([]);
    expect(result.people).toEqual([{ email: 'alice@example.com', inLists: ['Design', 'Team'] }]);
  });

  it('ignores case and the spaces around the text', () => {
    expect(searchLists([TEAM, DESIGN], '  ALICE ')).toEqual(searchLists([TEAM, DESIGN], 'alice'));
    expect(searchLists([TEAM], 'TEAM').lists).toHaveLength(1);
  });

  it('counts two addresses for the same inbox as one person', () => {
    const result = searchLists([list('A', ['A.B@gmail.com']), list('B', ['a.b+x@gmail.com'])], 'a.b');

    expect(result.people).toEqual([{ email: 'A.B@gmail.com', inLists: ['A', 'B'] }]);
  });

  it('finds a person once when a list holds them twice', () => {
    const result = searchLists([list('A', ['x@example.com', 'x@example.com'])], 'x@');

    expect(result.people).toEqual([{ email: 'x@example.com', inLists: ['A'] }]);
  });

  it('finds nothing for an empty search or a text nothing matches', () => {
    expect(searchLists([TEAM, DESIGN], '')).toEqual({ lists: [], people: [] });
    expect(searchLists([TEAM, DESIGN], '   ')).toEqual({ lists: [], people: [] });
    expect(searchLists([TEAM, DESIGN], 'zzz')).toEqual({ lists: [], people: [] });
  });

  it('can match a list and people at once', () => {
    const result = searchLists([list('Dana crew', ['dana@example.com', 'eve@example.com'])], 'dana');

    expect(result.lists.map((l) => l.name)).toEqual(['Dana crew']);
    expect(result.people.map((p) => p.email)).toEqual(['dana@example.com']);
  });
});

describe('capResults', () => {
  const people = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ email: `p${i}@example.com`, inLists: ['Crowd'] }));

  it('keeps 20 rows and counts the rest', () => {
    const capped = capResults({ lists: [], people: people(45) });

    expect(capped.people).toHaveLength(20);
    expect(capped.more).toBe(25);
  });

  it('leaves a short result alone', () => {
    const capped = capResults({ lists: [TEAM], people: people(19) });

    expect(capped.lists).toHaveLength(1);
    expect(capped.people).toHaveLength(19);
    expect(capped.more).toBe(0);
  });

  it('shows lists before people when the rows run out', () => {
    const capped = capResults({ lists: [TEAM, DESIGN], people: people(30) }, 5);

    expect(capped.lists).toHaveLength(2);
    expect(capped.people).toHaveLength(3);
    expect(capped.more).toBe(27);
  });
});
