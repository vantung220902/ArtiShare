import type { Surface } from '../core/surface';
import { loadSurface, saveSurface } from './storage';

/** False on a Chrome without side panels, where `chrome.sidePanel` doesn't exist. */
export function sidePanelSupported(): boolean {
  return typeof chrome.sidePanel?.open === 'function';
}

/**
 * Points the toolbar icon at `surface`. The popup is switched off by giving the action an empty
 * popup, and the side panel on by letting the icon open it. `setPopup` doesn't survive a browser
 * restart, so the background applies the stored choice again each time it starts.
 */
export async function applySurface(surface: Surface): Promise<void> {
  // Without side panels the popup is all there is, whatever was stored, so the icon can't go dead.
  const sidePanel = surface === 'sidepanel' && sidePanelSupported();
  // The popup page named in the manifest, so its path is only written in the popup entrypoint.
  const popup = chrome.runtime.getManifest().action?.default_popup ?? 'popup.html';
  await Promise.all([
    sidePanelSupported()
      ? chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: sidePanel })
      : undefined,
    chrome.action.setPopup({ popup: sidePanel ? '' : popup }),
  ]);
}

/** Makes `surface` the choice: remembered, and what the toolbar icon opens from now on. */
export async function chooseSurface(surface: Surface): Promise<void> {
  await saveSurface(surface);
  await applySurface(surface);
}

/** Applies the remembered choice; called when the background starts. */
export async function applyStoredSurface(): Promise<void> {
  await applySurface(await loadSurface());
}

/** How opening the popup went: `reason` is Chrome's error, absent when `openPopup` doesn't exist. */
export type PopupOpening = { opened: true } | { opened: false; reason?: string };

/**
 * Opens the popup under the toolbar icon of this page's window. It opens whatever the action's popup
 * is set to, so call it only once the choice has been applied.
 */
export async function openPopupHere(): Promise<PopupOpening> {
  // Chrome 127 added it for every extension; before that there is nothing to call.
  if (typeof chrome.action.openPopup !== 'function') return { opened: false };
  try {
    const { id: windowId } = await chrome.windows.getCurrent();
    await chrome.action.openPopup({ windowId: windowId! });

    return { opened: true };
  } catch (e) {
    return { opened: false, reason: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Moves ArtiShare back to the popup: the toolbar icon opens the popup from now on, and it is opened
 * now. The choice stays made if the popup can't be opened (the caller tells the user to click the
 * icon); this only rejects if the choice itself couldn't be saved, and then nothing has changed.
 */
export async function moveToPopup(): Promise<PopupOpening> {
  await chooseSurface('popup');

  return openPopupHere();
}

/**
 * Moves ArtiShare from the popup into the side panel of this window, and makes the toolbar icon
 * open it from now on. Call from a click: the browser only opens a side panel for a user gesture.
 */
export async function moveToSidePanel(): Promise<void> {
  const { id: windowId } = await chrome.windows.getCurrent();
  // Opened first, while the click still counts as a gesture.
  await chrome.sidePanel.open({ windowId: windowId! });
  await chooseSurface('sidepanel');
}
