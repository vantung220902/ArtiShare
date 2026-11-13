import { type EmailList, EmailListSchema, type Invitee } from './config';
import type { ArtifactPlan } from './planner';
import { ACCESS_LEVELS, type AccessLevel, type ArtifactRef } from './types';

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

/** What a preview found for one artifact (the same shape the background answers with). */
export interface PreviewOutcome {
  artifact: ArtifactRef;
  plan?: ArtifactPlan;
  error?: string;
}

/**
 * A preview being looked at. Kept so that closing the popup doesn't throw it away: while
 * `results` is null the popup closed before the answer came, so it asks again on reopening.
 */
export interface PreviewState {
  /** The names of the lists it was made from. */
  label: string;
  artifacts: ArtifactRef[];
  invites: Invitee[];
  results: PreviewOutcome[] | null;
  /** The account the results were read as; null while they are loading. */
  accountEmail: string | null;
}

export interface PopupState {
  tab: Tab;
  lists: ListsDraft;
  /** Set while the Share tab shows a preview instead of the form. */
  preview: PreviewState | null;
}

export const EMPTY_LISTS_DRAFT: ListsDraft = { adding: false, newList: null, open: [], edits: {} };

export function emptyPopupState(): PopupState {
  return { tab: 'share', lists: structuredClone(EMPTY_LISTS_DRAFT), preview: null };
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

const isObject = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);

function parseArtifactRef(raw: unknown): ArtifactRef | null {
  if (!isObject(raw)) return null;
  const { id, kind, url } = raw;
  if (typeof id !== 'string' || typeof url !== 'string') return null;
  if (kind !== 'artifact' && kind !== 'code-artifact') return null;

  return { id, kind, url };
}

function parseInvitee(raw: unknown): Invitee | null {
  if (!isObject(raw) || typeof raw.email !== 'string') return null;

  return ACCESS_LEVELS.includes(raw.access as AccessLevel)
    ? { email: raw.email, access: raw.access as AccessLevel }
    : null;
}

function parseOutcome(raw: unknown): PreviewOutcome | null {
  if (!isObject(raw)) return null;
  const artifact = parseArtifactRef(raw.artifact);
  if (!artifact) return null;
  if (typeof raw.error === 'string') return { artifact, error: raw.error };
  const plan = raw.plan;
  // The plan is written by this extension and read back only by it, so check just what the view reads.
  const fields = ['toInvite', 'alreadyShared', 'sameInbox', 'self'];
  if (!isObject(plan) || !fields.every((key) => Array.isArray(plan[key]))) return null;

  return { artifact, plan: plan as unknown as ArtifactPlan };
}

/** Reads a stored preview, or null if there is none or it isn't one (another version may have written it). */
export function parsePreviewState(raw: unknown): PreviewState | null {
  if (!isObject(raw) || typeof raw.label !== 'string') return null;
  if (!Array.isArray(raw.artifacts) || !Array.isArray(raw.invites)) return null;
  const artifacts = raw.artifacts.map(parseArtifactRef);
  const invites = raw.invites.map(parseInvitee);
  if (!artifacts.length || !invites.length || artifacts.includes(null) || invites.includes(null)) return null;
  const base = { label: raw.label, artifacts: artifacts as ArtifactRef[], invites: invites as Invitee[] };
  if (raw.results == null) return { ...base, results: null, accountEmail: null };
  if (!Array.isArray(raw.results) || typeof raw.accountEmail !== 'string') return null;
  const results = raw.results.map(parseOutcome);
  if (results.includes(null)) return null;

  return { ...base, results: results as PreviewOutcome[], accountEmail: raw.accountEmail };
}

/** Reads the stored state. Anything unreadable falls back to the defaults, piece by piece. */
export function parsePopupState(raw: unknown): PopupState {
  const state = emptyPopupState();
  if (!raw || typeof raw !== 'object') return state;
  const { tab, lists, preview } = raw as Record<string, unknown>;
  if (tab === 'share' || tab === 'lists') state.tab = tab;
  state.preview = parsePreviewState(preview);
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
