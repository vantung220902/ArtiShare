import { useEffect, useRef, useState } from 'react';
import { CheckIcon, ChevronIcon, CopyIcon, LinkIcon } from '../../ui/icons';

const COPIED_MS = 2000;

/** Copies from a click in the panel, which needs no `clipboardWrite` permission. */
async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // The async API rejects when the panel isn't focused; the old way still works from a click.
    const field = document.createElement('textarea');
    field.value = text;
    field.style.position = 'fixed';
    field.style.opacity = '0';
    document.body.append(field);
    field.select();
    const ok = document.execCommand('copy');
    field.remove();
    if (!ok) throw new Error('Copy failed');
  }
}

function CopyLinkButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = () => {
    void copyText(url).then(
      () => {
        setCopied(true);
        clearTimeout(timer.current);
        timer.current = setTimeout(() => setCopied(false), COPIED_MS);
      },
      () => setCopied(false),
    );
  };

  return (
    <button
      type="button"
      className={`ghost icon-btn copy-btn${copied ? ' copied' : ''}`}
      aria-label={copied ? 'Copied' : 'Copy link'}
      title={copied ? 'Copied' : 'Copy link'}
      onClick={copy}
    >
      {copied ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
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
