import { useEffect, useState } from 'react';
import { artifactKey } from '../../core/artifactUrl';
import type { ArtifactRef } from '../../core/types';
import { currentTabArtifact } from './viewUtils';

/**
 * The artifact in the tab that is active now, or null when it isn't one. Read once on mount, which
 * is enough for a popup (it closes when you click away). With `follow` it is read again whenever you
 * switch tabs or the active tab goes somewhere else, as the side panel stays open through both.
 */
export function useTabArtifact(follow: boolean): ArtifactRef | null {
  const [artifact, setArtifact] = useState<ArtifactRef | null>(null);

  useEffect(() => {
    let mounted = true;
    // Answers can come back out of order when tabs change quickly: only the last asked counts.
    let latest = 0;
    const read = () => {
      const asked = ++latest;
      currentTabArtifact().then(
        (ref) => {
          if (!mounted || asked !== latest) return;
          // The same artifact again keeps the same value, so nothing downstream runs twice for it.
          setArtifact((was) => (was && ref && artifactKey(was) === artifactKey(ref) ? was : ref));
        },
        () => {},
      );
    };
    read();
    if (!follow) return () => void (mounted = false);

    const onUpdated = (_id: number, change: { url?: string }, tab: { active: boolean }) => {
      // Other tabs load and change title all the time; only the one in front matters.
      if (tab.active && change.url !== undefined) read();
    };
    chrome.tabs.onActivated.addListener(read);
    chrome.tabs.onUpdated.addListener(onUpdated);
    chrome.windows.onFocusChanged.addListener(read);

    return () => {
      mounted = false;
      chrome.tabs.onActivated.removeListener(read);
      chrome.tabs.onUpdated.removeListener(onUpdated);
      chrome.windows.onFocusChanged.removeListener(read);
    };
  }, [follow]);

  return artifact;
}
