import { type EmailList, EmailListSchema } from './config';
import { ACCESS_LEVELS, type AccessLevel } from './types';

/**
 * What the popup keeps while it is closed. A popup is destroyed as soon as it loses focus, so
 * a list being typed, an unsaved edit and the tab that was open have to live in storage.
 */

export type Tab = 'share' | 'lists';

/** What a list form holds before it is saved, as typed. */
export interface ListFormDraft {
  name: string;
  /** The addresses box, exactly as typed. */
  text: string;
  access: AccessLevel;
  /**
   * For an edit: the saved list the edit started from, so that a change made elsewhere in the
   * meantime is still noticed once the popup reopens. Null for a new list.
   */
  baseline: EmailList | null;
}

/** The Lists tab's unsaved work. */
export interface ListsDraft {
  /** The New list form is open. */
  adding: boolean;
  newList: ListFormDraft | null;
  /** Ids of the saved lists that are expanded. */
  open: string[];
  /** Unsaved edits of saved lists, by list id. */
  edits: Record<string, ListFormDraft>;
}

export interface PopupState {
  tab: Tab;
  lists: ListsDraft;
}

export const EMPTY_LISTS_DRAFT: ListsDraft = { adding: false, newList: null, open: [], edits: {} };

export function emptyPopupState(): PopupState {
  return { tab: 'share', lists: structuredClone(EMPTY_LISTS_DRAFT) };
}

/** Reads a stored list form draft, or null if it isn't one (another version may have written it). */
export function parseListFormDraft(raw: unknown): ListFormDraft | null {
  if (!raw || typeof raw !== 'object') return null;
  const { name, text, access, baseline } = raw as Record<string, unknown>;
  if (typeof name !== 'string' || typeof text !== 'string') return null;
  if (!ACCESS_LEVELS.includes(access as AccessLevel)) return null;
  if (baseline == null) return { name, text, access: access as AccessLevel, baseline: null };
  const list = EmailListSchema.safeParse(baseline);

  return list.success ? { name, text, access: access as AccessLevel, baseline: list.data } : null;
}

/** Reads the stored state. Anything unreadable falls back to the defaults, piece by piece. */
export function parsePopupState(raw: unknown): PopupState {
  const state = emptyPopupState();
  if (!raw || typeof raw !== 'object') return state;
  const { tab, lists } = raw as Record<string, unknown>;
  if (tab === 'share' || tab === 'lists') state.tab = tab;
  if (!lists || typeof lists !== 'object') return state;
  const { adding, newList, open, edits } = lists as Record<string, unknown>;
  state.lists.adding = adding === true;
  state.lists.newList = parseListFormDraft(newList);
  if (Array.isArray(open)) state.lists.open = open.filter((id): id is string => typeof id === 'string');
  if (edits && typeof edits === 'object') {
    for (const [id, value] of Object.entries(edits)) {
      const draft = parseListFormDraft(value);
      // An edit starts from a saved list, so one without a baseline can't be an edit.
      if (draft?.baseline && draft.baseline.id === id) state.lists.edits[id] = draft;
    }
  }

  return state;
}

/** Drops what refers to lists that were deleted while the popup was closed. */
export function reconcileListsDraft(draft: ListsDraft, listIds: readonly string[]): ListsDraft {
  const existing = new Set(listIds);

  return {
    ...draft,
    open: draft.open.filter((id) => existing.has(id)),
    edits: Object.fromEntries(Object.entries(draft.edits).filter(([id]) => existing.has(id))),
  };
}

/** Whether two drafts hold the same thing, so an unchanged one needn't be saved again. */
export function sameListFormDraft(a: ListFormDraft | null | undefined, b: ListFormDraft | null | undefined) {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}
