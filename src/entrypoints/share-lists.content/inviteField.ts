import { useEffect, useState } from 'react';

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
 * Returns false when the field isn't there (the dialog changed), so the caller can say so.
 */
export function fillInviteField(entry: Element, text: string): boolean {
  const field = fieldIn(entry);
  if (!field || !nativeValue) return false;
  nativeValue.call(field, text);
  field.dispatchEvent(new Event('input', { bubbles: true }));
  field.focus();
  field.setSelectionRange(text.length, text.length);

  return true;
}

/** What the invite field holds now, kept in step with typing, pasting and our own fills. */
export function useFieldText(entry: Element): string {
  const [text, setText] = useState(() => fieldIn(entry)?.value ?? '');
  useEffect(() => {
    const read = () => setText(fieldIn(entry)?.value ?? '');
    read();
    // The event bubbles up from the field, so one listener on the entry survives a re-render of it.
    entry.addEventListener('input', read);

    return () => entry.removeEventListener('input', read);
  }, [entry]);

  return text;
}
