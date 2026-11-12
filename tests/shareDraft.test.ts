import { describe, expect, it } from 'vitest';
import { parseShareDraft, restoreSelection } from '../src/core/shareDraft';

describe('parseShareDraft', () => {
  it('reads a stored draft', () => {
    expect(parseShareDraft({ artifactText: 'https://claude.ai/artifact/a', selected: ['x', 'y'] })).toEqual({
      artifactText: 'https://claude.ai/artifact/a',
      selected: ['x', 'y'],
    });
  });

  it('keeps an empty box and no ticks, which is a real choice', () => {
    expect(parseShareDraft({ artifactText: '', selected: [] })).toEqual({ artifactText: '', selected: [] });
  });

  it.each([
    undefined,
    null,
    'text',
    3,
    {},
    { artifactText: 1, selected: [] },
    { artifactText: '', selected: 'x' },
  ])('ignores %j', (raw) => {
    expect(parseShareDraft(raw)).toBeNull();
  });

  it('ignores ticks that are not ids', () => {
    expect(parseShareDraft({ artifactText: '', selected: ['a', 2] })).toBeNull();
  });
});

describe('restoreSelection', () => {
  it('uses the defaults without a draft', () => {
    expect(restoreSelection(null, ['a', 'b'], ['a'])).toEqual(['a']);
  });

  it('uses the draft over the defaults, including unticking everything', () => {
    expect(restoreSelection({ artifactText: '', selected: ['b'] }, ['a', 'b'], ['a'])).toEqual(['b']);
    expect(restoreSelection({ artifactText: '', selected: [] }, ['a', 'b'], ['a'])).toEqual([]);
  });

  it('drops lists that were deleted since the draft was saved', () => {
    expect(restoreSelection({ artifactText: '', selected: ['a', 'gone'] }, ['a'], ['a'])).toEqual(['a']);
  });
});
