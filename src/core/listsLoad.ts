/** How long the box waits for ArtiShare's background before saying it can't reach it. */
export const REPLY_TIMEOUT_MS = 4000;

/** Why the box has no lists to show. */
export type ListsProblem = 'unreadable' | 'unreachable' | 'updated';

/** Raised when the background didn't answer in time. */
export class NoReplyError extends Error {
  constructor() {
    super('ArtiShare did not answer in time.');
  }
}

/**
 * Chrome's wording once an extension has been reloaded or updated under a page that stays open:
 * every `chrome.*` call from that page's old content script throws it.
 */
export const isContextInvalidated = (err: unknown) =>
  err instanceof Error && /extension context invalidated/i.test(err.message);

/** Rejects with `NoReplyError` if `work` hasn't settled after `ms`. */
export function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new NoReplyError()), ms);
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err: unknown) => {
        clearTimeout(timer);
        reject(err instanceof Error ? err : new Error(String(err)));
      },
    );
  });
}

/** What the box tells the person for each problem, in the words the feature promises. */
export function problemMessage(problem: ListsProblem, detail: string): string {
  switch (problem) {
    case 'unreadable':
      return `Couldn't read your lists: ${detail}`;
    case 'unreachable':
      return "Couldn't reach ArtiShare. Check that the extension is turned on, then try again.";
    case 'updated':
      return 'ArtiShare was updated. Reload this page to use your lists.';
  }
}
