import { useCallback, useEffect, useRef, useState } from 'react';
import { type Config, type ConfigChange, type EmailList } from '../../core/config';
import {
  type ListFormDraft,
  type ListsDraft,
  reconcileListsDraft,
  sameListFormDraft,
} from '../../core/popupState';
import { ACCESS_LABELS } from '../../core/types';
import { patchPopupState } from '../../lib/storage';
import { ChevronIcon, PlusIcon, UsersIcon } from '../../ui/icons';
import { ListBadge } from '../../ui/ListBadge';
import { ListForm } from '../../ui/ListForm';
import { byName, people, type Save } from './viewUtils';

interface ListsViewProps {
  config: Config;
  save: Save;
  /** The tab's unsaved work from before the popup last closed. Only read when the tab mounts. */
  initial: ListsDraft;
  /** A list to expand, e.g. one just saved from People with access. */
  reveal?: { id: string } | null;
}

export function ListsView({ config, save, initial, reveal }: ListsViewProps) {
  const [adding, setAdding] = useState(initial.adding);
  const [newList, setNewList] = useState<ListFormDraft | null>(initial.newList);
  const [open, setOpen] = useState<string[]>(initial.open);
  const [edits, setEdits] = useState<Record<string, ListFormDraft>>(initial.edits);
  const [saveError, setSaveError] = useState('');

  // Keep the unsaved work across the popup closing. Skips the first run: nothing has changed yet.
  const firstRun = useRef(true);
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    const ids = config.lists.map((list) => list.id);
    void patchPopupState({ lists: reconcileListsDraft({ adding, newList, open, edits }, ids) });
  }, [adding, newList, open, edits, config.lists]);

  // Each form reports a draft whenever it changes; ignore the ones that say nothing new.
  const setEdit = useCallback((id: string, draft: ListFormDraft | null) => {
    setEdits((current) => {
      if (sameListFormDraft(current[id], draft)) return current;
      const { [id]: _replaced, ...rest } = current;

      return draft ? { ...rest, [id]: draft } : rest;
    });
  }, []);
  const setOpened = useCallback((id: string, isOpen: boolean) => {
    setOpen((current) =>
      current.includes(id) === isOpen ? current : isOpen ? [...current, id] : current.filter((x) => x !== id),
    );
  }, []);
  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect -- a request from another view; there is no event here to open it from
    if (reveal) setOpened(reveal.id, true);
  }, [reveal, setOpened]);
  const lists = byName(config.lists);
  const sel = config.defaultSelection;
  const change = (next: ConfigChange) =>
    void save(next).then(
      () => setSaveError(''),
      (err: Error) => setSaveError(err.message),
    );

  const toggleDefault = (id: string, on: boolean) => {
    change({ type: 'set-default-list', id, selected: on });
  };

  return (
    <div className="stack">
      <section className="card stack">
        <h2 className="title">Ticked by default when sharing</h2>
        <div className="choices">
          <label className="choice">
            <input
              type="radio"
              name="default-selection"
              checked={sel.mode === 'all'}
              onChange={() => change({ type: 'set-default-mode', mode: 'all' })}
            />
            All lists
          </label>
          <label className="choice">
            <input
              type="radio"
              name="default-selection"
              checked={sel.mode === 'some'}
              onChange={() => change({ type: 'set-default-mode', mode: 'some' })}
            />
            Only these
          </label>
          {sel.mode === 'some' &&
            (lists.length ? (
              <div className="choices nested">
                {lists.map((l) => (
                  <label key={l.id} className="choice">
                    <input
                      type="checkbox"
                      checked={sel.listIds.includes(l.id)}
                      onChange={(e) => toggleDefault(l.id, e.target.checked)}
                    />
                    <ListBadge list={l} small />
                    <span className="truncate">{l.name}</span>
                  </label>
                ))}
              </div>
            ) : (
              <span className="hint choices nested">No lists yet.</span>
            ))}
        </div>
      </section>

      {saveError && <p className="alert">{saveError}</p>}

      <div className="section-head">
        <h2 className="title">Your lists</h2>
        <p className="hint">
          Each list has its own permission. Someone in two ticked lists gets the higher one.
        </p>
      </div>

      {lists.length === 0 && !adding && (
        <div className="card empty">
          <span className="empty-icon">
            <UsersIcon size={20} />
          </span>
          <strong>Make your first list</strong>
          <span className="hint">
            Save a group of email addresses once and reuse it every time you share.
          </span>
        </div>
      )}
      {lists.map((l) => (
        <ListCard
          key={l.id}
          list={l}
          config={config}
          save={save}
          isOpen={open.includes(l.id)}
          initial={edits[l.id] ?? null}
          onOpenChange={setOpened}
          onUnsavedChange={setEdit}
        />
      ))}
      {adding ? (
        <div className="card">
          <ListForm
            config={config}
            save={save}
            initial={newList}
            onUnsavedChange={setNewList}
            onSaved={() => {
              setAdding(false);
              setNewList(null);
            }}
            onCancel={() => {
              setAdding(false);
              setNewList(null);
            }}
          />
        </div>
      ) : (
        <button className="dashed block" onClick={() => setAdding(true)}>
          <PlusIcon size={14} /> New list
        </button>
      )}
    </div>
  );
}

interface ListCardProps {
  list: EmailList;
  config: Config;
  save: Save;
  isOpen: boolean;
  initial: ListFormDraft | null;
  onOpenChange: (id: string, open: boolean) => void;
  onUnsavedChange: (id: string, draft: ListFormDraft | null) => void;
}

/** One saved list, expandable into its edit form. Its own component so each form gets a stable callback. */
function ListCard({ list, config, save, isOpen, initial, onOpenChange, onUnsavedChange }: ListCardProps) {
  const report = useCallback(
    (draft: ListFormDraft | null) => onUnsavedChange(list.id, draft),
    [list.id, onUnsavedChange],
  );

  return (
    <details
      className="card list-card"
      open={isOpen}
      onToggle={(e) => onOpenChange(list.id, e.currentTarget.open)}
    >
      <summary>
        <ListBadge list={list} />
        <span className="grow pick-text">
          <span className="pick-name truncate">{list.name}</span>
          <span className="meta">
            {people(list.emails.length)} · {ACCESS_LABELS[list.access]}
          </span>
        </span>
        <ChevronIcon size={16} />
      </summary>
      <div className="list-body">
        <ListForm config={config} save={save} list={list} initial={initial} onUnsavedChange={report} />
      </div>
    </details>
  );
}
