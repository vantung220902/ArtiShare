import { inboxKey, isValidEmail } from './emails';

/**
 * What goes in claude.ai's 'Invite people by email' field for a list's addresses. claude.ai offers
 * Invite only when the whole value is full addresses joined with ', ' (newlines or any unfinished
 * entry give no option), so that is the only shape written. Two addresses for the same inbox are
 * written once, as everywhere else in ArtiShare.
 */
export function inviteText(emails: readonly string[]): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const email of emails) {
    const key = inboxKey(email);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(email.trim());
  }

  return out.join(', ');
}

/** The entries an invite field's text holds, in order, however they are separated. */
export function fieldEntries(text: string): string[] {
  return text.split(/[\s,;]+/).filter(Boolean);
}

/** The inboxes an invite field's text holds. */
export function fieldKeys(text: string): Set<string> {
  return new Set(fieldEntries(text).map(inboxKey));
}

/** claude.ai offers Invite only when every entry is a full address, so an unfinished one blocks it. */
export function unfinishedEntries(text: string): string[] {
  return fieldEntries(text).filter((entry) => !isValidEmail(entry.toLowerCase()));
}

/** A list counts as picked while every one of its addresses is in the field. */
export function isPicked(emails: readonly string[], text: string): boolean {
  if (emails.length === 0) return false;
  const keys = fieldKeys(text);

  return emails.every((email) => keys.has(inboxKey(email)));
}

export interface PickResult {
  /** The field's new text. */
  text: string;
  /** How many addresses the click put in the field, or took out of it. */
  changed: number;
  /** Whether the click added the list (false: it took the list out). */
  added: boolean;
}

/**
 * What the field holds after a click on a list. Picking adds the list's addresses that aren't in
 * the field yet to the end, keeping what the person typed; an unfinished entry like 'ali' moves to
 * the very end so the addresses stay together. Clicking a picked list takes out its addresses,
 * except those another picked list (`others`) still needs, and leaves everything else alone.
 */
export function togglePick(
  text: string,
  emails: readonly string[],
  others: readonly (readonly string[])[],
): PickResult {
  const entries = fieldEntries(text);
  if (isPicked(emails, text)) {
    const needed = new Set(others.flatMap((list) => list.map(inboxKey)));
    const mine = new Set(emails.map(inboxKey));
    const left = entries.filter((entry) => {
      const key = inboxKey(entry);

      return !mine.has(key) || needed.has(key);
    });

    return { text: left.join(', '), changed: entries.length - left.length, added: false };
  }
  const unfinished = new Set(unfinishedEntries(text));
  const complete = entries.filter((entry) => !unfinished.has(entry));
  const merged = inviteText([...complete, ...emails]);
  const before = new Set(complete.map(inboxKey)).size;
  const after = merged ? merged.split(', ').length : 0;

  return {
    text: [merged, ...unfinished].filter(Boolean).join(', '),
    changed: after - before,
    added: true,
  };
}

/** claude.ai lets this many people outside the organization have access to an artifact, pending invitations included. */
export const OUTSIDE_LIMIT = 50;

/** How many different people the field holds as full addresses; an unfinished entry isn't one yet. */
export function addressCount(text: string): number {
  const unfinished = new Set(unfinishedEntries(text));

  return new Set(
    fieldEntries(text)
      .filter((entry) => !unfinished.has(entry))
      .map(inboxKey),
  ).size;
}

/** Whether the field holds what we put there: the same entries in the same order, whatever the separators. */
export function fieldHolds(actual: string, wanted: string): boolean {
  const have = fieldEntries(actual);
  const want = fieldEntries(wanted);

  return have.length === want.length && have.every((entry, i) => entry === want[i]);
}

/** Whether the field holds more people than claude.ai lets an artifact have. ArtiShare's own run skips the rest instead. */
export const overLimit = (text: string): boolean => addressCount(text) > OUTSIDE_LIMIT;
