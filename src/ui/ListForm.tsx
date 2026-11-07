import { useEffect, useId, useRef, useState } from 'react';
import {
  type Config,
  type ConfigChange,
  createList,
  type EmailList,
  isNameTaken,
  sameList,
} from '../core/config';
import { parseEmails } from '../core/emails';
import type { AccessLevel } from '../core/types';
import { AccessSelect } from './AccessSelect';
import { EmailInput } from './EmailInput';

interface Props {
  config: Config;
  save: (change: ConfigChange) => Promise<Config>;
  /** The list to edit. Without it, the form creates a new list. */
  list?: EmailList;
  onSaved?: (list: EmailList) => void;
  onCancel?: () => void;
}

/** Name, addresses and permission for one saved list. Used to create lists and to edit them. */
export function ListForm({ config, save, list, onSaved, onCancel }: Props) {
  const [baseline, setBaseline] = useState<EmailList | null>(list ?? null);
  const [name, setName] = useState(list?.name ?? '');
  const [text, setText] = useState(list?.emails.join('\n') ?? '');
  const [access, setAccess] = useState<AccessLevel>(list?.access ?? 'view');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [awaitingSaved, setAwaitingSaved] = useState(false);
  const lastSeenList = useRef<EmailList | null>(list ?? null);
  const nameId = useId();
  const emailId = useId();
  const accessId = useId();

  const reset = () => {
    setAwaitingSaved(false);
    lastSeenList.current = list ?? null;
    setBaseline(list ?? null);
    setName(list?.name ?? '');
    setText(list?.emails.join('\n') ?? '');
    setAccess(list?.access ?? 'view');
    setError('');
  };

  const dirty =
    name !== (baseline?.name ?? '') ||
    text !== (baseline?.emails.join('\n') ?? '') ||
    access !== (baseline?.access ?? 'view');
  const conflict = !awaitingSaved && !!list && !!baseline && !sameList(list, baseline);

  // An external save updates an untouched form but never replaces a draft.
  // oxlint-disable react/set-state-in-effect -- synchronize the form with storage updates
  useEffect(() => {
    if (awaitingSaved) {
      if (list && baseline && sameList(list, baseline)) {
        lastSeenList.current = list;
        setAwaitingSaved(false);
      } else if (list && lastSeenList.current && !sameList(list, lastSeenList.current)) {
        // Another window changed the list before our saved value reached this panel.
        lastSeenList.current = list;
        setAwaitingSaved(false);
      }

      return;
    }

    lastSeenList.current = list ?? null;

    if (!dirty && list && (!baseline || !sameList(list, baseline))) {
      setBaseline(list);
      setName(list.name);
      setText(list.emails.join('\n'));
      setAccess(list.access);
    }
  }, [list, baseline, dirty, awaitingSaved]);
  // oxlint-enable react/set-state-in-effect

  const submit = async () => {
    const trimmed = name.trim();
    const { valid, invalid } = parseEmails(text);
    if (!trimmed) return setError('Give the list a name.');
    if (conflict) return setError('This list changed in another window. Reload the saved version first.');
    if (isNameTaken(config, trimmed, baseline?.id))
      return setError(`A list called "${trimmed}" already exists.`);
    if (invalid.length)
      return setError(
        `Fix or remove the invalid addresses: ${invalid.slice(0, 3).join(', ')}${invalid.length > 3 ? '…' : ''}`,
      );
    if (!valid.length) return setError('Add at least one email address.');

    const next = baseline
      ? { ...baseline, name: trimmed, emails: valid, access }
      : createList(trimmed, valid, access);
    setBusy(true);

    try {
      await save({ type: 'save-list', list: next, expected: baseline });

      if (!baseline) {
        setName('');
        setText('');
        setAccess('view');
      } else {
        setAwaitingSaved(true);
        setBaseline(next);
        setName(next.name);
        setText(next.emails.join('\n'));
        setAccess(next.access);
      }

      setError('');
      onSaved?.(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!baseline || conflict || !window.confirm(`Delete the list "${baseline.name}"?`)) return;
    setBusy(true);

    try {
      await save({ type: 'delete-list', id: baseline.id, expected: baseline });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack">
      <label htmlFor={nameId}>List name</label>
      <input
        id={nameId}
        type="text"
        placeholder="List name, e.g. Acme clients"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <label htmlFor={emailId}>Email addresses</label>
      <EmailInput id={emailId} value={text} onChange={setText} rows={list ? 6 : 4} />
      <div className="row nowrap">
        <label htmlFor={accessId} className="field-label">
          Permission
        </label>
        <div className="grow">
          <AccessSelect id={accessId} value={access} onChange={setAccess} />
        </div>
      </div>
      {error && <p className="alert">{error}</p>}
      {conflict && dirty && (
        <p className="alert warn">
          This list changed in another window. Your draft is intact. Reload the saved version before saving.
        </p>
      )}
      <div className="row">
        <button className="primary" disabled={busy || conflict || (!!list && !dirty)} onClick={submit}>
          {list ? 'Save' : 'Save list'}
        </button>
        {list ? (
          <>
            <button disabled={busy || (!dirty && !conflict)} onClick={reset}>
              {conflict ? 'Reload saved' : 'Revert'}
            </button>
            <button className="ghost danger push" disabled={busy || conflict} onClick={remove}>
              Delete
            </button>
          </>
        ) : (
          onCancel && (
            <button className="ghost" onClick={onCancel}>
              Cancel
            </button>
          )
        )}
      </div>
    </div>
  );
}
