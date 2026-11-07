import { useEffect, useMemo, useState } from 'react';
import type { Account } from '../../claude/shareClient';
import { parseArtifactList, parseArtifactRef } from '../../core/artifactUrl';
import { type Config, listEmails, resolveJob } from '../../core/config';
import { runReportCsv } from '../../core/csv';
import { mergeEmails, parseEmails } from '../../core/emails';
import { summarize } from '../../core/runner';
import { ACCESS_LABELS, type AccessLevel, type ArtifactRef } from '../../core/types';
import { type PreviewResult, send } from '../../lib/messages';
import type { RunState } from '../../lib/storage';
import { AccessSelect } from '../../ui/AccessSelect';
import { EmailInput } from '../../ui/EmailInput';
import { download, useConfig, useRun } from '../../ui/hooks';

const AD_HOC = '';

export function App() {
  const [config] = useConfig();
  const run = useRun();
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
      <div className="row spread" style={{ marginBottom: 10 }}>
        <h1>ArtiShare</h1>
        <button className="link" onClick={() => chrome.runtime.openOptionsPage()}>
          Lists &amp; config
        </button>
      </div>
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
      {run ? <RunView run={run} /> : <Setup config={config} />}
      <p className="hint" style={{ marginTop: 16 }}>
        Version {chrome.runtime.getManifest().version}
      </p>
    </div>
  );
}

interface Draft {
  jobName: string;
  artifacts: ArtifactRef[];
  emails: string[];
  access: AccessLevel;
}

