/**
 * What the Share form keeps while the popup is closed. A popup is destroyed as soon as it loses
 * focus, so anything typed but not yet sent has to live in storage.
 */
export interface ShareDraft {
  /** The Artifacts box, exactly as typed. */
  artifactText: string;
  /** Ids of the lists ticked under "Share with". */
  selected: string[];
}

/** Reads a stored draft, or null if there is none or it isn't one (another version may have written it). */
export function parseShareDraft(raw: unknown): ShareDraft | null {
  if (!raw || typeof raw !== 'object') return null;
  const { artifactText, selected } = raw as Record<string, unknown>;
  if (typeof artifactText !== 'string') return null;
  if (!Array.isArray(selected) || !selected.every((id) => typeof id === 'string')) return null;

  return { artifactText, selected };
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
