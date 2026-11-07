import { useEffect, useId, useState } from 'react';
import { type Config, createList, type EmailList, isNameTaken, removeList, upsertList } from '../core/config';
import { parseEmails } from '../core/emails';
import type { AccessLevel } from '../core/types';
import { AccessSelect } from './AccessSelect';
import { EmailInput } from './EmailInput';

interface Props {
  config: Config;
  save: (next: Config) => Promise<void>;
  /** The list to edit. Without it, the form creates a new list. */
  list?: EmailList;
  onSaved?: (list: EmailList) => void;
  onCancel?: () => void;
}

/** Name, addresses and permission for one saved list. Used to create lists and to edit them. */
export function ListForm({ config, save, list, onSaved, onCancel }: Props) {
  const storedName = list?.name ?? '';
  const storedText = list?.emails.join('\n') ?? '';
  const storedAccess: AccessLevel = list?.access ?? 'view';
  const [name, setName] = useState(storedName);
  const [text, setText] = useState(storedText);
  const [access, setAccess] = useState(storedAccess);
  const [error, setError] = useState('');
  const accessId = useId();

  const reset = () => {
    setName(storedName);
    setText(storedText);
    setAccess(storedAccess);
    setError('');
  };
  // Follow saves made elsewhere (the other tab, or another window).
  useEffect(reset, [storedName, storedText, storedAccess]);

  const dirty = name !== storedName || text !== storedText || access !== storedAccess;

  const submit = async () => {
    const trimmed = name.trim();
    const { valid, invalid } = parseEmails(text);
    if (!trimmed) return setError('Give the list a name.');
    if (isNameTaken(config, trimmed, list?.id)) return setError(`A list called "${trimmed}" already exists.`);
    if (invalid.length) return setError(`Fix or remove the invalid addresses: ${invalid.slice(0, 3).join(', ')}${invalid.length > 3 ? '…' : ''}`);
    if (!valid.length) return setError('Add at least one email address.');

    const next = list ? { ...list, name: trimmed, emails: valid, access } : createList(trimmed, valid, access);
    await save(upsertList(config, next));
    if (!list) {
      setName('');
      setText('');
      setAccess('view');
    }
    setError('');
    onSaved?.(next);
  };

  const remove = async () => {
    if (!list || !window.confirm(`Delete the list "${list.name}"?`)) return;
    await save(removeList(config, list.id));
  };

  return (
    <div className="stack">
      <input type="text" placeholder="List name, e.g. Acme clients" value={name} onChange={(e) => setName(e.target.value)} />
      <EmailInput value={text} onChange={setText} rows={list ? 6 : 4} />
      <div className="row nowrap">
        <label htmlFor={accessId} className="field-label">
          Permission
        </label>
        <div className="grow">
          <AccessSelect id={accessId} value={access} onChange={setAccess} />
        </div>
      </div>
      {error && <p className="alert">{error}</p>}
      <div className="row">
        <button className="primary" disabled={!!list && !dirty} onClick={submit}>
          {list ? 'Save' : 'Save list'}
        </button>
        {list ? (
          <>
            <button disabled={!dirty} onClick={reset}>
              Revert
            </button>
            <button className="ghost danger push" onClick={remove}>
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
