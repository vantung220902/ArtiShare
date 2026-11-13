import { artifactKey, parseArtifactList } from './artifactUrl';
import type { ArtifactRef } from './types';

/**
 * The Artifacts rows: each artifact once, in the order it was added. Links typed or pasted into
 * the box below them become rows; what isn't a link stays in the box to be fixed.
 */

export interface AddedText {
  /** The rows with the text's new artifacts added after them. */
  rows: ArtifactRef[];
  /** Rows that were already there and that the text named again. */
  repeated: ArtifactRef[];
  /** What wasn't a link, one line per line of the text that had some, to leave in the box. */
  leftover: string;
}

export const sameArtifact = (a: ArtifactRef, b: ArtifactRef) => artifactKey(a) === artifactKey(b);

/** Adds the artifacts linked in `text` to `rows`. Read line by line so a line of words stays together. */
export function addArtifactText(rows: readonly ArtifactRef[], text: string): AddedText {
  const next = [...rows];
  const repeated: ArtifactRef[] = [];
  const leftover: string[] = [];

  for (const line of text.split(/\r?\n/)) {
    const { refs, invalid } = parseArtifactList(line);

    for (const ref of refs) {
      const existing = next.find((row) => sameArtifact(row, ref));
      if (!existing) next.push(ref);
      // Named twice in the same paste isn't worth a mention; already being a row is.
      else if (rows.includes(existing) && !repeated.includes(existing)) repeated.push(existing);
    }

    if (invalid.length) leftover.push(invalid.join(' '));
  }

  return { rows: next, repeated, leftover: leftover.join('\n') };
}

/**
 * The box's text with `pasted` put in place of the selection `start`–`end`. Enter adds rather than
 * breaking the line, so a pasted link is put on a line of its own: glued to text left in the box it
 * would stop being a link. Anything else (a fragment, such as an id after a typed link) goes in as is.
 */
export function insertPaste(text: string, start: number, end: number, pasted: string) {
  const before = text.slice(0, start);
  const after = text.slice(end);
  if (!parseArtifactList(pasted).refs.length) return before + pasted + after;

  return [before, pasted, after].filter((part) => part.trim()).join('\n');
}

export const removeArtifact = (rows: readonly ArtifactRef[], ref: ArtifactRef) =>
  rows.filter((row) => !sameArtifact(row, ref));
