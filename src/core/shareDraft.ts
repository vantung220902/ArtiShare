import { type ListFormDraft, parseListFormDraft } from './popupState';

/**
 * What the Share form keeps while the popup is closed. A popup is destroyed as soon as it loses
 * focus, so anything typed but not yet sent has to live in storage.
 */
export interface ShareDraft {
  /** The Artifacts rows, by link, in order. */
  artifacts: string[];
  /** What is typed in the Artifacts box and not yet added as rows, exactly as typed. */
  artifactText: string;
  /** Ids of the lists ticked under "Share with". */
  selected: string[];
  /** The inline New list form is open. Left out when it isn't. */
  creating?: boolean;
  /** What is typed in the inline New list form. Left out when nothing is. */
  newList?: ListFormDraft;
}

/** Reads a stored draft, or null if there is none or it isn't one (another version may have written it). */
export function parseShareDraft(raw: unknown): ShareDraft | null {
  if (!raw || typeof raw !== 'object') return null;
  const { artifacts = [], artifactText, selected, creating, newList } = raw as Record<string, unknown>;
  if (typeof artifactText !== 'string') return null;
  const isStrings = (v: unknown): v is string[] => Array.isArray(v) && v.every((s) => typeof s === 'string');
  // 0.3.0 had no rows, only the box, so a draft without them is still one.
  if (!isStrings(artifacts) || !isStrings(selected)) return null;
  const draft: ShareDraft = { artifacts, artifactText, selected };
  if (creating === true) draft.creating = true;
  const form = parseListFormDraft(newList);
  // The inline form only ever creates, so a draft with a baseline isn't one of its drafts.
  if (form && !form.baseline) draft.newList = form;

  return draft;
}

/**
 * The ticks to start from: the draft's, minus lists that were deleted since, or the defaults
 * when there is no draft.
 */
export function restoreSelection(
  draft: ShareDraft | null,
  existingIds: string[],
  defaults: string[],
): string[] {
  if (!draft) return defaults;
  const existing = new Set(existingIds);

  return draft.selected.filter((id) => existing.has(id));
}
