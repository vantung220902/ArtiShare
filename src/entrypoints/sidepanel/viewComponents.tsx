import { ChevronIcon, LinkIcon } from '../../ui/icons';

export function ArtifactLink({ url }: { url: string }) {
  return (
    <a href={url} target="_blank" rel="noreferrer" className="artifact-link">
      <LinkIcon size={14} />
      <span className="truncate">{url.replace('https://', '')}</span>
    </a>
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