function Setup({ config }: { config: Config }) {
  const [jobName, setJobName] = useState(AD_HOC);
  const [artifactText, setArtifactText] = useState('');
  const [lists, setLists] = useState<string[]>([]);
  const [emailText, setEmailText] = useState('');
  const [access, setAccess] = useState<AccessLevel>(config.defaults.access);
  const [preview, setPreview] = useState<{ draft: Draft; results: PreviewResult[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const job = config.jobs.find((j) => j.name === jobName);

  // Selecting a job fills the form; you can still tweak it before previewing.
  useEffect(() => {
    if (!job) return;
    const resolved = resolveJob(config, job);
    setArtifactText(resolved.artifacts.map((a) => a.url).join('\n'));
    setLists(job.lists);
    setEmailText(job.emails.join('\n'));
    setAccess(resolved.access);
  }, [jobName]); // eslint-disable-line react-hooks/exhaustive-deps

  const artifacts = parseArtifactList(artifactText);
  const emails = useMemo(
    () => mergeEmails(...lists.map((l) => listEmails(config, l)), parseEmails(emailText).valid),
    [lists, emailText, config],
  );

  const addCurrentTab = async () => {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    const ref = tab?.url ? parseArtifactRef(tab.url) : null;
    if (!ref) {
      setError('The current tab is not a claude.ai artifact.');
      return;
    }
    setError('');
    if (!artifacts.refs.some((r) => r.id === ref.id)) setArtifactText([artifactText.trim(), ref.url].filter(Boolean).join('\n'));
  };

  const runPreview = async () => {
    setError('');
    if (!artifacts.refs.length) return setError('Add at least one artifact.');
    if (artifacts.invalid.length) return setError(`Not artifact links: ${artifacts.invalid.join(', ')}`);
    if (!emails.length) return setError('Pick a list or add some emails.');
    const draft: Draft = { jobName: job?.name ?? 'Ad hoc', artifacts: artifacts.refs, emails, access };
    setBusy(true);
    try {
      const results = await send('preview', {
        artifacts: draft.artifacts,
        emails: draft.emails,
        access: draft.access,
        orgDomains: config.defaults.orgDomains,
      });
      setPreview({ draft, results });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (preview) {
    return <Preview {...preview} delayMs={config.defaults.delayMs} onBack={() => setPreview(null)} />;
  }

  return (
    <div className="stack">
      <div className="card stack">
        <label>Job</label>
        <select value={jobName} onChange={(e) => setJobName(e.target.value)}>
          <option value={AD_HOC}>Ad hoc (fill in below)</option>
          {config.jobs.map((j) => (
            <option key={j.name} value={j.name}>
              {j.name}
            </option>
          ))}
        </select>
      </div>

      <div className="card stack">
        <div className="row spread">
          <label>
            Artifacts <span className="hint">{artifacts.refs.length} found</span>
          </label>
          <button className="link" onClick={addCurrentTab}>
            + Current tab
          </button>
        </div>
        <textarea
          rows={3}
          value={artifactText}
          onChange={(e) => setArtifactText(e.target.value)}
          placeholder="https://claude.ai/artifact/…  (one per line)"
          spellCheck={false}
        />
        {artifacts.invalid.length > 0 && <span className="hint err">Not artifact links: {artifacts.invalid.join(', ')}</span>}
      </div>

      <div className="card stack">
        <label>Lists</label>
        {Object.keys(config.lists).length === 0 ? (
          <span className="hint">
            No saved lists.{' '}
            <button className="link" onClick={() => chrome.runtime.openOptionsPage()}>
              Create one
            </button>{' '}
            or paste emails below.
          </span>
        ) : (
          <div className="checks">
            {Object.keys(config.lists)
              .sort()
              .map((l) => (
                <label key={l}>
                  <input
                    type="checkbox"
                    checked={lists.includes(l)}
                    onChange={(e) => setLists(e.target.checked ? [...lists, l] : lists.filter((x) => x !== l))}
                  />
                  {l} <span className="hint">({config.lists[l]?.length})</span>
                </label>
              ))}
          </div>
        )}
        <label>
          Emails <span className="hint">optional, added to the lists</span>
        </label>
        <EmailInput value={emailText} onChange={setEmailText} rows={4} />
      </div>

      <div className="card stack">
        <label>Access</label>
        <AccessSelect value={access} onChange={setAccess} />
      </div>

      {error && <p className="err">{error}</p>}
      <button className="primary" onClick={runPreview} disabled={busy}>
        {busy
          ? 'Checking current access…'
          : `Preview ${emails.length} ${emails.length === 1 ? 'person' : 'people'} × ${artifacts.refs.length} artifact${
              artifacts.refs.length === 1 ? '' : 's'
            }`}
      </button>
      <p className="hint">Preview only reads who already has access. Nothing is sent until you confirm.</p>
    </div>
  );
}

function Preview({
  draft,
  results,
  delayMs,
  onBack,
}: {
  draft: Draft;
  results: PreviewResult[];
  delayMs: number;
  onBack: () => void;
}) {
  const [error, setError] = useState('');
  const [starting, setStarting] = useState(false);
  const plans = results.flatMap((r) => (r.plan ? [r.plan] : []));
  const total = plans.reduce((n, p) => n + p.toInvite.length, 0);
  const external = plans.reduce((n, p) => n + p.toInvite.filter((i) => !i.internal).length, 0);

  const start = async () => {
    const ok = window.confirm(
      `Send ${total} invitation${total === 1 ? '' : 's'} with "${ACCESS_LABELS[draft.access]}" access across ${plans.length} artifact${
        plans.length === 1 ? '' : 's'
      }?\n\n${external} of them go to people outside your organization, who will get an email from Claude.`,
    );
    if (!ok) return;
    setStarting(true);
    try {
      await send('start', { jobName: draft.jobName, plans, delayMs });
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
        <span className="hint">
          {draft.jobName} · {ACCESS_LABELS[draft.access]}
        </span>
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
                  {r.plan.overLimit.length > 0 && <span className="chip err">{r.plan.overLimit.length} over the cap</span>}
                  {r.plan.self.length > 0 && <span className="chip">you</span>}
                </div>
                <span className="hint">
                  Outside people after this run: {r.plan.externalAfter} / {r.plan.externalLimit}
                </span>
                <EmailGroup title="Will be invited" emails={r.plan.toInvite.map((i) => i.email)} />
                <EmailGroup
                  title="Already have access (left unchanged)"
                  emails={r.plan.alreadyShared.map(
                    (s) => `${s.email} (${s.access in ACCESS_LABELS ? ACCESS_LABELS[s.access as AccessLevel] : s.access}${
                      s.status === 'pending' ? ', pending' : ''
                    })`,
                  )}
                />
                <EmailGroup title="Over the 50-outside-people cap (skipped)" emails={r.plan.overLimit} />
              </>
            )
          )}
        </div>
      ))}
      {error && <p className="err">{error}</p>}
      <button className="primary" disabled={!total || starting} onClick={start}>
        {total ? `Send ${total} invitation${total === 1 ? '' : 's'}` : 'Nothing to send'}
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
          <strong>{run.jobName}</strong>
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
          <button onClick={() => download(`artishare-report-${new Date(run.createdAt).toISOString().slice(0, 10)}.csv`, runReportCsv(run.items), 'text/csv')}>
            Export CSV
          </button>
          {run.status !== 'running' && (
            <button
              onClick={() => {
                if (s.pending === 0 || window.confirm('Discard this run? The remaining invites will not be sent.')) void act('clear');
              }}
            >
              New run
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
