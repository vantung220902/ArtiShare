import { useEffect, useRef, useState } from 'react';
import { copyText } from '../../ui/copyText';

const COPIED_MS = 2000;
const REFUSABLE = import.meta.env.WXT_FAKE_CLAUDE === 'true';

export const FILL_FAILED = "Couldn't put the addresses in claude.ai's field. Copy them and paste them in.";

/**
 * What the box offers when claude.ai's field didn't take the addresses: a button that copies them,
 * and, if the clipboard is refused too, a read-only box with them already selected, so the person
 * can copy by hand. `label` is the button's text ('Copy 3 addresses').
 */
export function CopyFallback({
  text,
  label,
  onCopied,
}: {
  text: string;
  label: string;
  onCopied: () => void;
}) {
  const [state, setState] = useState<'idle' | 'copied' | 'refused'>('idle');
  const manual = useRef<HTMLTextAreaElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  // The box is shown the moment the clipboard says no, and holds the text selected for Ctrl+C.
  useEffect(() => {
    if (state === 'refused') manual.current?.select();
  }, [state]);

  function copy() {
    clearTimeout(timer.current);
    // A page's own stub never reaches a content script's world, so the fake build reads a mark the
    // test puts on <html> (as it does for the open shadow root) to make the clipboard say no.
    const refused = REFUSABLE && 'artishareRefuseClipboard' in document.documentElement.dataset;
    void (refused ? Promise.reject(new Error('Copy refused')) : copyText(text)).then(
      () => {
        setState('copied');
        onCopied();
        // The button is ready for another try after a moment.
        timer.current = setTimeout(() => setState('idle'), COPIED_MS);
      },
      () => setState('refused'),
    );
  }

  return (
    <>
      <button type="button" className="retry" onClick={copy}>
        {state === 'copied' ? 'Copied' : label}
      </button>
      {state === 'refused' && (
        <>
          <p className="note warning">
            Couldn&apos;t copy. Select the addresses below and copy them yourself.
          </p>
          <textarea
            ref={manual}
            className="manual"
            readOnly
            rows={3}
            aria-label="Addresses to copy"
            value={text}
          />
        </>
      )}
    </>
  );
}
