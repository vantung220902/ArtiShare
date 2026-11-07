import { useEffect, useMemo, useState } from 'react';
import type { Account } from '../../claude/shareClient';
import { parseArtifactList, parseArtifactRef } from '../../core/artifactUrl';
import { type Config, type DefaultSelection, defaultListIds, type EmailList, type Invitee, resolveInvites } from '../../core/config';
import { summarize } from '../../core/runner';
import { ACCESS_LABELS, type AccessLevel, type ArtifactRef } from '../../core/types';
import { type PreviewResult, send } from '../../lib/messages';
import type { RunState } from '../../lib/storage';
import { useConfig, useRun } from '../../ui/hooks';
import { ListForm } from '../../ui/ListForm';

type Tab = 'share' | 'lists';
type Save = (next: Config) => Promise<void>;

export function App() {
  const [config, save] = useConfig();
  const run = useRun();
  const [tab, setTab] = useState<Tab>('share');
  const [account, setAccount] = useState<Account | null>(null);
  const [accountError, setAccountError] = useState('');

  const refreshAccount = () => {
    setAccountError('');
    send('whoami', {}).then(setAccount, (e: Error) => {
      setAccount(null);
      setAccountError(e.message);
    });
  };
  useEffect(refreshAccount, []);

  if (!config || run === undefined) return <div className="panel muted">Loading…</div>;

  return (
    <div className="panel">
      <h1 style={{ marginBottom: 4 }}>ArtiShare</h1>
      <p className="hint truncate">
        {account ? (
          <>
            Signed in as <strong>{account.email}</strong>
            {account.orgName ? ` · ${account.orgName}` : ''}
          </>
        ) : accountError ? (
          <span className="err">
            {accountError}{' '}
            <button className="link" onClick={refreshAccount}>
              Retry
            </button>
          </span>
        ) : (
          'Checking claude.ai sign-in…'
        )}
      </p>

      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'share'} onClick={() => setTab('share')}>
          Share
        </button>
        <button role="tab" aria-selected={tab === 'lists'} onClick={() => setTab('lists')}>
          Lists <span className="chip">{config.lists.length}</span>
        </button>
      </div>

      {/* Both tabs stay mounted so switching doesn't lose what you've typed. */}
      <div hidden={tab !== 'share'}>{run ? <RunView run={run} /> : <ShareView config={config} save={save} />}</div>
      <div hidden={tab !== 'lists'}>
        <ListsView config={config} save={save} />
      </div>

      <p className="hint" style={{ marginTop: 16 }}>
        Version {chrome.runtime.getManifest().version}
      </p>
    </div>
  );
}

const byName = (lists: readonly EmailList[]) => [...lists].sort((a, b) => a.name.localeCompare(b.name));
const people = (n: number) => `${n} ${n === 1 ? 'person' : 'people'}`;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** The artifact open in the active tab, if any. The claude.ai host permission exposes those tabs' URLs. */
async function currentTabArtifact(): Promise<ArtifactRef | null> {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return tab?.url ? parseArtifactRef(tab.url) : null;
}

interface Draft {
  label: string;
  artifacts: ArtifactRef[];
  invites: Invitee[];
}

