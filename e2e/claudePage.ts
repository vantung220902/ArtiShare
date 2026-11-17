import { readFileSync } from 'node:fs';
import type { BrowserContext, Frame, Page } from '@playwright/test';

/**
 * A stand-in for a claude.ai artifact page and its Share dialog (the files in `claude-stand-in/`),
 * served at claude.ai URLs through `context.route`, so the in-page Share lists box can be tested
 * without signing in and without inviting anyone. Nothing leaves the machine: every request to
 * claude.ai is answered here, and anything that isn't one of the stand-in's pages gets a 404.
 */

export const ARTIFACT_URL = 'https://claude.ai/artifact/StandInArtifact01';
export const FRAME_UUID = '3f1c9a52-7d0e-4b8a-9c61-2e5d8a4b7f10';
export const CHAT_URL = `https://claude.ai/chat/StandInChat01?artifact=${FRAME_UUID}`;

const file = (name: string) =>
  readFileSync(new URL(`./claude-stand-in/${name}`, import.meta.url)).toString('utf8');

/** The page with its styles and script written into it, so a page is a single request. */
function render(name: string) {
  return file(name)
    .replace('<!-- inline:dialog.css -->', () => `<style>${file('dialog.css')}</style>`)
    .replace('<!-- inline:dialog.js -->', () => `<script>${file('dialog.js')}</script>`);
}

export type StandInOptions = {
  /** The theme the page starts in. */
  mode?: 'light' | 'dark';
  /** A dialog without the invite field. */
  noInvite?: boolean;
  /**
   * Leave ArtiShare's box with its closed shadow root, as the real build has it. By default the
   * fake build is asked to open it, because Playwright can't look inside a closed one.
   */
  closedShadow?: boolean;
};

declare global {
  interface Window {
    /** The stand-in's hooks, in the window the dialog is drawn in (see `dialog.js`). */
    __standIn: {
      invited: { emails: string[] }[];
      copied: number;
      open: () => void;
      close: () => void;
      setMode: (mode: 'light' | 'dark') => void;
      rerenderPinned: () => void;
    };
  }
}

const routed = new WeakMap<BrowserContext, { requests: string[] }>();

/**
 * Serve the stand-in for every claude.ai URL in this context (once; asking again returns the same
 * handle). `requests` lists every URL the browser asked claude.ai for, in order, so a test can
 * assert that nothing else was fetched.
 */
export async function routeClaude(context: BrowserContext) {
  const existing = routed.get(context);
  if (existing) return existing;
  const requests: string[] = [];
  routed.set(context, { requests });
  await context.route('https://claude.ai/**', async (route) => {
    const url = new URL(route.request().url());
    requests.push(url.href);
    const html = (body: string) => route.fulfill({ contentType: 'text/html; charset=utf-8', body });
    if (url.pathname.startsWith('/code/artifact/')) return html(render('frame.html'));
    if (url.pathname.startsWith('/artifact/')) return html(render('wrapper.html'));
    if (url.pathname.startsWith('/chat/')) return html(render('chat.html'));

    return route.fulfill({ status: 404, contentType: 'text/plain', body: 'Not part of the stand-in' });
  });

  return { requests };
}

/**
 * Asks the fake build to leave the box's shadow root open (see `OPEN_FOR_TESTS` in the content
 * script). The page marks itself, and the content script, which runs later, reads the mark.
 */
async function openShadowForTests(context: BrowserContext) {
  await context.addInitScript(() => {
    const mark = () => {
      const root = document.documentElement as HTMLElement | null;
      if (root) root.dataset.artishareOpenShadow = '';

      return Boolean(root);
    };
    if (!mark()) {
      new MutationObserver((_records, observer) => {
        if (mark()) observer.disconnect();
      }).observe(document, { childList: true });
    }
  });
}

function query(options: StandInOptions) {
  const params = new URLSearchParams();
  if (options.mode) params.set('m', options.mode);
  if (options.noInvite) params.set('noInvite', '1');

  return params.toString();
}

async function frameOf(page: Page) {
  // The iframe's document is a different Frame from the page's; wait until it has its script.
  await page.waitForFunction(() =>
    Array.from(document.querySelectorAll('iframe')).every(
      (iframe) => (iframe.contentWindow as { __standIn?: unknown } | null)?.__standIn,
    ),
  );

  return page.frames().find((f) => f.url().includes('/code/artifact/')) as Frame;
}

/**
 * Open the stand-in artifact page (a wrapper with the artifact and the dialog in an iframe). The
 * returned `host` is the frame the dialog is drawn in, for `host.locator(…)` and `host.evaluate`.
 * Clicking the wrapper's Share button, `page.getByRole('button', { name: 'Share' })`, opens it.
 */
export async function openArtifact(context: BrowserContext, options: StandInOptions = {}) {
  await routeClaude(context);
  if (!options.closedShadow) await openShadowForTests(context);
  const page = await context.newPage();
  const q = query(options);
  await page.goto(`${ARTIFACT_URL}${q ? `?${q}` : ''}`);
  const host = await frameOf(page);

  return { page, host, share: () => page.getByRole('button', { name: 'Share', exact: true }).click() };
}

/**
 * Open the top-frame variant: no iframe, the dialog is in the page itself (an artifact open beside
 * a chat). `host` is the page's main frame.
 */
export async function openChatArtifact(context: BrowserContext, options: StandInOptions = {}) {
  await routeClaude(context);
  if (!options.closedShadow) await openShadowForTests(context);
  const page = await context.newPage();
  const q = query(options);
  await page.goto(`${CHAT_URL}${q ? `&${q}` : ''}`);

  return {
    page,
    host: page.mainFrame(),
    share: () => page.getByRole('button', { name: 'Share', exact: true }).click(),
  };
}
