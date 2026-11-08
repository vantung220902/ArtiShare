import { ShareError } from '../core/runner';

/**
 * Runs fetch() inside a claude.ai tab, so requests carry the user's session exactly as the Share
 * menu's do. Nothing about the session leaves the page: only the response status and body come
 * back to the extension.
 *
 * The code runs in the extension's ISOLATED world, not the page's MAIN world. Chrome sends an
 * isolated-world fetch with the page's origin and cookies, but the page's own scripts (analytics
 * or support widgets that wrap `window.fetch`) can't see the addresses being invited or tamper
 * with the responses.
 */

const CLAUDE_ORIGIN = 'https://claude.ai';
const CLAUDE_MATCH = 'https://claude.ai/*';

export interface PageRequest {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** Path on claude.ai, starting with "/". */
  path: string;
  body?: unknown;
  headers?: Record<string, string>;
}

export interface PageResponse {
  status: number;
  body: string;
  retryAfter: string | null;
  /** Cloudflare's `cf-mitigated` header; "challenge" means claude.ai wants a human check. */
  cfMitigated?: string | null;
}

let ownTabId: number | undefined;
let pendingTab: Promise<number> | undefined;

function isUsable(tab: chrome.tabs.Tab | undefined): boolean {
  return (
    !!tab?.id && !tab.discarded && tab.status === 'complete' && !!tab.url?.startsWith(`${CLAUDE_ORIGIN}/`)
  );
}

function waitForLoad(tabId: number, timeoutMs = 30_000): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;

    const finish = (error?: ShareError) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(listener);
      chrome.tabs.onRemoved.removeListener(removed);
      if (error) reject(error);
      else resolve();
    };

    const listener = (id: number, info: { status?: string }) => {
      if (id === tabId && info.status === 'complete') finish();
    };

    const removed = (id: number) => {
      if (id === tabId) finish(new ShareError('The claude.ai tab closed while loading.', 'network'));
    };

    const timer = setTimeout(
      () => finish(new ShareError('claude.ai took too long to load.', 'network')),
      timeoutMs,
    );

    chrome.tabs.onUpdated.addListener(listener);
    chrome.tabs.onRemoved.addListener(removed);
    // Creation may finish before the listener is attached.
    void chrome.tabs.get(tabId).then(
      (tab) => {
        if (tab.status === 'complete') finish();
      },
      () => finish(new ShareError('The claude.ai tab closed while loading.', 'network')),
    );
  });
}

/** Finds an open claude.ai tab, or opens one in the background. */
async function findClaudeTab(): Promise<number> {
  if (ownTabId !== undefined) {
    const tab = await chrome.tabs.get(ownTabId).catch(() => undefined);
    if (isUsable(tab)) return ownTabId;
    ownTabId = undefined;
  }

  const tabs = await chrome.tabs.query({ url: CLAUDE_MATCH });

  for (const tab of tabs) {
    if (isUsable(tab)) return tab.id!;
  }

  for (const tab of tabs) {
    if (tab.id === undefined || tab.discarded || tab.status !== 'loading') continue;

    try {
      await waitForLoad(tab.id);
    } catch {
      continue;
    }

    const loaded = await chrome.tabs.get(tab.id).catch(() => undefined);
    if (isUsable(loaded)) return tab.id;
  }

  const created = await chrome.tabs.create({ url: `${CLAUDE_ORIGIN}/`, active: false });
  const id = created.id;
  if (id === undefined) throw new ShareError("Couldn't open a claude.ai tab.", 'network');
  await waitForLoad(id);
  ownTabId = id;

  return id;
}

export function getClaudeTab(): Promise<number> {
  pendingTab ??= findClaudeTab().finally(() => {
    pendingTab = undefined;
  });

  return pendingTab;
}

/**
 * Runs `func(arg)` in the claude.ai tab (top frame, isolated world) and returns its result.
 * `func` is serialized into the page, so it can't use anything from this module's scope.
 */
