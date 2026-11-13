/** Where the toolbar icon opens ArtiShare: in a popup, or in the browser's side panel. */
export type Surface = 'popup' | 'sidepanel';

export const DEFAULT_SURFACE: Surface = 'popup';

/** Reads the stored choice. Anything else (nothing stored yet, another version's value) is the popup. */
export function parseSurface(raw: unknown): Surface {
  return raw === 'sidepanel' ? 'sidepanel' : DEFAULT_SURFACE;
}
