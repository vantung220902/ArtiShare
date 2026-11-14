import { useEffect, useMemo, useRef, useState } from 'react';
import { inboxKey } from '../../core/emails';
import { listNamesByInbox, membershipNote, unlistedNote } from '../../core/membership';
import { useConfig } from '../../ui/hooks';
import {
  ACCESS_LABELS,
  ACCESS_LEVELS,
  type AccessLevel,
  type ArtifactRef,
  type Sharee,
} from '../../core/types';
import { send } from '../../lib/messages';
import type { RunState } from '../../lib/storage';
import { AccessSelect } from '../../ui/AccessSelect';
import { BackIcon } from '../../ui/icons';
import { useConfirm } from '../../ui/useConfirm';
import { SaveToListView } from './SaveToListView';
import { ArtifactLink } from './viewComponents';
import { byName, people as peopleCount } from './viewUtils';

/** The label for what someone can do; claude.ai may send a role this extension doesn't know. */
const accessLabel = (access: Sharee['access']) =>
  access in ACCESS_LABELS ? ACCESS_LABELS[access as keyof typeof ACCESS_LABELS] : 'Unknown';

/** How long 'Saved' stays beside a row. */
const SAVED_MS = 2_500;

/** One invitee: their permission can be changed, and the row says whether that worked. */
function PersonRow({
  artifact,
  person,
  listNames,
  onChanged,
  onRemoved,
}: {
  artifact: ArtifactRef;
  person: Sharee;
  /** The saved lists holding this person, or null while the lists haven't loaded. */
  listNames: readonly string[] | null;

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
  // A second click can arrive before React has re-rendered the disabled controls, so `busy` may
  // still read false; this is set synchronously and makes it one request per action.
  const inFlight = useRef(false);

  const change = (access: AccessLevel) => {
    if (inFlight.current || !person.id || access === person.access) return;
    inFlight.current = true;
    window.clearTimeout(timer.current);
    setSaved(false);
    setError('');
    setSaving(access);
    send('change-access', { artifact, inviteId: person.id, access }).then(
      () => {
        inFlight.current = false;
        onChanged(person.id!, access);
        setSaving(null);
        setSaved(true);
        timer.current = window.setTimeout(() => setSaved(false), SAVED_MS);
      },
      (e: Error) => {
        inFlight.current = false;
        setSaving(null);
        setError(e.message);
      },
    );
  };

  const remove = async () => {
    if (inFlight.current || !person.id) return;
    const ok = await ask({
      title: `Remove ${person.email} from this artifact?`,
      detail: 'Their invitation will stop working.',
      confirmLabel: 'Remove',
      danger: true,
    });
    // A second ask answers the first as cancelled, so two confirmations can't both be true; but a
    // change started while the question was open may still be running.
    if (!ok || inFlight.current) return;

    inFlight.current = true;
    window.clearTimeout(timer.current);
    setSaved(false);
    setError('');
    setRemoving(true);
    send('remove-invite', { artifact, inviteId: person.id }).then(
      () => onRemoved(person.id!),
      (e: Error) => {
        inFlight.current = false;
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
        <div className="hint">
          {person.status === 'pending' ? 'Pending' : 'Accepted'}
          {listNames && (
            <>
              {' · '}
              {/* Every name, for when the note had to cut them short. */}
              <span title={listNames.join(', ') || undefined}>{membershipNote(listNames)}</span>
            </>
          )}
        </div>
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
export function ManageView({
  artifact,
  run,
  onBack,
  onOpenList,
}: {
  artifact: ArtifactRef;
  /** The current run, if any: while it sends to this artifact the list on screen is already out of date. */
  run: RunState | null;
  onBack: () => void;
  /** Opens the Lists tab with this list expanded. */
  onOpenList: (listId: string) => void;
}) {
  // null until the first read succeeds.
  const [people, setPeople] = useState<Sharee[] | null>(null);
  const [error, setError] = useState('');
  const [reading, setReading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const backRef = useRef<HTMLButtonElement>(null);
  // Read from the live config, not a copy, so a list saved in another window shows up at once.
  const [config, save] = useConfig();
  // Save to a list replaces People with access in place; `saved` is what it reports on coming back.
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<{ message: string; listId: string } | null>(null);
  const saveButtonRef = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef(false);
  // Names follow the order the Lists tab shows (by name), so the two screens agree.
  const listsByInbox = useMemo(() => config && listNamesByInbox(byName(config.lists)), [config]);

  // Opening replaces what was on screen, so focus goes to the way back instead of being left on nothing.
  useEffect(() => backRef.current?.focus(), []);

  useEffect(() => {
    let stale = false;
    // oxlint-disable-next-line react/set-state-in-effect -- a retry or refresh asks again; `people` is kept so a refresh doesn't blank the list
    setReading(true);
    setError('');

    send('sharees', { artifact }).then(
      (found) => {
        if (stale) return;
        // The owner is always shown first, from what we know, so claude.ai's own entry for them is dropped.
        setPeople(found.filter((p) => p.access !== 'owner'));
        setReading(false);
      },
      (e: Error) => {
        if (stale) return;
        setError(e.message);
        setReading(false);
      },
    );

    return () => {
      stale = true;
    };
  }, [artifact, attempt]);

  // Who is invited but in none of the lists; nobody is counted until the lists have loaded.
  const unlisted = useMemo(
    () => (listsByInbox && people ? people.filter((p) => !listsByInbox.has(inboxKey(p.email))) : []),
    [listsByInbox, people],
  );

  // Back on People with access after Cancel, focus returns to the button that opened the view.
  useEffect(() => {
    if (!saving && returnFocus.current) {
      returnFocus.current = false;
      saveButtonRef.current?.focus();
    }
  }, [saving]);

  // Everyone offered was saved in another window while this was open: nothing is left to save, so
  // the view closes (focus goes to Back, since the button that opened it is gone too).
  useEffect(() => {
    if (saving && config && unlisted.length === 0) {
      // oxlint-disable-next-line react/set-state-in-effect -- reacts to the lists changing elsewhere
      setSaving(false);
      backRef.current?.focus();
    }
  }, [saving, config, unlisted]);

  const sending =
    run?.status === 'running' &&
    run.items.some((item) => item.status === 'pending' && item.artifact.id === artifact.id);

  return (
    <div className="stack">
      <div className="row spread">
        <button ref={backRef} className="ghost" onClick={onBack}>
          <BackIcon size={14} /> Back
        </button>
        {people && (
          <button className="ghost" disabled={reading} onClick={() => setAttempt((n) => n + 1)}>
            {reading ? 'Refreshing…' : 'Refresh'}
          </button>
        )}
      </div>
      {saving && config && unlisted.length > 0 ? (
        <SaveToListView
          unlisted={unlisted}
          config={config}
          save={save}
          onCancel={() => {
            returnFocus.current = true;
            setSaving(false);
          }}
          onSaved={(list, count, added) => {
            setSaved({
              message: `${added ? 'Added' : 'Saved'} ${peopleCount(count)} to ${list.name}.`,
              listId: list.id,
            });
            setSaving(false);
          }}
        />
      ) : (
        <section className="card stack">
          <h2 className="title">People with access</h2>
          <ArtifactLink url={artifact.url} />
          {saved && (
            <output className="alert ok">
              {saved.message}{' '}
              <button className="link" onClick={() => onOpenList(saved.listId)}>
                Open list
              </button>
            </output>
          )}
          {sending && (
            <output className="hint">
              A share is in progress for this artifact. Refresh shows the latest.
            </output>
          )}
          {people === null ? (
            error ? (
              <p className="alert">
                {error}{' '}
                <button className="link" onClick={() => setAttempt((n) => n + 1)}>
                  Retry
                </button>
              </p>
            ) : (
              <output className="hint">Loading people…</output>
            )
          ) : (
            <>
              {/* The list stays when a refresh fails, so the last good copy isn't lost. */}
              {error && <p className="alert">Could not refresh: {error}</p>}
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
                    listNames={listsByInbox && (listsByInbox.get(inboxKey(p.email)) ?? [])}
                    onChanged={(id, access) =>
                      setPeople((all) => all && all.map((x) => (x.id === id ? { ...x, access } : x)))
                    }
                    onRemoved={(id) => setPeople((all) => all && all.filter((x) => x.id !== id))}
                  />
                ))}
              </ul>
              {unlisted.length > 0 && (
                // A quiet line, not a warning: being in no list is normal, so no alert role or red.
                <div className="row spread">
                  <p className="hint grow">{unlistedNote(unlisted.length)}</p>
                  <button
                    ref={saveButtonRef}
                    onClick={() => {
                      setSaved(null);
                      setSaving(true);
                    }}
                  >
                    Save to a list
                  </button>
                </div>
              )}
              {people.length === 0 && (
                <div className="stack">
                  <p>Only you have access.</p>
                  <p className="hint">Nobody is invited yet. Use Share to invite people.</p>
                </div>
              )}
            </>
          )}
        </section>
      )}
    </div>
  );
}
