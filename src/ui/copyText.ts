/**
 * Copies from a click, which needs no `clipboardWrite` permission. Rejects when neither the async
 * clipboard API nor the old way works, so the caller can say it didn't.
 */
export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // The async API rejects when the page isn't focused; the old way still works from a click.
    // select() moves focus to the hidden field, so give it back, or a keyboard user is left on <body>.
    const focused = document.activeElement;
    const field = document.createElement('textarea');
    field.value = text;
    field.style.position = 'fixed';
    field.style.opacity = '0';
    document.body.append(field);
    let ok = false;

    try {
      field.select();
      ok = document.execCommand('copy');
    } finally {
      field.remove();
      if (focused instanceof HTMLElement) focused.focus();
    }

    if (!ok) throw new Error('Copy failed');
  }
}
