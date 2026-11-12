import { describe, expect, it } from 'vitest';
import {
  emptyPopupState,
  parseListFormDraft,
  parsePopupState,
  reconcileListsDraft,
  sameListFormDraft,
} from '../src/core/popupState';
import { parseShareDraft } from '../src/core/shareDraft';

const list = { id: 'a', name: 'Alpha', emails: ['ana@example.com'], access: 'view' as const };
const form = { name: 'Team', text: 'a@example.com\nb@example.com', access: 'edit' as const, baseline: null };

describe('parseListFormDraft', () => {
  it('reads a new list draft and an edit draft', () => {
    expect(parseListFormDraft(form)).toEqual(form);
    expect(parseListFormDraft({ ...form, baseline: list })).toEqual({ ...form, baseline: list });
  });

  it('keeps an empty name and text, since the permission alone can be the draft', () => {
    expect(parseListFormDraft({ name: '', text: '', access: 'comment', baseline: null })).not.toBeNull();
  });

  it.each([
    undefined,
    null,
    'x',
    {},
    { ...form, name: 1 },
    { ...form, text: null },
    { ...form, access: 'owner' },
    { ...form, baseline: { id: '', name: 'x', emails: [] } },
    { ...form, baseline: 'x' },
  ])('ignores %j', (raw) => {
    expect(parseListFormDraft(raw)).toBeNull();
  });
});

describe('parsePopupState', () => {
  it('starts on the Share tab with nothing drafted', () => {
    expect(parsePopupState(undefined)).toEqual(emptyPopupState());
    expect(parsePopupState('junk')).toEqual(emptyPopupState());
    expect(emptyPopupState().tab).toBe('share');
  });

  it('reads the tab and the Lists tab drafts', () => {
    const stored = {
      tab: 'lists',
      lists: { adding: true, newList: form, open: ['a'], edits: { a: { ...form, baseline: list } } },
    };
    expect(parsePopupState(stored)).toEqual(stored);
  });

  it('falls back piece by piece', () => {
    const state = parsePopupState({
      tab: 'nope',
      lists: { adding: 'yes', newList: 3, open: ['a', 2], edits: 4 },
    });
    expect(state).toEqual({ ...emptyPopupState(), lists: { ...emptyPopupState().lists, open: ['a'] } });
  });

  it('drops an edit that has no baseline or is filed under another list', () => {
    const state = parsePopupState({
      lists: { edits: { a: form, b: { ...form, baseline: list } } },
    });
    expect(state.lists.edits).toEqual({});
  });
});

describe('reconcileListsDraft', () => {
  it('drops expanded lists and edits of lists that were deleted', () => {
    const draft = {
      adding: true,
      newList: form,
      open: ['a', 'gone'],
      edits: { a: { ...form, baseline: list }, gone: { ...form, baseline: { ...list, id: 'gone' } } },
    };
    expect(reconcileListsDraft(draft, ['a'])).toEqual({
      adding: true,
      newList: form,
      open: ['a'],
      edits: { a: { ...form, baseline: list } },
    });
  });
});

describe('sameListFormDraft', () => {
  it('compares by content and treats missing as null', () => {
    expect(sameListFormDraft({ ...form }, { ...form })).toBe(true);
    expect(sameListFormDraft(undefined, null)).toBe(true);
    expect(sameListFormDraft(form, null)).toBe(false);
    expect(sameListFormDraft(form, { ...form, access: 'view' })).toBe(false);
  });
});

describe('parseShareDraft with the inline list form', () => {
  it('keeps whether the form is open and what is typed in it', () => {
    expect(parseShareDraft({ artifactText: '', selected: [], creating: true, newList: form })).toEqual({
      artifactText: '',
      selected: [],
      creating: true,
      newList: form,
    });
  });

  it('reads a draft saved before the form was kept, and ignores a malformed or edit form', () => {
    expect(parseShareDraft({ artifactText: 'x', selected: [] })).toEqual({ artifactText: 'x', selected: [] });
    expect(parseShareDraft({ artifactText: '', selected: [], newList: 3 })).toEqual({
      artifactText: '',
      selected: [],
    });
    expect(parseShareDraft({ artifactText: '', selected: [], newList: { ...form, baseline: list } })).toEqual(
      {
        artifactText: '',
        selected: [],
      },
    );
  });
});
