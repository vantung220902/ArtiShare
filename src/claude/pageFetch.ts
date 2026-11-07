import { ShareError } from '../core/runner';

/**
 * Runs fetch() inside a claude.ai tab's own page context (MAIN world), so requests carry the
 * user's session exactly as the Share menu's do. Nothing about the session leaves the page:
 * only the response status and body come back to the extension.
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

async function isUsable(tab: chrome.tabs.Tab | undefined): Promise<boolean> {
  return !!tab?.id && !tab.discarded && tab.status === 'complete' && !!tab.url?.startsWith(`${CLAUDE_ORIGIN}/`);
}

function waitForLoad(tabId: number, timeoutMs = 30_000): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      reject(new ShareError('claude.ai took too long to load.', 'network'));
    }, timeoutMs);
    const listener = (id: number, info: { status?: string }) => {
      if (id === tabId && info.status === 'complete') {
        clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
  });
}

/** Finds an open claude.ai tab, or opens one in the background. */
export async function getClaudeTab(): Promise<number> {
  if (ownTabId !== undefined) {
    const tab = await chrome.tabs.get(ownTabId).catch(() => undefined);
    if (await isUsable(tab)) return ownTabId;
    ownTabId = undefined;
  }
  const tabs = await chrome.tabs.query({ url: CLAUDE_MATCH });
  for (const tab of tabs) {
    if (await isUsable(tab)) return tab.id!;
  }
  const created = await chrome.tabs.create({ url: `${CLAUDE_ORIGIN}/`, active: false });
  const id = created.id;
  if (id === undefined) throw new ShareError("Couldn't open a claude.ai tab.", 'network');
  await waitForLoad(id);
  ownTabId = id;
  return id;
}

/** Runs `func(arg)` in the claude.ai tab's main world and returns its result. */
async function inPage<A, R>(func: (arg: A) => Promise<R | { error: string }>, arg: A): Promise<R> {
  const tabId = await getClaudeTab();
  let results: chrome.scripting.InjectionResult<R | { error: string }>[];
  try {
    results = await chrome.scripting.executeScript({ target: { tabId }, world: 'MAIN', args: [arg], func });
  } catch (e) {
    ownTabId = undefined;
    throw new ShareError(`Couldn't reach the claude.ai tab: ${(e as Error).message}`, 'network');
  }

  const result = results[0]?.result;
  if (result === undefined) throw new ShareError('The claude.ai tab returned nothing.', 'network');
  if (result && typeof result === 'object' && 'error' in result) {
    throw new ShareError(`Request failed: ${result.error}`, 'network');
  }
  return result as R;
}

export function pageFetch(req: PageRequest): Promise<PageResponse> {
  return inPage<PageRequest, PageResponse>(async (r: PageRequest) => {
    try {
      const res = await fetch(r.path, {
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
  }, req);
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
    return new ShareError('claude.ai wants to check that you are human. Open claude.ai, pass the check, then resume.', 'auth');
  }
  if (res.status === 401) return new ShareError(msg, 'auth');
  if (res.status === 403) return new ShareError(msg, 'forbidden');
  if (res.status === 404) return new ShareError(msg, 'not-found');
  if (res.status === 429) {
    const secs = Number(res.retryAfter);
    return new ShareError(msg, 'rate-limited', Number.isFinite(secs) && secs > 0 ? secs * 1000 : undefined);
  }
  if (res.status >= 500) return new ShareError(msg, 'server');
  if (res.status === 400 || res.status === 422) return new ShareError(msg, 'invalid');
  return new ShareError(msg, 'unknown');
}

function extractMessage(body: string): string {
  try {
    const json = JSON.parse(body) as { error?: { message?: string } | string; message?: string; detail?: string };
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
