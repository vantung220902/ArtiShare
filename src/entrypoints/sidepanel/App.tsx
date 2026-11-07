import { useEffect, useMemo, useState } from 'react';
import type { Account } from '../../claude/shareClient';
import { parseArtifactList, parseArtifactRef } from '../../core/artifactUrl';
import { type Config, type DefaultSelection, defaultListIds, type EmailList, type Invitee, resolveInvites } from '../../core/config';
import { summarize } from '../../core/runner';
import { ACCESS_LABELS, type AccessLevel, type ArtifactRef } from '../../core/types';
import { type PreviewResult, send } from '../../lib/messages';
import type { RunState } from '../../lib/storage';
import { useConfig, useRun } from '../../ui/hooks';
import { BackIcon, ChevronIcon, LinkIcon, PlusIcon, SendIcon, UsersIcon } from '../../ui/icons';
import { ListBadge } from '../../ui/ListBadge';
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
      <header className="header">
        <div className="brand">
          <span className="logo">
            <SendIcon size={16} />
          </span>
          <h1 className="wordmark">ArtiShare</h1>
        </div>
        <AccountPill account={account} error={accountError} />
      </header>

      {accountError && (
        <p className="alert">
          {accountError}{' '}
          <button className="link" onClick={refreshAccount}>
            Retry
          </button>
        </p>
      )}

      <div className="segmented" role="tablist">
        <button role="tab" aria-selected={tab === 'share'} onClick={() => setTab('share')}>
          Share
        </button>
        <button role="tab" aria-selected={tab === 'lists'} onClick={() => setTab('lists')}>
          Lists <span className="count">{config.lists.length}</span>
        </button>
      </div>

      {/* Both tabs stay mounted so switching doesn't lose what you've typed. */}
      <div hidden={tab !== 'share'}>{run ? <RunView run={run} /> : <ShareView config={config} save={save} />}</div>
      <div hidden={tab !== 'lists'}>
        <ListsView config={config} save={save} />
      </div>

      <p className="footer">Version {chrome.runtime.getManifest().version}</p>
    </div>
  );
}

