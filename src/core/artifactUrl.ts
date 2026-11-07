import type { ArtifactRef } from './types';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// claude.ai/artifact/{id} ids are short base58-style strings (e.g. 22 chars).
const SHORT_ID_RE = /^[A-Za-z0-9_-]{8,64}$/;
// A bare id (no URL) must look unmistakably like one, so words in pasted text are not taken as ids.
const BARE_ID_RE = /^(?=.*\d)(?=.*[A-Za-z])[A-Za-z0-9]{20,24}$/;

/**
 * Parses an artifact reference. Accepts:
 *  - https://claude.ai/artifact/{id}
 *  - https://claude.ai/code/artifact/{uuid}
 *  - either form without the scheme, with a query string or hash
 *  - a bare id or uuid
 */
export function parseArtifactRef(input: string): ArtifactRef | null {
  const raw = input.trim();
  if (!raw) return null;

  const withScheme = /^https?:\/\//i.test(raw) ? raw : raw.includes('/') ? `https://${raw}` : null;

  if (withScheme) {
    let url: URL;

    try {
      url = new URL(withScheme);
    } catch {
      return null;
    }

    if (url.hostname !== 'claude.ai') return null;
    const parts = url.pathname.split('/').filter(Boolean);

    if (parts[0] === 'artifact' && parts[1] && SHORT_ID_RE.test(parts[1])) {
      return make('artifact', parts[1]);
    }

    if (parts[0] === 'code' && parts[1] === 'artifact' && parts[2] && UUID_RE.test(parts[2])) {
      return make('code-artifact', parts[2].toLowerCase());
    }

    return null;
  }

  if (UUID_RE.test(raw)) return make('code-artifact', raw.toLowerCase());
  if (BARE_ID_RE.test(raw)) return make('artifact', raw);

  return null;
}

function make(kind: ArtifactRef['kind'], id: string): ArtifactRef {
  const url =
    kind === 'artifact' ? `https://claude.ai/artifact/${id}` : `https://claude.ai/code/artifact/${id}`;

  return { id, kind, url };
}

const BASE58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

/**
 * The UUID claude.ai's API uses for an artifact. A claude.ai/artifact/{id} id is the base58
 * (Bitcoin alphabet) encoding of that UUID's 16 bytes; a claude.ai/code/artifact/{uuid} link
 * already carries it. Returns null when the id can't be a UUID.
 */
export function artifactUuid(ref: ArtifactRef): string | null {
  if (ref.kind === 'code-artifact') return UUID_RE.test(ref.id) ? ref.id.toLowerCase() : null;
  let n = 0n;

  for (const ch of ref.id) {
    const digit = BASE58.indexOf(ch);
    if (digit < 0) return null;
    n = n * 58n + BigInt(digit);
  }

  if (n >= 1n << 128n) return null;
  const hex = n.toString(16).padStart(32, '0');

  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export interface ParsedArtifacts {
  refs: ArtifactRef[];
  invalid: string[];
}

/** Parses one reference per line (or whitespace/comma separated), de-duplicating by id. */
export function parseArtifactList(text: string | readonly string[]): ParsedArtifacts {
  const tokens = typeof text === 'string' ? text.split(/[\s,]+/) : text;
  const refs: ArtifactRef[] = [];
  const invalid: string[] = [];
  const seen = new Set<string>();

  for (const token of tokens) {
    const t = token.trim();
    if (!t) continue;
    const ref = parseArtifactRef(t);

    if (!ref) {
      invalid.push(t);
      continue;
    }

    const key = `${ref.kind}:${ref.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    refs.push(ref);
  }

  return { refs, invalid };
}
