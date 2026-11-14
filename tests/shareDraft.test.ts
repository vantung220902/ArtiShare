import { describe, expect, it } from 'vitest';
import { parseShareDraft, restoreSelection } from '../src/core/shareDraft';

const ONE = 'https://claude.ai/artifact/ExampleArtifactOne01';

describe('parseShareDraft', () => {
  it('reads a stored draft', () => {
    expect(parseShareDraft({ artifacts: [ONE], artifactText: 'typed', selected: ['x', 'y'] })).toEqual({
      artifacts: [ONE],
      artifactText: 'typed',
      selected: ['x', 'y'],
    });
  });

  it('keeps no rows, an empty box and no ticks, which is a real choice', () => {
    expect(parseShareDraft({ artifacts: [], artifactText: '', selected: [] })).toEqual({
      artifacts: [],
      artifactText: '',
      selected: [],
    });
  });

  it('turns the links of a 0.3.0 draft, which had only the box, into rows and keeps the rest typed', () => {
    const TWO = 'https://claude.ai/artifact/ExampleArtifactTwo02';
    expect(parseShareDraft({ artifactText: `${ONE}\n${TWO}\nnot a link`, selected: ['x'] })).toEqual({
      artifacts: [ONE, TWO],
      artifactText: 'not a link',
      selected: ['x'],
    });
    expect(parseShareDraft({ artifactText: '', selected: [] })).toEqual({
      artifacts: [],
      artifactText: '',
      selected: [],
    });
  });

  it('leaves a link typed into the box of a draft that has rows as typed', () => {
    expect(parseShareDraft({ artifacts: [], artifactText: ONE, selected: [] })).toEqual({
      artifacts: [],
      artifactText: ONE,
      selected: [],
    });
  });

  it('reads the removed artifacts, and leaves them out when there are none', () => {
    const base = { artifacts: [], artifactText: '', selected: [] };
    expect(parseShareDraft({ ...base, removed: ['k1', 'k2'] })).toEqual({ ...base, removed: ['k1', 'k2'] });
    expect(parseShareDraft({ ...base, removed: [] })).toEqual(base);
    expect(parseShareDraft(base)).toEqual(base);
  });

  it('drops a removed list that is not strings without losing the draft', () => {
    const base = { artifacts: [], artifactText: 'typed', selected: [] };
    expect(parseShareDraft({ ...base, removed: 'k1' })).toEqual(base);
    expect(parseShareDraft({ ...base, removed: ['k1', 2] })).toEqual(base);
  });

  it.each([
    undefined,
    null,
    'text',
    3,
    {},
    { artifactText: 1, selected: [] },
    { artifactText: '', selected: 'x' },
    { artifacts: ONE, artifactText: '', selected: [] },
    { artifacts: [ONE, 2], artifactText: '', selected: [] },
  ])('ignores %j', (raw) => {
    expect(parseShareDraft(raw)).toBeNull();
  });

  it('ignores ticks that are not ids', () => {
    expect(parseShareDraft({ artifactText: '', selected: ['a', 2] })).toBeNull();
  });
});

describe('restoreSelection', () => {
  const draft = (selected: string[]) => ({ artifacts: [], artifactText: '', selected });

  it('uses the defaults without a draft', () => {
    expect(restoreSelection(null, ['a', 'b'], ['a'])).toEqual(['a']);
  });

  it('uses the draft over the defaults, including unticking everything', () => {
    expect(restoreSelection(draft(['b']), ['a', 'b'], ['a'])).toEqual(['b']);
    expect(restoreSelection(draft([]), ['a', 'b'], ['a'])).toEqual([]);
  });

  it('drops lists that were deleted since the draft was saved', () => {
    expect(restoreSelection(draft(['a', 'gone']), ['a'], ['a'])).toEqual(['a']);
  });
});
