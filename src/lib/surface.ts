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

/** Moves ArtiShare back to the popup: the toolbar icon opens the popup again. */
export async function moveToPopup(): Promise<void> {
  await chooseSurface('popup');
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
