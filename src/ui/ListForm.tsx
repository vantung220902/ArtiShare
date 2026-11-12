import { type Ref, useEffect, useId, useImperativeHandle, useMemo, useRef, useState } from 'react';
import {
  type Config,
  type ConfigChange,
  createList,
  defaultListName,
  type EmailList,
  isNameTaken,
  sameList,
  uniqueListName,
} from '../core/config';
import { parseEmails } from '../core/emails';
import type { ListFormDraft } from '../core/popupState';
import type { AccessLevel } from '../core/types';
import { AccessSelect } from './AccessSelect';
import { useConfirm } from './useConfirm';
import { EmailInput } from './EmailInput';
import { RequiredMark } from './RequiredMark';

/** What a new-list form holds before it is saved: its valid addresses and permission. */
export interface ListDraft {
  emails: string[];
  access: AccessLevel;
}

/** Lets a parent save the form's draft, e.g. when the user moves on without clicking Save list. */
export interface ListFormHandle {
  /** Whether the user has typed a name or addresses. */
  hasDraft: () => boolean;
  /** Saves like the Save button. Resolves to null when validation or the save fails; the form shows why. */
  submit: () => Promise<{ list: EmailList; config: Config } | null>;
}

interface Props {
  ref?: Ref<ListFormHandle>;
  config: Config;
  save: (change: ConfigChange) => Promise<Config>;
  /** The list to edit. Without it, the form creates a new list. */
  list?: EmailList;
  onSaved?: (list: EmailList) => void;
  onCancel?: () => void;
  /** Reports the unsaved draft of a new list as it is typed, or null when the form is empty. */
  onDraftChange?: (draft: ListDraft | null) => void;
  /** What was typed before the popup last closed. Only read when the form mounts. */
  initial?: ListFormDraft | null;
  /**
   * Reports everything typed and not yet saved (null when nothing is), so it can be kept while
   * the popup is closed. Unlike `onDraftChange` it holds the text as typed, and covers edits.
   */
  onUnsavedChange?: (draft: ListFormDraft | null) => void;
}

/** Name, addresses and permission for one saved list. Used to create lists and to edit them. */
export function ListForm({
  ref,
  config,
  save,
  list,
  onSaved,
  onCancel,
  onDraftChange,
  initial,
  onUnsavedChange,
}: Props) {
  // A restored edit keeps the baseline it started from, so a change made elsewhere meanwhile
  // shows as a conflict instead of being silently overwritten.
  const restored = initial && !!initial.baseline === !!list ? initial : null;
  const [baseline, setBaseline] = useState<EmailList | null>(restored ? restored.baseline : (list ?? null));
  const [name, setName] = useState(restored?.name ?? list?.name ?? '');
  const [text, setText] = useState(restored?.text ?? list?.emails.join('\n') ?? '');
  const [access, setAccess] = useState<AccessLevel>(restored?.access ?? list?.access ?? 'view');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const { ask, dialog } = useConfirm();
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

  const hasDraft = !!name.trim() || !!text.trim();

  // A new list's draft, so the parent can count its people before it is saved.
  const draft = useMemo(
    () => (list || !hasDraft ? null : { emails: parseEmails(text).valid, access }),
    [list, hasDraft, text, access],
  );
  useEffect(() => onDraftChange?.(draft), [draft, onDraftChange]);

  // Typed and not saved. Name and permission count too: a new list's draft is more than its addresses.
  const unsaved = useMemo(
    () => (dirty ? { name, text, access, baseline } : null),
    [dirty, name, text, access, baseline],
  );
  useEffect(() => onUnsavedChange?.(unsaved), [unsaved, onUnsavedChange]);

  const fail = (message: string) => {
    setError(message);

    return null;
  };

  const submit = async () => {
    const { valid, invalid } = parseEmails(text);
    const named = name.trim();
    // An empty (or all-space) name is allowed: the list is named after its addresses, with a
    // number added if another list already has that name. Only a name typed by hand can clash.
    const trimmed = named || uniqueListName(config, defaultListName(valid), baseline?.id);
    if (conflict) return fail('This list changed in another window. Reload the saved version first.');
    if (isNameTaken(config, trimmed, baseline?.id)) return fail(`A list called "${trimmed}" already exists.`);
    if (invalid.length)
      return fail(
        `Fix or remove the invalid addresses: ${invalid.slice(0, 3).join(', ')}${invalid.length > 3 ? '…' : ''}`,
      );
    if (!valid.length) return fail('Add at least one email address.');

    const next = baseline
      ? { ...baseline, name: trimmed, emails: valid, access }
      : createList(trimmed, valid, access);
    setBusy(true);

    try {
      const saved = await save({ type: 'save-list', list: next, expected: baseline });

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

      return { list: next, config: saved };
    } catch (err) {
      return fail(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  useImperativeHandle(ref, () => ({ hasDraft: () => hasDraft, submit }));

  const remove = async () => {
    if (!baseline || conflict) return;
    setBusy(true);

    if (
      !(await ask({ title: `Delete the list "${baseline.name}"?`, confirmLabel: 'Delete', danger: true }))
    ) {
      setBusy(false);
      return;
    }

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
      {dialog}
      <label htmlFor={nameId}>List name (optional)</label>
      <input
        id={nameId}
        type="text"
        placeholder="List name, e.g. Acme clients"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <label htmlFor={emailId}>
        Email addresses
        <RequiredMark />
      </label>
      <EmailInput id={emailId} value={text} onChange={setText} rows={list ? 6 : 4} required />
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
