import { useState } from 'react';
import { summarize } from '../../core/runner';
import { send } from '../../lib/messages';
import type { RunState } from '../../lib/storage';
import { ArtifactLink } from './viewComponents';

const RUN_STATUS_LABELS: Record<RunState['status'], string> = {
  running: 'Running',
  completed: 'Done',
  stopped: 'Stopped',
};

export function RunView({ run }: { run: RunState }) {
  const [error, setError] = useState('');
  const s = summarize(run.items, run.reason);
  const done = run.items.length - s.pending;
  const pct = run.items.length ? Math.round((done / run.items.length) * 100) : 100;
  const act = (type: 'stop' | 'resume' | 'clear') =>
    send(type, {}).then(
      () => setError(''),
      (e: Error) => setError(e.message),
    );

  const finished = run.status === 'completed';
  // The same counts as the chips, in words, so a finished run reads as one message.
  const outcome = [
    `${s.invited} invited`,
    s.failed > 0 && `${s.failed} failed`,
    s.skipped > 0 && `${s.skipped} skipped`,
  ]
    .filter(Boolean)
    .join(', ');
  const startNew = () => {
    if (s.pending === 0 || window.confirm('Discard this run? The remaining invites will not be sent.'))
      void act('clear');
  };

  const byArtifact = new Map<string, RunState['items']>();

  for (const item of run.items) {
    const list = byArtifact.get(item.artifact.url) ?? [];
    list.push(item);
    byArtifact.set(item.artifact.url, list);
  }

  return (
    <div className="stack">
      <section className="card stack">
        {finished && <output className="alert ok">Share finished: {outcome}</output>}
        <div className="row spread">
          <strong className="truncate grow">{run.label}</strong>
          <span className={`status ${run.status}`}>
            <span className="dot" />
            {RUN_STATUS_LABELS[run.status]}
          </span>
        </div>
        {run.accountEmail && <p className="hint">Previewed as {run.accountEmail}</p>}
        <div className={run.status === 'running' ? 'progress running' : 'progress'}>
          <div style={{ width: `${pct}%` }} />
        </div>
        {!finished && (
          <div className="row">
            <span className="chip ok">{s.invited} invited</span>
            {s.failed > 0 && <span className="chip err">{s.failed} failed</span>}
            {s.skipped > 0 && <span className="chip warn">{s.skipped} skipped</span>}
            {s.pending > 0 && <span className="chip">{s.pending} left</span>}
          </div>
        )}
        {run.reason && <p className="alert warn">{run.reason}</p>}
        {run.status === 'stopped' && s.pending > 0 && !run.accountEmail && (
          <p className="alert warn">
            This run predates account verification. Start a new share to recheck existing invitations.
          </p>
        )}
        <div className="row">
          {run.status === 'running' && <button onClick={() => act('stop')}>Stop</button>}
          {run.status === 'stopped' && s.pending > 0 && run.accountEmail && (
            <button className="primary" onClick={() => act('resume')}>
              Resume
            </button>
          )}
          {run.status !== 'running' && (
            // Only a finished run makes this the one obvious next step; a stopped run's main action is Resume.
            <button className={finished ? 'primary block' : undefined} onClick={startNew}>
              Start a new share
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
