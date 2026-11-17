import { useCallback, useEffect, useState } from 'react';
import { fieldHolds } from '../../core/inviteField';

export const FIELD = 'input[role=combobox]';

// Called with `.call(field, …)`, which is what the rule can't see.
// oxlint-disable-next-line typescript/unbound-method
const nativeValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;

/** claude.ai re-renders its dialog now and then, so the field is looked up again each time. */
const fieldIn = (entry: Element) => entry.querySelector<HTMLInputElement>(FIELD);

/**
 * Puts text in claude.ai's invite field the way typing does. The field is a React-controlled input:
 * a plain `input.value = …` is ignored by React's value tracker, so the browser's own setter is used
 * and a bubbling `input` event follows, which makes claude.ai read the value and offer Invite.
 * Returns false when the field isn't there (the dialog changed) or doesn't hold the text right
 * afterwards (it ignored a script's input), so a silent no-op never looks like success.
 */
export function fillInviteField(entry: Element, text: string): boolean {
  const field = fieldIn(entry);
  if (!field || !nativeValue) return false;
  nativeValue.call(field, text);
  field.dispatchEvent(new Event('input', { bubbles: true }));
  field.focus();
  // What the page holds now, not what we wrote: a field that dropped the input still says '' or the old text.
  if (!fieldHolds(readInviteField(entry), text)) return false;
  field.setSelectionRange(text.length, text.length);

  return true;
}

/** What the invite field holds right now, read from the page rather than from what we last saw. */
export const readInviteField = (entry: Element) => fieldIn(entry)?.value ?? '';

/**
 * What the invite field holds now, kept in step with typing, pasting and our own fills, plus a
 * `refresh` for the moments nothing tells us: claude.ai clears the field after Invite without an
 * input event, so the box re-reads it when the person comes back to it.
 */
export function useFieldText(entry: Element): [string, () => void] {
  const [text, setText] = useState(() => readInviteField(entry));
  const refresh = useCallback(() => setText(readInviteField(entry)), [entry]);
  useEffect(() => {
    // The field may have changed between the first render and now (a re-render of claude.ai's own).
    const timers = [window.setTimeout(refresh, 0)];
    // The event bubbles up from the field, so one listener on the entry survives a re-render of it.
    entry.addEventListener('input', refresh);
    entry.addEventListener('focusin', refresh);
    // claude.ai cancels a paste and sets the value itself, so no input event follows. Read again once
    // its own state has settled.
    const afterPaste = () => {
      timers.push(window.setTimeout(refresh, 0), window.setTimeout(refresh, 150));
    };
    entry.addEventListener('paste', afterPaste);

    return () => {
      entry.removeEventListener('input', refresh);
      entry.removeEventListener('focusin', refresh);
      entry.removeEventListener('paste', afterPaste);
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [entry, refresh]);

  return [text, refresh];
}
