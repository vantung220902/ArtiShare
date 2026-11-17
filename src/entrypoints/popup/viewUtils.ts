import { parseArtifactRef } from '../../core/artifactUrl';
import type { Config, ConfigChange } from '../../core/config';
import { byName } from '../../core/lists';
import type { ArtifactRef } from '../../core/types';

/** The artifact open in the active tab, if any. The claude.ai host permission exposes those tabs' URLs. */
export async function currentTabArtifact(): Promise<ArtifactRef | null> {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });

  return tab?.url ? parseArtifactRef(tab.url) : null;
}

export type Save = (change: ConfigChange) => Promise<Config>;

export { byName };
export const people = (n: number) => `${n} ${n === 1 ? 'person' : 'people'}`;
export const plural = (n: number, word: string, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;