function ShareView({ config, save }: { config: Config; save: Save }) {
  const [artifactText, setArtifactText] = useState('');
  const [selected, setSelected] = useState<string[]>(() => defaultListIds(config));
  const [creating, setCreating] = useState(false);
  const [preview, setPreview] = useState<{ draft: Draft; results: PreviewResult[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Start from the artifact you're looking at.
  useEffect(() => {
    void currentTabArtifact().then((ref) => ref && setArtifactText((text) => (text.trim() ? text : ref.url)));
  }, []);

  // Changing the default selection in the Lists tab re-applies it here.
  const defaultKey = JSON.stringify(config.defaultSelection);
  useEffect(() => setSelected(defaultListIds(config)), [defaultKey]);

  const lists = byName(config.lists);
  const artifacts = parseArtifactList(artifactText);
  const invites = useMemo(() => resolveInvites(config, selected), [config, selected]);
  const showForm = creating || lists.length === 0;

  const toggle = (id: string, on: boolean) => setSelected((ids) => (on ? [...ids, id] : ids.filter((x) => x !== id)));

  const addCurrentTab = async () => {
    const ref = await currentTabArtifact();
    if (!ref) return setError('The current tab is not a claude.ai artifact.');
    setError('');
    if (!artifacts.refs.some((r) => r.id === ref.id)) setArtifactText([artifactText.trim(), ref.url].filter(Boolean).join('\n'));
  };

  const runPreview = async () => {
    setError('');
    if (!artifacts.refs.length) return setError('Add at least one artifact.');
    if (artifacts.invalid.length) return setError(`Not artifact links: ${artifacts.invalid.join(', ')}`);
    if (!invites.length) return setError('Tick a list, or create one.');
    const label = lists
      .filter((l) => selected.includes(l.id))
      .map((l) => l.name)
      .join(', ');
    const draft: Draft = { label, artifacts: artifacts.refs, invites };
    setBusy(true);
    try {
      const results = await send('preview', { artifacts: draft.artifacts, invites: draft.invites });
      setPreview({ draft, results });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (preview) return <Preview {...preview} onBack={() => setPreview(null)} />;

  return (
    <div className="stack">
      <div className="card stack">
        <div className="row spread">
          <label htmlFor="artifacts">
            Artifacts <span className="hint">{artifacts.refs.length} found</span>
          </label>
          <button className="link" onClick={addCurrentTab}>
            + Current tab
          </button>
        </div>
        <textarea
          id="artifacts"
          rows={3}
          value={artifactText}
          onChange={(e) => setArtifactText(e.target.value)}
          placeholder="https://claude.ai/artifact/…  (one per line)"
          spellCheck={false}
        />
        {artifacts.invalid.length > 0 && <span className="hint err">Not artifact links: {artifacts.invalid.join(', ')}</span>}
      </div>

      <div className="card stack">
        <label>Share with</label>
        {lists.length > 0 && (
          <div className="choices">
            {lists.map((l) => (
              <label key={l.id}>
                <input type="checkbox" checked={selected.includes(l.id)} onChange={(e) => toggle(l.id, e.target.checked)} />
                <span className="grow">
                  {l.name}{' '}
                  <span className="hint">
                    {people(l.emails.length)} · {ACCESS_LABELS[l.access]}
                  </span>
                </span>
              </label>
            ))}
          </div>
        )}
        {showForm ? (
          <div className="card" style={{ margin: 0 }}>
            <ListForm
              config={config}
              save={save}
              onSaved={(list) => {
                setSelected((ids) => [...ids, list.id]);
                setCreating(false);
              }}
              onCancel={lists.length ? () => setCreating(false) : undefined}
            />
          </div>
        ) : (
          <div>
            <button className="link" onClick={() => setCreating(true)}>
              + New list
            </button>
          </div>
        )}
      </div>

      {error && <p className="err">{error}</p>}
      <button className="primary" onClick={runPreview} disabled={busy}>
        {busy ? 'Checking current access…' : `Preview ${people(invites.length)} × ${plural(artifacts.refs.length, 'artifact')}`}
      </button>
      <p className="hint">Preview only reads who already has access. Nothing is sent until you confirm.</p>
    </div>
  );
}

function Preview({ draft, results, onBack }: { draft: Draft; results: PreviewResult[]; onBack: () => void }) {
  const [error, setError] = useState('');
  const [starting, setStarting] = useState(false);
  const plans = results.flatMap((r) => (r.plan ? [r.plan] : []));
  const total = plans.reduce((n, p) => n + p.toInvite.length, 0);

  const start = async () => {
    const ok = window.confirm(
      `Send ${plural(total, 'invitation')} across ${plural(plans.length, 'artifact')}?\n\n` +
        'People outside your organization will get an email from Claude.',
    );
    if (!ok) return;
    setStarting(true);
    try {
      await send('start', { label: draft.label, plans });
    } catch (e) {
      setError((e as Error).message);
      setStarting(false);
    }
  };

  return (
    <div className="stack">
      <div className="row spread">
        <button className="link" onClick={onBack}>
          ← Back
        </button>
        <span className="hint truncate">{draft.label}</span>
      </div>
      {results.map((r) => (
        <div key={r.artifact.id} className="card stack">
          <a href={r.artifact.url} target="_blank" rel="noreferrer" className="truncate">
            {r.artifact.url.replace('https://', '')}
          </a>
          {r.error ? (
            <p className="err">{r.error}</p>
          ) : (
            r.plan && (
              <>
                <div className="row">
                  <span className="chip ok">{r.plan.toInvite.length} to invite</span>
                  <span className="chip">{r.plan.alreadyShared.length} already shared</span>
                  {r.plan.self.length > 0 && <span className="chip">you</span>}
                </div>
                <EmailGroup title="Will be invited" emails={r.plan.toInvite.map((i) => `${i.email} · ${ACCESS_LABELS[i.access]}`)} />
                <EmailGroup
                  title="Already have access (left unchanged)"
                  emails={r.plan.alreadyShared.map(
                    (s) =>
                      `${s.email} · ${s.access in ACCESS_LABELS ? ACCESS_LABELS[s.access as AccessLevel] : s.access}${
                        s.status === 'pending' ? ' (pending)' : ''
                      }`,
                  )}
                />
              </>
            )
          )}
        </div>
      ))}
      <p className="hint">
        claude.ai allows up to 50 people outside your organization per artifact. If an artifact reaches that, the rest of its
        invites are skipped.
      </p>
      {error && <p className="err">{error}</p>}
      <button className="primary" disabled={!total || starting} onClick={start}>
        {total ? `Send ${plural(total, 'invitation')}` : 'Nothing to send'}
      </button>
    </div>
  );
}

function EmailGroup({ title, emails }: { title: string; emails: string[] }) {
  if (!emails.length) return null;
  return (
    <details>
      <summary className="hint">
        {title} ({emails.length})
      </summary>
      <ul style={{ margin: '4px 0 0', paddingLeft: 18, fontSize: 12 }}>
        {emails.map((e) => (
          <li key={e} className="email">
            {e}
          </li>
        ))}
      </ul>
    </details>
  );
}

function RunView({ run }: { run: RunState }) {
  const [error, setError] = useState('');
  const s = summarize(run.items, run.reason);
  const done = run.items.length - s.pending;
  const pct = run.items.length ? Math.round((done / run.items.length) * 100) : 100;
  const act = (type: 'stop' | 'resume' | 'clear') => send(type, {}).then(() => setError(''), (e: Error) => setError(e.message));

  const byArtifact = new Map<string, RunState['items']>();
  for (const item of run.items) {
    const list = byArtifact.get(item.artifact.url) ?? [];
    list.push(item);
    byArtifact.set(item.artifact.url, list);
  }

  return (
    <div className="stack">
      <div className="card stack">
        <div className="row spread">
          <strong className="truncate grow">{run.label}</strong>
          <span className={run.status === 'completed' ? 'ok' : run.status === 'running' ? 'muted' : 'warn'}>
            {run.status === 'running' ? 'Running…' : run.status === 'completed' ? 'Done' : 'Stopped'}
          </span>
        </div>
        <div className="progress">
          <div style={{ width: `${pct}%` }} />
        </div>
        <div className="row">
          <span className="chip ok">{s.invited} invited</span>
          {s.failed > 0 && <span className="chip err">{s.failed} failed</span>}
          {s.skipped > 0 && <span className="chip warn">{s.skipped} skipped</span>}
          {s.pending > 0 && <span className="chip">{s.pending} left</span>}
        </div>
        {run.reason && <p className="warn">{run.reason}</p>}
        <div className="row">
          {run.status === 'running' && <button onClick={() => act('stop')}>Stop</button>}
          {run.status === 'stopped' && s.pending > 0 && (
            <button className="primary" onClick={() => act('resume')}>
              Resume
            </button>
          )}
          {run.status !== 'running' && (
            <button
              onClick={() => {
                if (s.pending === 0 || window.confirm('Discard this run? The remaining invites will not be sent.')) void act('clear');
              }}
            >
              New share
            </button>
          )}
        </div>
        {error && <p className="err">{error}</p>}
      </div>

      {[...byArtifact.entries()].map(([url, items]) => (
        <div key={url} className="card">
          <a href={url} target="_blank" rel="noreferrer" className="truncate" style={{ display: 'block', marginBottom: 6 }}>
            {url.replace('https://', '')}
          </a>
          <table>
            <tbody>
              {items.map((i) => (
                <tr key={i.email}>
                  <td className="email">{i.email}</td>
                  <td>
                    <span className={i.status === 'invited' ? 'ok' : i.status === 'failed' ? 'err' : i.status === 'skipped' ? 'warn' : 'muted'}>
                      {i.status}
                    </span>
                    {i.error && <div className="hint">{i.error}</div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

function ListsView({ config, save }: { config: Config; save: Save }) {
  const [adding, setAdding] = useState(false);
  const lists = byName(config.lists);
  const sel = config.defaultSelection;
  const setSelection = (next: DefaultSelection) => void save({ ...config, defaultSelection: next });
  const toggleDefault = (id: string, on: boolean) => {
    if (sel.mode !== 'some') return;
    setSelection({ mode: 'some', listIds: on ? [...sel.listIds, id] : sel.listIds.filter((x) => x !== id) });
  };

  return (
    <div className="stack">
      <div className="card stack">
        <label>Ticked by default when sharing</label>
        <div className="choices">
          <label>
            <input type="radio" name="default-selection" checked={sel.mode === 'all'} onChange={() => setSelection({ mode: 'all' })} />
            All lists
          </label>
          <label>
            <input
              type="radio"
              name="default-selection"
              checked={sel.mode === 'some'}
              onChange={() => setSelection({ mode: 'some', listIds: defaultListIds(config) })}
            />
            Only these:
          </label>
          {sel.mode === 'some' &&
            (lists.length ? (
              <div className="choices" style={{ paddingLeft: 22 }}>
                {lists.map((l) => (
                  <label key={l.id}>
                    <input type="checkbox" checked={sel.listIds.includes(l.id)} onChange={(e) => toggleDefault(l.id, e.target.checked)} />
                    {l.name}
                  </label>
                ))}
              </div>
            ) : (
              <span className="hint" style={{ paddingLeft: 22 }}>
                No lists yet.
              </span>
            ))}
        </div>
      </div>

      <div className="card stack">
        <h2>Lists</h2>
        <p className="hint">Each list has its own permission. Someone in two ticked lists gets the higher one.</p>
        {lists.length === 0 && !adding && <p className="muted">No lists yet.</p>}
        {lists.map((l) => (
          <details key={l.id} className="card" style={{ margin: 0 }}>
            <summary>
              <strong>{l.name}</strong>{' '}
              <span className="hint">
                {people(l.emails.length)} · {ACCESS_LABELS[l.access]}
              </span>
            </summary>
            <div style={{ marginTop: 8 }}>
              <ListForm config={config} save={save} list={l} />
            </div>
          </details>
        ))}
        {adding ? (
          <div className="card" style={{ margin: 0 }}>
            <ListForm config={config} save={save} onSaved={() => setAdding(false)} onCancel={() => setAdding(false)} />
          </div>
        ) : (
          <div>
            <button onClick={() => setAdding(true)}>New list</button>
          </div>
        )}
      </div>
    </div>
  );
}
