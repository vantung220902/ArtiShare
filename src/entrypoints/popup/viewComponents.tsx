import { useEffect, useRef, useState } from 'react';
import { CheckIcon, ChevronIcon, CloseIcon, CopyIcon, LinkIcon } from '../../ui/icons';

const COPIED_MS = 2000;

/** Copies from a click in the panel, which needs no `clipboardWrite` permission. */
async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // The async API rejects when the panel isn't focused; the old way still works from a click.
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

type CopyState = 'idle' | 'copied' | 'failed';

const COPY_LABEL: Record<CopyState, string> = {
  idle: 'Copy link',
  copied: 'Copied',
  failed: "Couldn't copy",
};

function CopyLinkButton({ url }: { url: string }) {
  const [state, setState] = useState<CopyState>('idle');
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  // Both outcomes revert on their own, so the button is ready for another try.
  const show = (next: CopyState) => {
    setState(next);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setState('idle'), COPIED_MS);
  };

  const copy = () => {
    void copyText(url).then(
      () => show('copied'),
      () => show('failed'),
    );
  };

  return (
    <button
      type="button"
      className={`ghost icon-btn copy-btn${state === 'idle' ? '' : ` ${state}`}`}
      aria-label={COPY_LABEL[state]}
      title={COPY_LABEL[state]}
      onClick={copy}
    >
      {state === 'copied' ? (
        <CheckIcon size={14} />
      ) : state === 'failed' ? (
        <CloseIcon size={14} />
      ) : (
        <CopyIcon size={14} />
      )}
    </button>
  );
}

export function ArtifactLink({ url }: { url: string }) {
  return (
    <div className="artifact-row">
      <a href={url} target="_blank" rel="noreferrer" className="artifact-link">
        <LinkIcon size={14} />
        <span className="truncate">{url.replace('https://', '')}</span>
      </a>
      <CopyLinkButton url={url} />
    </div>
  );
}

export function EmailGroup({ title, emails }: { title: string; emails: string[] }) {
  if (!emails.length) return null;

  return (
    <details className="group">
      <summary>
        <ChevronIcon size={14} />
        {title}
        <span className="count">{emails.length}</span>
      </summary>
      <ul className="emails">
        {emails.map((e) => (
          <li key={e}>{e}</li>
        ))}
      </ul>
    </details>
  );
}
