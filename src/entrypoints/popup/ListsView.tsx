import { useState } from 'react';
import { type Config, type ConfigChange } from '../../core/config';
import { ACCESS_LABELS } from '../../core/types';
import { ChevronIcon, PlusIcon, UsersIcon } from '../../ui/icons';
import { ListBadge } from '../../ui/ListBadge';
import { ListForm } from '../../ui/ListForm';
import { byName, people, type Save } from './viewUtils';

export function ListsView({ config, save }: { config: Config; save: Save }) {
  const [adding, setAdding] = useState(false);
  const [saveError, setSaveError] = useState('');
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
        <details key={l.id} className="card list-card">
          <summary>
            <ListBadge list={l} />
            <span className="grow pick-text">
              <span className="pick-name truncate">{l.name}</span>
              <span className="meta">
                {people(l.emails.length)} · {ACCESS_LABELS[l.access]}
              </span>
            </span>
            <ChevronIcon size={16} />
          </summary>
          <div className="list-body">
            <ListForm config={config} save={save} list={l} />
          </div>
        </details>
      ))}
      {adding ? (
        <div className="card">
          <ListForm
            config={config}
            save={save}
            onSaved={() => setAdding(false)}
            onCancel={() => setAdding(false)}
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
