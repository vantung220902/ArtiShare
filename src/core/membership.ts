import { inboxKey } from './emails';
import type { EmailList } from './config';

/**
 * For each inbox, the names of the lists holding it, in the order the lists are given. Matching is
 * by `inboxKey` like the rest of the extension, so a Gmail alias counts as the same person.
 */
export function listNamesByInbox(lists: readonly EmailList[]): Map<string, string[]> {
  const names = new Map<string, string[]>();
  for (const list of lists) {
    // A list that holds the same inbox twice still names itself once.
    for (const key of new Set(list.emails.map(inboxKey))) {
      const found = names.get(key);
      if (found) found.push(list.name);
      else names.set(key, [list.name]);
    }
  }

  return names;
}

/** "N people aren't in any of your lists.", singular for one. */
export function unlistedNote(count: number): string {
  return count === 1
    ? "1 person isn't in any of your lists."
    : `${count} people aren't in any of your lists.`;
}

/** How many list names are written out before the rest become '+N'. */
const NAMES_SHOWN = 2;

/** The short note on a person: 'Not in a list', 'In Team, Reviewers' or 'In Team, Reviewers +1'. */
export function membershipNote(names: readonly string[]): string {
  if (names.length === 0) return 'Not in a list';
  const extra = names.length - NAMES_SHOWN;

  return `In ${names.slice(0, NAMES_SHOWN).join(', ')}${extra > 0 ? ` +${extra}` : ''}`;
}
