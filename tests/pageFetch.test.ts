import { describe, expect, it, vi } from 'vitest';
import { claudeUrl, getClaudeTab } from '../src/claude/pageFetch';
import { ShareError } from '../src/core/runner';

describe('claudeUrl', () => {
  it('turns a path into an absolute claude.ai URL', () => {
    expect(claudeUrl('/api/account')).toBe('https://claude.ai/api/account');
    expect(claudeUrl('/api/frame/invites/abc?org=x%2Fy')).toBe(
      'https://claude.ai/api/frame/invites/abc?org=x%2Fy',
    );
  });

  it.each([
    '//evil.example/x',
    '/\\evil.example/x',
    '@evil.example/x',
    'https://evil.example/x',
    'api/account',
    '',
  ])('refuses %j, which could leave claude.ai', (path) => {
    expect(() => claudeUrl(path)).toThrow(ShareError);
  });
});

describe('getClaudeTab', () => {
  it('accepts a tab that completed before the listener was attached and deduplicates creation', async () => {
    const create = vi.fn(async () => ({ id: 123 }));
    const onUpdated = { addListener: vi.fn(), removeListener: vi.fn() };
    const onRemoved = { addListener: vi.fn(), removeListener: vi.fn() };
    vi.stubGlobal('chrome', {
      tabs: {
        query: async () => [],
        create,
        get: async () => ({ id: 123, status: 'complete', url: 'https://claude.ai/' }),
        onUpdated,
        onRemoved,
      },
    });

    try {
      await expect(Promise.all([getClaudeTab(), getClaudeTab()])).resolves.toEqual([123, 123]);
      expect(create).toHaveBeenCalledTimes(1);
      expect(onUpdated.removeListener).toHaveBeenCalledTimes(1);
      expect(onRemoved.removeListener).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('reuses a claude.ai tab that is still loading', async () => {
    vi.resetModules();
    const { getClaudeTab: freshGetClaudeTab } = await import('../src/claude/pageFetch');
    const create = vi.fn();
    const onUpdated = { addListener: vi.fn(), removeListener: vi.fn() };
    const onRemoved = { addListener: vi.fn(), removeListener: vi.fn() };
    vi.stubGlobal('chrome', {
      tabs: {
        query: async () => [{ id: 456, status: 'loading', url: 'https://claude.ai/' }],
        create,
        get: async () => ({ id: 456, status: 'complete', url: 'https://claude.ai/' }),
        onUpdated,
        onRemoved,
      },
    });

    try {
      await expect(freshGetClaudeTab()).resolves.toBe(456);
      expect(create).not.toHaveBeenCalled();
      expect(onUpdated.removeListener).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
