import type { EmailList } from './config';
import { inboxKey } from './emails';
import { byName } from './lists';

export interface PersonMatch {
  /** The address as the first list that has it writes it. */
  email: string;
  /** Names of the lists the person is in, in the Lists tab's order. */
  inLists: string[];
}

export interface SearchResult {
  lists: EmailList[];
  people: PersonMatch[];
}

/**
 * What a search in the Share lists box finds: lists whose name contains the text and people whose
 * address does, each person once however many lists they are in. Case and the spaces around the text
 * are ignored; an empty search finds nothing, because the box shows its chips then.
 */
export function searchLists(lists: readonly EmailList[], query: string): SearchResult {
  const needle = query.trim().toLowerCase();
  if (!needle) return { lists: [], people: [] };

  const ordered = byName(lists);
  const people = new Map<string, PersonMatch>();
  for (const list of ordered) {
    for (const email of list.emails) {
      if (!email.toLowerCase().includes(needle)) continue;
      const key = inboxKey(email);
      const known = people.get(key);
      if (!known) people.set(key, { email: email.trim(), inLists: [list.name] });
      else if (!known.inLists.includes(list.name)) known.inLists.push(list.name);
    }
  }

  return {
    lists: ordered.filter((list) => list.name.toLowerCase().includes(needle)),
    people: [...people.values()],
  };
}

/** The most rows the box lists for one search; a longer list of matches is cut and counted. */
export const MAX_RESULT_ROWS = 20;

export interface CappedResult extends SearchResult {
  /** How many rows were left out. */
  more: number;
}

/** Keeps the first `max` rows, lists before people, and counts the rest. */
export function capResults(found: SearchResult, max = MAX_RESULT_ROWS): CappedResult {
  const lists = found.lists.slice(0, max);
  const people = found.people.slice(0, max - lists.length);

  return { lists, people, more: found.lists.length + found.people.length - lists.length - people.length };
}
