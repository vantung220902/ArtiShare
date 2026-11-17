import { createRoot, type Root } from 'react-dom/client';
import type { ContentScriptContext } from 'wxt/utils/content-script-context';
import { createShadowRootUi, type ShadowRootContentScriptUi } from 'wxt/utils/content-script-ui/shadow-root';
import css from './style.css?inline';
import { FIELD } from './inviteField';
import { ShareListsBox } from './ShareListsBox';

// Only the markers claude.ai's Share dialog is known to carry (see harness/claude-share-dialog.md).
// Class names are utility classes and change; if a marker goes, the box simply doesn't appear.
const PORTAL = '[data-base-ui-portal]';
const ANCHOR = '[data-share-pinned] > [data-share-entry]';

/** Tests only: the fake build can leave the shadow root open so Playwright can look inside it. */
const OPEN_FOR_TESTS =
  import.meta.env.WXT_FAKE_CLAUDE === 'true' && 'artishareOpenShadow' in document.documentElement.dataset;

interface Mounted {
  entry: Element;
  ui: ShadowRootContentScriptUi<Root>;
}

export default defineContentScript({
  matches: ['https://claude.ai/*'],
  // The artifact and its Share dialog live in a same-origin iframe of the page.
  allFrames: true,
  main(ctx) {
    watchShareDialogs(ctx);
  },
});

function watchShareDialogs(ctx: ContentScriptContext) {
  const mounted = new Map<Element, Mounted>();
  const pending = new Set<Element>();
  const watchers = new Map<Element, MutationObserver>();

  function release(portal: Element) {
    mounted.get(portal)?.ui.remove();
    mounted.delete(portal);
  }

  async function sync(portal: Element) {
    const entry = portal.querySelector(ANCHOR);
    const current = mounted.get(portal);
    if (!entry?.querySelector(FIELD)) {
      // A dialog without the invite field gets no box, and a box whose anchor went is dropped.
      if (current) release(portal);

      return;
    }
    // claude.ai re-renders the area now and then: the box is only kept if it's still where it belongs.
    if (current?.entry === entry && current.ui.shadowHost.previousElementSibling === entry) return;
    if (current) release(portal);
    if (pending.has(portal)) return;
    pending.add(portal);
    try {
      const ui = await createShadowRootUi<Root>(ctx, {
        name: 'artishare-share-lists',
        position: 'inline',
        anchor: entry,
        append: 'after',
        // Closed, so claude.ai's scripts can't reach into the box.
        mode: OPEN_FOR_TESTS ? 'open' : 'closed',
        inheritStyles: true,
        css,
        onMount: (container) => {
          const root = createRoot(container);
          root.render(<ShareListsBox entry={entry} />);

          return root;
        },
        onRemove: (root) => root?.unmount(),
      });
      if (!portal.isConnected || !entry.isConnected) return;
      ui.mount();
      mounted.set(portal, { entry, ui });
    } catch {
      // Never let a problem here reach claude.ai's page.
    } finally {
      pending.delete(portal);
    }
  }

  function watch(portal: Element) {
    if (watchers.has(portal)) return;
    // Only this portal is watched, not the page: chat pages stream text all the time.
    const observer = new MutationObserver(() => void sync(portal));
    observer.observe(portal, { childList: true, subtree: true });
    watchers.set(portal, observer);
    void sync(portal);
  }

  function forget(portal: Element) {
    watchers.get(portal)?.disconnect();
    watchers.delete(portal);
    release(portal);
  }

  const portalsIn = (node: Node): Element[] =>
    node instanceof Element ? (node.matches(PORTAL) ? [node] : [...node.querySelectorAll(PORTAL)]) : [];

  // The dialog is portalled to a direct child of <body>, so only those additions are looked at.
  const body = new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.addedNodes) portalsIn(node).forEach(watch);
      for (const node of record.removedNodes) portalsIn(node).forEach(forget);
    }
  });
  const start = () => {
    body.observe(document.body, { childList: true });
    document.querySelectorAll(PORTAL).forEach(watch);
  };
  if (document.body) start();
  else document.addEventListener('DOMContentLoaded', start, { once: true });

  ctx.onInvalidated(() => {
    body.disconnect();
    for (const observer of watchers.values()) observer.disconnect();
    for (const portal of mounted.keys()) release(portal);
  });
}
