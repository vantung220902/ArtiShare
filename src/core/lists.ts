import type { EmailList } from './config';

/** Saved lists in the order the Lists tab shows them. */
export const byName = (lists: readonly EmailList[]) => lists.toSorted((a, b) => a.name.localeCompare(b.name));