async function inPage<A, R>(func: (arg: A) => Promise<R | { error: string }>, arg: A): Promise<R> {
  const tabId = await getClaudeTab();
  let results: chrome.scripting.InjectionResult<R | { error: string }>[];

  try {
    results = await chrome.scripting.executeScript({
      target: { tabId },
      world: 'ISOLATED',
      args: [arg],
      func,
    });
  } catch (e) {
    ownTabId = undefined;
    throw new ShareError(`Couldn't reach the claude.ai tab: ${(e as Error).message}`, 'network');
  }

  const result = results[0]?.result;
  if (result === undefined) throw new ShareError('The claude.ai tab returned nothing.', 'network');

  if (result && typeof result === 'object' && 'error' in result) {
    throw new ShareError(`Request failed: ${result.error}`, 'network');
  }

  return result;
}

/** The absolute claude.ai URL for `path`; throws if `path` would point anywhere else. */
export function claudeUrl(path: string): string {
  const url = path.startsWith('/') && !path.startsWith('//') ? new URL(path, CLAUDE_ORIGIN) : null;
  if (url?.origin !== CLAUDE_ORIGIN)
    throw new ShareError(`Refusing to send a request outside claude.ai: ${path}`, 'unknown');

  return url.href;
}

interface InPageRequest extends PageRequest {
  url: string;
  origin: string;
}

export async function pageFetch(req: PageRequest): Promise<PageResponse> {
  const arg: InPageRequest = { ...req, url: claudeUrl(req.path), origin: CLAUDE_ORIGIN };

  return inPage<InPageRequest, PageResponse>(async (r: InPageRequest) => {
    // The tab may have navigated since it was picked; never send the session's request elsewhere.
    if (location.origin !== r.origin) return { error: `the tab is no longer on ${r.origin}` };

    try {
      const res = await fetch(r.url, {
        method: r.method,
        credentials: 'same-origin',
        headers: {
          ...(r.body !== undefined ? { 'content-type': 'application/json' } : {}),
          ...r.headers,
        },
        body: r.body !== undefined ? JSON.stringify(r.body) : undefined,
      });

      return {
        status: res.status,
        body: await res.text(),
        retryAfter: res.headers.get('retry-after'),
        cfMitigated: res.headers.get('cf-mitigated'),
      };
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) };
    }
  }, arg);
}

/** Reads a (non-HttpOnly) claude.ai cookie in page context. */
export async function pageCookie(name: string): Promise<string | null> {
  const value = await inPage(async (n: string) => {
    const hit = document.cookie.split('; ').find((c) => c.startsWith(`${n}=`));

    return { value: hit ? decodeURIComponent(hit.slice(n.length + 1)) : null };
  }, name);

  return value.value;
}

/** Turns a non-2xx response into a ShareError with the right code. */
export function errorFromResponse(res: PageResponse, context: string): ShareError {
  const detail = extractMessage(res.body);
  const msg = `${context} (HTTP ${res.status})${detail ? `: ${detail}` : ''}`;

  if (res.cfMitigated === 'challenge') {
    return new ShareError(
      'claude.ai wants to check that you are human. Open claude.ai, pass the check, then resume.',
      'auth',
    );
  }

  if (res.status === 401) return new ShareError(msg, 'auth');
  if (res.status === 403) return new ShareError(msg, 'forbidden');
  if (res.status === 404) return new ShareError(msg, 'not-found');

  if (res.status === 429) {
    const secs = Number(res.retryAfter);
    const dateMs = res.retryAfter ? Date.parse(res.retryAfter) - Date.now() : NaN;

    return new ShareError(
      msg,
      'rate-limited',
      Number.isFinite(secs) && secs > 0
        ? secs * 1000
        : Number.isFinite(dateMs) && dateMs > 0
          ? dateMs
          : undefined,
    );
  }

  if (res.status >= 500) return new ShareError(msg, 'server');
  if (res.status === 400 || res.status === 422) return new ShareError(msg, 'invalid');

  return new ShareError(msg, 'unknown');
}

function extractMessage(body: string): string {
  try {
    const json = JSON.parse(body) as {
      error?: { message?: string } | string;
      message?: string;
      detail?: string;
    };
    if (typeof json.error === 'string') return json.error;

    return json.error?.message ?? json.message ?? json.detail ?? '';
  } catch {
    return body.length > 200 ? '' : body.trim();
  }
}

export function parseJson<T>(res: PageResponse, context: string): T {
  try {
    return JSON.parse(res.body) as T;
  } catch {
    throw new ShareError(`${context}: claude.ai sent an unexpected response.`, 'unknown');
  }
}
