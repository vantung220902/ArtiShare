import { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  type Config,
  createList,
  defaultListName,
  type EmailList,
  isNameTaken,
  uniqueListName,
} from '../../core/config';
import { mergeEmails } from '../../core/emails';
import { sharedAccess } from '../../core/membership';
import { ACCESS_LABELS, type AccessLevel, type Sharee } from '../../core/types';
import { AccessSelect } from '../../ui/AccessSelect';
import { byName, people as peopleCount, plural, type Save } from './viewUtils';

/** What someone can do on the artifact, as the Manage access rows say it. */
const accessLabel = (access: Sharee['access']) =>
  access in ACCESS_LABELS ? ACCESS_LABELS[access as AccessLevel] : 'Unknown';

/**
 * Saves people who are invited to an artifact but in none of the lists. It takes the place of
 * People with access, and what the people can do on the artifact is never touched.
 */
export function SaveToListView({
  unlisted,
  config,
  save,
  onSaved,
  onCancel,
}: {
  /** Everyone offered, in the order they are shown. */
  unlisted: readonly Sharee[];
  config: Config;
  save: Save;
  /** `added` is true when the people went into a list that already existed. */
  onSaved: (list: EmailList, count: number, added: boolean) => void;
  onCancel: () => void;
}) {
  // Kept as what was unticked, so someone who leaves `unlisted` while this is open just drops out.
  const [unticked, setUnticked] = useState<ReadonlySet<string>>(new Set());
  // Until the user picks one, the permission follows who is ticked.
  const [chosenAccess, setChosenAccess] = useState<AccessLevel | null>(null);
  const [mode, setMode] = useState<'new' | 'existing'>('new');
  const [listId, setListId] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const nameId = useId();
  const modeName = useId();
  const listSelectId = useId();
  const accessId = useId();

  // The view replaces what was on screen, so focus goes to what it is called.
  useEffect(() => heading.current?.focus(), []);

  // Alphabetical, like the lists' own addresses read; the same address twice is one person.
  const everyone = useMemo(() => {
    const seen = new Set<string>();

    return unlisted
      .filter((p) => !seen.has(p.email.trim().toLowerCase()) && !!seen.add(p.email.trim().toLowerCase()))
      .toSorted((a, b) => a.email.localeCompare(b.email));
  }, [unlisted]);
  const key = (p: Sharee) => p.email.trim().toLowerCase();
  const chosen = everyone.filter((p) => !unticked.has(key(p)));
  const emails = mergeEmails(chosen.map((p) => p.email));
  const access = chosenAccess ?? sharedAccess(chosen);
  const placeholder = defaultListName(emails);
  const lists = useMemo(() => byName(config.lists), [config.lists]);
  // Adding needs a list to add to; with none saved the choice isn't offered at all.
  const adding = mode === 'existing' && lists.length > 0;
  const target = lists.find((l) => l.id === listId) ?? lists[0];

  const toggle = (p: Sharee, on: boolean) =>
    setUnticked((current) => {
      const next = new Set(current);
      if (on) next.delete(key(p));
      else next.add(key(p));

      return next;
    });

  const submit = async () => {
    if (busy || !emails.length) return;
    if (adding && target) {
      setBusy(true);
      setError('');
      try {
        // The addresses go after the ones already there, and `expected` makes a list edited
        // elsewhere in the meantime fail instead of being overwritten.
        const next = { ...target, emails: mergeEmails(target.emails, emails) };
        await save({ type: 'save-list', list: next, expected: target });
        onSaved(next, emails.length, true);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setBusy(false);
      }

      return;
    }

    const typed = name.trim();
    const listName = typed || uniqueListName(config, placeholder);
    if (isNameTaken(config, listName)) {
      setError(`A list called "${listName}" already exists.`);
      return;
    }

    const list = createList(listName, emails, access);
    setBusy(true);
    setError('');
    try {
      await save({ type: 'save-list', list, expected: null });
      onSaved(list, emails.length, false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  };

  return (
    <section className="card stack">
      <h2 className="title" ref={heading} tabIndex={-1}>
        Save to a list
      </h2>
      <label className="choice">
        <input
          type="checkbox"
          checked={chosen.length === everyone.length}
          ref={(box) => {
            if (box) box.indeterminate = chosen.length > 0 && chosen.length < everyone.length;
          }}
          onChange={(e) => setUnticked(e.target.checked ? new Set() : new Set(everyone.map(key)))}
        />
        Select all
      </label>
      <div className="choices">
        {everyone.map((p) => (
          <label key={key(p)} className="choice">
            <input
              type="checkbox"
              checked={!unticked.has(key(p))}
              onChange={(e) => toggle(p, e.target.checked)}
            />
            <span className="truncate" title={p.email}>
              {p.email} · {accessLabel(p.access)}
            </span>
          </label>
        ))}
      </div>
      <p className="hint">
        {chosen.length} of {everyone.length} selected
      </p>
      {lists.length > 0 && (
        <div className="choices">
          <label className="choice">
            <input type="radio" name={modeName} checked={!adding} onChange={() => setMode('new')} />
            New list
          </label>
          <label className="choice">
            <input type="radio" name={modeName} checked={adding} onChange={() => setMode('existing')} />
            Add to an existing list
          </label>
        </div>
      )}
      {adding && target ? (
        <>
          <label htmlFor={listSelectId}>List</label>
          <select id={listSelectId} value={target.id} onChange={(e) => setListId(e.target.value)}>
            {lists.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name} ({plural(l.emails.length, 'address')})
              </option>
            ))}
          </select>
          <p className="hint">
            They&apos;ll get {target.name}&apos;s permission ({ACCESS_LABELS[target.access]}) when you share
            with {target.name}. Their access to this artifact doesn&apos;t change.
          </p>
        </>
      ) : (
        <>
          <label htmlFor={nameId}>Name</label>
          <input
            id={nameId}
            type="text"
            placeholder={placeholder}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <div className="row nowrap">
            <label htmlFor={accessId} className="field-label">
              Permission
            </label>
            <div className="grow">
              <AccessSelect id={accessId} value={access} onChange={setChosenAccess} />
            </div>
          </div>
        </>
      )}
      {error && <p className="alert">{error}</p>}
      <div className="row">
        <button className="primary" disabled={busy || !emails.length} onClick={submit}>
          {busy
            ? 'Saving…'
            : adding && target
              ? `Add ${peopleCount(emails.length)} to ${target.name}`
              : `Save ${peopleCount(emails.length)}`}
        </button>
        <button className="ghost" disabled={busy} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </section>
  );
}
