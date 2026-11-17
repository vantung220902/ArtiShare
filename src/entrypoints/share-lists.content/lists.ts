import { useCallback, useEffect, useRef, useState } from 'react';
import { loadStoredConfig, type Config } from '../../core/config';
import {
  isContextInvalidated,
  type ListsProblem,
  problemMessage,
  REPLY_TIMEOUT_MS,
  withTimeout,
} from '../../core/listsLoad';
import type { Reply } from '../../lib/messages';
import { watchConfig } from '../../lib/storage';

export type ListsState =
  | { status: 'loading' }
  | { status: 'ready'; config: Config }
  | { status: 'problem'; problem: ListsProblem; message: string };

const problem = (kind: ListsProblem, detail = ''): ListsState => ({
  status: 'problem',
  problem: kind,
  message: problemMessage(kind, detail),
});

/**
 * True once the extension was reloaded or updated under this page: the page's old content script
 * keeps running but `chrome.runtime.id` is gone and every `chrome.*` call throws.
 */
export function extensionGone(): boolean {
  try {
    return !chrome.runtime?.id;
  } catch {
    return true;
  }
}

class BackgroundError extends Error {}

/** Asks the background for the lists. A reply that says no is a `BackgroundError`: the background was there. */
async function askForLists(): Promise<Config> {
  const reply = (await chrome.runtime.sendMessage({ type: 'config-get' })) as Reply<Config> | undefined;
  if (!reply) throw new Error('No reply.');
  if (!reply.ok) throw new BackgroundError(reply.error);

  return reply.data;
}

/** What went wrong, in the box's three kinds of words. */
function classify(err: unknown): ListsState {
  if (extensionGone() || isContextInvalidated(err)) return problem('updated');
  if (err instanceof BackgroundError) return problem('unreadable', err.message);

  return problem('unreachable');
}

/**
 * The saved lists as the box needs them: read through the background, kept in step with storage,
 * and with a `retry` for when reading failed. Nothing here throws, whatever state the extension is in.
 */
export function useLists(): { state: ListsState; retry: () => void; checkAlive: () => boolean } {
  const [state, setState] = useState<ListsState>({ status: 'loading' });
  // Each read or storage change takes a number, so an old answer can't overwrite a newer one.
  const latest = useRef(0);

  // Only ever sets state once the answer is in, so it can start from an effect.
  const read = useCallback(() => {
    const mine = ++latest.current;
    const answer = extensionGone()
      ? Promise.reject(new Error('Extension context invalidated.'))
      : askForLists();
    withTimeout(answer, REPLY_TIMEOUT_MS).then(
      (config) => {
        if (latest.current === mine) setState({ status: 'ready', config });
      },
      (err: unknown) => {
        if (latest.current === mine) setState(classify(err));
      },
    );
  }, [latest]);

  const retry = useCallback(() => {
    setState({ status: 'loading' });
    read();
  }, [read]);

  useEffect(() => {
    read();
    let unwatch = () => {};
    try {
      unwatch = watchConfig((value) => {
        latest.current++;
        try {
          setState({ status: 'ready', config: loadStoredConfig(value) });
        } catch (err) {
          setState(problem('unreadable', err instanceof Error ? err.message : String(err)));
        }
      });
    } catch {
      // The extension went away before the box did: the read above says so.
    }

    return () => {
      // Whatever is still on its way is no longer wanted.
      latest.current++;
      try {
        unwatch();
      } catch {
        // Nothing left to unhook.
      }
    };
  }, [read, latest]);

  /** False, and the box says why, if the extension has gone since the box was drawn. */
  const checkAlive = useCallback(() => {
    if (!extensionGone()) return true;
    latest.current++;
    setState(problem('updated'));

    return false;
  }, [latest]);

  return { state, retry, checkAlive };
}
