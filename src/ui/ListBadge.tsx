import type { EmailList } from '../core/config';

const TINTS = 6;

/** A stable tint per list, so a list keeps its color when it's renamed or reordered. */
function tintOf(id: string): number {
  let hash = 0;
  for (const ch of id) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return hash % TINTS;
}

/** Colored square with the list's first letter. */
export function ListBadge({ list, small }: { list: Pick<EmailList, 'id' | 'name'>; small?: boolean }) {
  const letter = [...list.name.trim()][0]?.toUpperCase() ?? '?';
  return (
    <span className={`avatar tint-${tintOf(list.id)}${small ? ' small' : ''}`} aria-hidden="true">
      {letter}
    </span>
  );
}
