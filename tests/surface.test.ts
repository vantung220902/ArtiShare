import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SURFACE, parseSurface } from '../src/core/surface';
import { moveToPopup } from '../src/lib/surface';

describe('parseSurface', () => {
  it('reads both choices', () => {
    expect(parseSurface('popup')).toBe('popup');
    expect(parseSurface('sidepanel')).toBe('sidepanel');
  });

  it.each([undefined, null, '', 'panel', 1, {}])('falls back to the popup for %j', (raw) => {
    expect(parseSurface(raw)).toBe(DEFAULT_SURFACE);
    expect(DEFAULT_SURFACE).toBe('popup');
  });
});

describe('moveToPopup', () => {
  const calls: string[] = [];
  const stubChrome = (opts: { openPopup?: unknown; saveFails?: boolean }) => {
    calls.length = 0;
    vi.stubGlobal('chrome', {
      runtime: { getManifest: () => ({ action: { default_popup: 'popup.html' } }) },
      windows: { getCurrent: async () => ({ id: 7 }) },
      sidePanel: {
        open: async () => {},
        setPanelBehavior: async (b: { openPanelOnActionClick: boolean }) =>
          void calls.push(`panelBehavior:${b.openPanelOnActionClick}`),
      },
      storage: {
        local: {
          set: async (items: Record<string, string>) => {
            if (opts.saveFails) throw new Error('quota');
            calls.push(`save:${items.surface}`);
          },
        },
      },
      action: {
        setPopup: async (p: { popup: string }) => void calls.push(`setPopup:${p.popup}`),
        openPopup: opts.openPopup,
      },
    });
  };
  afterEach(() => vi.unstubAllGlobals());

  it('saves and applies the choice, and only then opens the popup in this window', async () => {
    stubChrome({
      openPopup: async (o: { windowId: number }) => void calls.push(`openPopup:${o.windowId}`),
    });
    await expect(moveToPopup()).resolves.toEqual({ opened: true });
    expect(calls[0]).toBe('save:popup');
    expect(calls.at(-1)).toBe('openPopup:7');
    expect(calls).toContain('setPopup:popup.html');
    expect(calls).toContain('panelBehavior:false');
  });

  it('keeps the choice and reports why when Chrome refuses to open the popup', async () => {
    stubChrome({
      openPopup: async () => {
        throw new Error('Could not find an active browser window.');
      },
    });
    await expect(moveToPopup()).resolves.toEqual({
      opened: false,
      reason: 'Could not find an active browser window.',
    });
    expect(calls).toContain('save:popup');
  });

  it('has nothing to open on a Chrome without openPopup, but the choice is made', async () => {
    stubChrome({});
    await expect(moveToPopup()).resolves.toEqual({ opened: false });
    expect(calls).toContain('setPopup:popup.html');
  });

  it('rejects and changes nothing when the choice cannot be saved', async () => {
    stubChrome({ saveFails: true, openPopup: async () => void calls.push('openPopup') });
    await expect(moveToPopup()).rejects.toThrow('quota');
    expect(calls).toEqual([]);
  });
});
