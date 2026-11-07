/**
 * Email list parsing. Accepts free text, comma/semicolon/newline separated lists,
 * CSV/TSV exports (any column), and "Name <email>" entries.
 */

// Pragmatic address check: local@domain.tld, no spaces, one @, a dot in the domain.
const EMAIL_RE = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/;

export interface ParsedEmails {
  /** Normalized, unique, in first-seen order. */
  valid: string[];
  /** Tokens that contain "@" but are not valid addresses, as written. */
  invalid: string[];
  /** Normalized addresses that appeared more than once (each listed once). */
  duplicates: string[];
}

export function normalizeEmail(raw: string): string {
  let s = raw.trim();
  s = s.replace(/^mailto:/i, '');
  // Strip wrapping quotes, angle brackets and trailing punctuation from CSV / "Name <email>" input.
  s = s.replace(/^[\s"'<(\[]+/, '').replace(/[\s"'>)\].,;:]+$/, '');
  return s.toLowerCase();
}

export function isValidEmail(email: string): boolean {
  return email.length <= 254 && EMAIL_RE.test(email);
}

export function domainOf(email: string): string {
  const at = email.lastIndexOf('@');
  return at === -1 ? '' : email.slice(at + 1).toLowerCase();
}

/** Splits arbitrary text into address-like tokens. Tokens without "@" (names, headers) are ignored. */
export function parseEmails(text: string): ParsedEmails {
  const seen = new Set<string>();
  const dupes = new Set<string>();
  const valid: string[] = [];
  const invalid: string[] = [];

  const tokens = text.split(/[\s,;|]+/);
  for (const token of tokens) {
    if (!token.includes('@')) continue;
    // "Name<email>" without a space: keep only the bracketed part.
    const bracketed = token.match(/<([^>]+)>/);
    const email = normalizeEmail(bracketed?.[1] ?? token);
    if (!isValidEmail(email)) {
      invalid.push(token.trim());
      continue;
    }
    if (seen.has(email)) {
      dupes.add(email);
      continue;
    }
    seen.add(email);
    valid.push(email);
  }

  return { valid, invalid, duplicates: [...dupes] };
}

/** Merges several address lists into one normalized, de-duplicated list (first-seen order). */
export function mergeEmails(...lists: readonly (readonly string[])[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const list of lists) {
    for (const raw of list) {
      const email = normalizeEmail(raw);
      if (!isValidEmail(email) || seen.has(email)) continue;
      seen.add(email);
      out.push(email);
    }
  }
  return out;
}
