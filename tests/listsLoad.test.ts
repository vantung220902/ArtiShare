import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isContextInvalidated, NoReplyError, problemMessage, withTimeout } from '../src/core/listsLoad';

describe('isContextInvalidated', () => {
  it('recognises the error Chrome throws in an orphaned content script', () => {
    expect(isContextInvalidated(new Error('Extension context invalidated.'))).toBe(true);
  });

  it('is false for other errors and for things that are not errors', () => {
    expect(isContextInvalidated(new Error('Could not establish connection.'))).toBe(false);
    expect(isContextInvalidated('Extension context invalidated.')).toBe(false);
    expect(isContextInvalidated(undefined)).toBe(false);
  });
});

describe('withTimeout', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('passes the answer through when it comes in time', async () => {
    await expect(withTimeout(Promise.resolve(7), 1000)).resolves.toBe(7);
  });

  it('passes an error through when it comes in time', async () => {
    await expect(withTimeout(Promise.reject(new Error('no')), 1000)).rejects.toThrow('no');
  });

  it('rejects with NoReplyError when nothing comes', async () => {
    await Promise.all([
      expect(withTimeout(new Promise<number>(() => {}), 1000)).rejects.toBeInstanceOf(NoReplyError),
      vi.advanceTimersByTimeAsync(1000),
    ]);
  });
});

describe('problemMessage', () => {
  it('names the damaged-lists detail', () => {
    expect(
      problemMessage(
        'unreadable',
        'Saved lists have an unsupported or damaged format. They were not changed.',
      ),
    ).toBe(
      "Couldn't read your lists: Saved lists have an unsupported or damaged format. They were not changed.",
    );
  });

  it('says ArtiShare could not be reached, and that it was updated', () => {
    expect(problemMessage('unreachable', '')).toMatch(/^Couldn't reach ArtiShare/);
    expect(problemMessage('updated', '')).toBe('ArtiShare was updated. Reload this page to use your lists.');
  });
});
