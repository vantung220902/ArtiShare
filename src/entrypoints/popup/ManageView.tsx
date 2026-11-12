import { useEffect, useRef, useState } from 'react';
import {
  ACCESS_LABELS,
  ACCESS_LEVELS,
  type AccessLevel,
  type ArtifactRef,
  type Sharee,
} from '../../core/types';
import { send } from '../../lib/messages';
import { AccessSelect } from '../../ui/AccessSelect';
import { BackIcon } from '../../ui/icons';
import { useConfirm } from '../../ui/useConfirm';
import { ArtifactLink } from './viewComponents';

/** The label for what someone can do; claude.ai may send a role this extension doesn't know. */
const accessLabel = (access: Sharee['access']) =>
  access in ACCESS_LABELS ? ACCESS_LABELS[access as keyof typeof ACCESS_LABELS] : 'Unknown';

/** How long 'Saved' stays beside a row. */
const SAVED_MS = 2_500;

/** One invitee: their permission can be changed, and the row says whether that worked. */
function PersonRow({
  artifact,
  person,
  onChanged,
  onRemoved,
}: {
  artifact: ArtifactRef;
  person: Sharee;
  onChanged: (id: string, access: AccessLevel) => void;
  onRemoved: (id: string) => void;
}) {
  // The value being saved, or null when idle. While it is set the select shows it; if the save
  // fails it clears and the select falls back to the permission claude.ai still has.
  const [saving, setSaving] = useState<AccessLevel | null>(null);
  const [saved, setSaved] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState('');
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const { ask, dialog } = useConfirm();
  const busy = saving !== null || removing;

  const change = (access: AccessLevel) => {
    if (busy || !person.id || access === person.access) return;
    window.clearTimeout(timer.current);
    setSaved(false);
    setError('');
    setSaving(access);
    send('change-access', { artifact, inviteId: person.id, access }).then(
      () => {
        onChanged(person.id!, access);
        setSaving(null);
        setSaved(true);
        timer.current = window.setTimeout(() => setSaved(false), SAVED_MS);
      },
      (e: Error) => {
        setSaving(null);
        setError(e.message);
      },
    );
  };

  const remove = async () => {
    if (busy || !person.id) return;
    const ok = await ask({
      title: `Remove ${person.email} from this artifact?`,
      detail: 'Their invitation will stop working.',
      confirmLabel: 'Remove',
      danger: true,
    });
    if (!ok) return;

    window.clearTimeout(timer.current);
    setSaved(false);
    setError('');
    setRemoving(true);
    send('remove-invite', { artifact, inviteId: person.id }).then(
      () => onRemoved(person.id!),
      (e: Error) => {
        setRemoving(false);
        setError(e.message);
      },
    );
  };

  const editable = person.id !== undefined && (ACCESS_LEVELS as readonly string[]).includes(person.access);

  return (
    <li>
      <div className="grow">
        <div className="email">{person.email}</div>
        <div className="hint">{person.status === 'pending' ? 'Pending' : 'Accepted'}</div>
        {error && (
          <div className="alert" role="alert">
            {error}
          </div>
        )}
      </div>
      {saved && <output className="saved">Saved</output>}
      {editable ? (
        <AccessSelect
          label={`Permission for ${person.email}`}
          value={saving ?? (person.access as AccessLevel)}
          disabled={busy}
          onChange={change}
        />
      ) : (
        <span className="tag">{accessLabel(person.access)}</span>
      )}
      {person.id !== undefined && (
        <button className="danger" disabled={busy} aria-label={`Remove ${person.email}`} onClick={remove}>
          {removing ? 'Removing…' : 'Remove'}
        </button>
      )}
      {dialog}
    </li>
  );
}

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
              <PersonRow
                key={p.id ?? p.email}
                artifact={artifact}
                person={p}
                onChanged={(id, access) =>
                  setPeople((all) => all && all.map((x) => (x.id === id ? { ...x, access } : x)))
                }
                onRemoved={(id) => setPeople((all) => all && all.filter((x) => x.id !== id))}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
