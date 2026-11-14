import { parseArtifactRef } from '../../core/artifactUrl';
import type { Config, ConfigChange, EmailList } from '../../core/config';
import type { ArtifactRef } from '../../core/types';

/** The artifact open in the active tab, if any. The claude.ai host permission exposes those tabs' URLs. */
export async function currentTabArtifact(): Promise<ArtifactRef | null> {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });

  return tab?.url ? parseArtifactRef(tab.url) : null;
}

export type Save = (change: ConfigChange) => Promise<Config>;

export const byName = (lists: readonly EmailList[]) => lists.toSorted((a, b) => a.name.localeCompare(b.name));
export const people = (n: number) => `${n} ${n === 1 ? 'person' : 'people'}`;
export const plural = (n: number, word: string, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;