function AccountPill({ account, error }: { account: Account | null; error: string }) {
  if (account) {
    const who = account.orgName ? `${account.email} · ${account.orgName}` : account.email;
    return (
      <span className="account" title={`Signed in as ${who}`}>
        <span className="dot ok" />
        <span className="truncate">{account.email}</span>
      </span>
    );
  }
  return (
    <span className="account">
      <span className={error ? 'dot err' : 'dot'} />
      <span className="truncate">{error ? 'Not signed in' : 'Checking sign-in…'}</span>
    </span>
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
      <section className="card stack">
        <div className="row spread">
          <label htmlFor="artifacts" className="title">
            Artifacts {artifacts.refs.length > 0 && <span className="count">{artifacts.refs.length}</span>}
          </label>
          <button className="pill" onClick={addCurrentTab}>
            <PlusIcon size={13} /> Current tab
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
      </section>

      <section className="card stack">
        <h2 className="title">Share with</h2>
        {lists.length > 0 && (
          <div className="picks">
            {lists.map((l) => (
              <label key={l.id} className="pick">
                <ListBadge list={l} />
                <span className="grow pick-text">
                  <span className="pick-name truncate">{l.name}</span>
                  <span className="meta">
                    {people(l.emails.length)} · {ACCESS_LABELS[l.access]}
                  </span>
                </span>
                <input type="checkbox" checked={selected.includes(l.id)} onChange={(e) => toggle(l.id, e.target.checked)} />
              </label>
            ))}
          </div>
        )}
        {showForm ? (
          <div className="subcard">
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
          <button className="dashed" onClick={() => setCreating(true)}>
            <PlusIcon size={14} /> New list
          </button>
        )}
      </section>

      {error && <p className="alert">{error}</p>}
      <button className="primary block" onClick={runPreview} disabled={busy}>
        {busy ? 'Checking current access…' : `Preview ${people(invites.length)} × ${plural(artifacts.refs.length, 'artifact')}`}
      </button>
      <p className="hint center">Preview only reads who already has access. Nothing is sent until you confirm.</p>
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
        <button className="ghost" onClick={onBack}>
          <BackIcon size={14} /> Back
        </button>
        <span className="hint truncate">{draft.label}</span>
      </div>
      {results.map((r) => (
        <section key={r.artifact.id} className="card stack">
          <ArtifactLink url={r.artifact.url} />
          {r.error ? (
            <p className="alert">{r.error}</p>
          ) : (
            r.plan && (
              <>
                <div className="stats">
                  <div className="stat accent">
                    <strong>{r.plan.toInvite.length}</strong>
                    <span>to invite</span>
                  </div>
                  <div className="stat">
                    <strong>{r.plan.alreadyShared.length}</strong>
                    <span>already have access</span>
                  </div>
                </div>
                {r.plan.self.length > 0 && <p className="hint">Your own address is skipped.</p>}
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
        </section>
      ))}
      <p className="hint">
        claude.ai allows up to 50 people outside your organization per artifact. If an artifact reaches that, the rest of its
        invites are skipped.
      </p>
      {error && <p className="alert">{error}</p>}
      <button className="primary block" disabled={!total || starting} onClick={start}>
        {total ? (
          <>
            <SendIcon size={15} /> Send {plural(total, 'invitation')}
          </>
        ) : (
          'Nothing to send'
        )}
      </button>
    </div>
  );
}

function ArtifactLink({ url }: { url: string }) {
  return (
    <a href={url} target="_blank" rel="noreferrer" className="artifact-link">
      <LinkIcon size={14} />
      <span className="truncate">{url.replace('https://', '')}</span>
    </a>
  );
}

function EmailGroup({ title, emails }: { title: string; emails: string[] }) {
  if (!emails.length) return null;
  return (
    <details className="group">
      <summary>
        <ChevronIcon size={14} />
        {title}
        <span className="count">{emails.length}</span>
      </summary>
      <ul className="emails">
        {emails.map((e) => (
          <li key={e}>{e}</li>
        ))}
      </ul>
    </details>
  );
}

const RUN_STATUS_LABELS: Record<RunState['status'], string> = {
  running: 'Running',
  completed: 'Done',
  stopped: 'Stopped',
};

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
      <section className="card stack">
        <div className="row spread">
          <strong className="truncate grow">{run.label}</strong>
          <span className={`status ${run.status}`}>
            <span className="dot" />
            {RUN_STATUS_LABELS[run.status]}
          </span>
        </div>
        <div className={run.status === 'running' ? 'progress running' : 'progress'}>
          <div style={{ width: `${pct}%` }} />
        </div>
        <div className="row">
          <span className="chip ok">{s.invited} invited</span>
          {s.failed > 0 && <span className="chip err">{s.failed} failed</span>}
          {s.skipped > 0 && <span className="chip warn">{s.skipped} skipped</span>}
          {s.pending > 0 && <span className="chip">{s.pending} left</span>}
        </div>
        {run.reason && <p className="alert warn">{run.reason}</p>}
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
        {error && <p className="alert">{error}</p>}
      </section>

      {[...byArtifact.entries()].map(([url, items]) => (
        <section key={url} className="card stack">
          <ArtifactLink url={url} />
          <ul className="rows">
            {items.map((i) => (
              <li key={i.email}>
                <div className="grow">
                  <div className="email">{i.email}</div>
                  {i.error && <div className="hint">{i.error}</div>}
                </div>
                <span className={`tag ${i.status}`}>{i.status}</span>
              </li>
            ))}
          </ul>
        </section>
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
      <section className="card stack">
        <h2 className="title">Ticked by default when sharing</h2>
        <div className="choices">
          <label className="choice">
            <input type="radio" name="default-selection" checked={sel.mode === 'all'} onChange={() => setSelection({ mode: 'all' })} />
            All lists
          </label>
          <label className="choice">
            <input
              type="radio"
              name="default-selection"
              checked={sel.mode === 'some'}
              onChange={() => setSelection({ mode: 'some', listIds: defaultListIds(config) })}
            />
            Only these
          </label>
          {sel.mode === 'some' &&
            (lists.length ? (
              <div className="choices nested">
                {lists.map((l) => (
                  <label key={l.id} className="choice">
                    <input type="checkbox" checked={sel.listIds.includes(l.id)} onChange={(e) => toggleDefault(l.id, e.target.checked)} />
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

      <div className="section-head">
        <h2 className="title">Your lists</h2>
        <p className="hint">Each list has its own permission. Someone in two ticked lists gets the higher one.</p>
      </div>

      {lists.length === 0 && !adding && (
        <div className="card empty">
          <span className="empty-icon">
            <UsersIcon size={20} />
          </span>
          <strong>Make your first list</strong>
          <span className="hint">Save a group of email addresses once and reuse it every time you share.</span>
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
          <ListForm config={config} save={save} onSaved={() => setAdding(false)} onCancel={() => setAdding(false)} />
        </div>
      ) : (
        <button className="dashed block" onClick={() => setAdding(true)}>
          <PlusIcon size={14} /> New list
        </button>
      )}
    </div>
  );
}
