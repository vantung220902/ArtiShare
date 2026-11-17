import { inboxKey } from './emails';

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

/** The inboxes an invite field's text holds, however the entries are separated. */
export function fieldKeys(text: string): Set<string> {
  return new Set(
    text
      .split(/[\s,;]+/)
      .filter(Boolean)
      .map(inboxKey),
  );
}

/** A list counts as picked while every one of its addresses is in the field. */
export function isPicked(emails: readonly string[], text: string): boolean {
  if (emails.length === 0) return false;
  const keys = fieldKeys(text);

  return emails.every((email) => keys.has(inboxKey(email)));
}
