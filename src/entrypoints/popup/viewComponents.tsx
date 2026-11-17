import { useEffect, useRef, useState } from 'react';
import { copyText } from '../../ui/copyText';
import { CheckIcon, ChevronIcon, CloseIcon, CopyIcon, LinkIcon } from '../../ui/icons';

const COPIED_MS = 2000;

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
