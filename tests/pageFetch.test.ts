import { describe, expect, it } from 'vitest';
import { claudeUrl } from '../src/claude/pageFetch';
import { ShareError } from '../src/core/runner';

describe('claudeUrl', () => {
  it('turns a path into an absolute claude.ai URL', () => {
    expect(claudeUrl('/api/account')).toBe('https://claude.ai/api/account');
    expect(claudeUrl('/api/frame/invites/abc?org=x%2Fy')).toBe('https://claude.ai/api/frame/invites/abc?org=x%2Fy');
  });

  it.each(['//evil.example/x', '/\\evil.example/x', '@evil.example/x', 'https://evil.example/x', 'api/account', ''])(
    'refuses %j, which could leave claude.ai',
    (path) => {
      expect(() => claudeUrl(path)).toThrow(ShareError);
    },
  );
});
