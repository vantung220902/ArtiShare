/** The parts of a `chrome.runtime.MessageSender` the policy looks at. */
export interface SenderInfo {
  id?: string;
  /** The URL of the page or frame that sent the message; for a content script, the claude.ai page. */
  url?: string;
  tab?: unknown;
}

export type Verdict = { allow: true } | { allow: false; reason: string };

/** The one thing a page on claude.ai may ask ArtiShare for: the saved lists, to show in the ArtiShare lists box. */
const CONTENT_SCRIPT_MESSAGES: ReadonlySet<string> = new Set(['config-get']);

const parse = (url: string | undefined): URL | null => {
  if (!url) return null;
  try {
    return new URL(url);
  } catch {
    return null;
  }
};

/**
 * Decides whether the background answers a message. ArtiShare's own pages (popup, side panel: URL on
 * the extension's origin, even when opened in a tab) may send anything. Anything else is a content
 * script, which lives inside claude.ai where scripts we don't control run, so it may only read the
 * lists, and only from `https://claude.ai/`. It can never start a run or change a list or an invite.
 */
export function judgeSender(type: unknown, sender: SenderInfo, extensionId: string): Verdict {
  if (!extensionId || sender.id !== extensionId) return { allow: false, reason: 'Not sent by ArtiShare.' };
  const url = parse(sender.url);
  // Compared by parts: `origin` is only meaningful for http(s) URLs outside Chrome, and a look-alike
  // such as https://claude.ai@evil.com/ or https://claude.ai:8443/ has a different origin.
  if (url?.protocol === 'chrome-extension:' && url.host === extensionId) return { allow: true };
  if (url?.origin !== 'https://claude.ai') return { allow: false, reason: 'Not allowed from this page.' };
  if (typeof type !== 'string' || !CONTENT_SCRIPT_MESSAGES.has(type)) {
    return { allow: false, reason: 'A claude.ai page can only read your lists.' };
  }

  return { allow: true };
}
