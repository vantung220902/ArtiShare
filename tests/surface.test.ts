import { describe, expect, it } from 'vitest';
import { DEFAULT_SURFACE, parseSurface } from '../src/core/surface';

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
