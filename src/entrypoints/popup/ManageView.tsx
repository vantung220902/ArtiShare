import { useEffect, useState } from 'react';
import { ACCESS_LABELS, type ArtifactRef, type Sharee } from '../../core/types';
import { send } from '../../lib/messages';
import { BackIcon } from '../../ui/icons';
import { ArtifactLink } from './viewComponents';

/** The label for what someone can do; claude.ai may send a role this extension doesn't know. */
const accessLabel = (access: Sharee['access']) =>
  access in ACCESS_LABELS ? ACCESS_LABELS[access as keyof typeof ACCESS_LABELS] : 'Unknown';

/** Who is already invited to one artifact. Reads from claude.ai each time it opens, never from a copy. */
export function ManageView({ artifact, onBack }: { artifact: ArtifactRef; onBack: () => void }) {
  // null while loading.
  const [people, setPeople] = useState<Sharee[] | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let stale = false;
    // oxlint-disable-next-line react/set-state-in-effect -- a retry goes back to loading before asking again
    setPeople(null);
    setError('');

    send('sharees', { artifact }).then(
      (found) => {
        // The owner is always shown first, from what we know, so claude.ai's own entry for them is dropped.
        if (!stale) setPeople(found.filter((p) => p.access !== 'owner'));
      },
      (e: Error) => {
        if (!stale) setError(e.message);
      },
    );

    return () => {
      stale = true;
    };
  }, [artifact, attempt]);

  return (
    <div className="stack">
      <div className="row spread">
        <button className="ghost" onClick={onBack}>
          <BackIcon size={14} /> Back
        </button>
      </div>
      <section className="card stack">
        <h2 className="title">People with access</h2>
        <ArtifactLink url={artifact.url} />
        {error ? (
          <p className="alert">
            {error}{' '}
            <button className="link" onClick={() => setAttempt((n) => n + 1)}>
              Retry
            </button>
          </p>
        ) : people === null ? (
          <output className="hint">Loading people…</output>
        ) : (
          <ul className="people">
            <li>
              <div className="grow">
                <div className="email">You (owner)</div>
              </div>
            </li>
            {people.map((p) => (
              <li key={p.id ?? p.email}>
                <div className="grow">
                  <div className="email">{p.email}</div>
                  <div className="hint">{p.status === 'pending' ? 'Pending' : 'Accepted'}</div>
                </div>
                <span className="tag">{accessLabel(p.access)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
