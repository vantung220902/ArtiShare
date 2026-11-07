import { useEffect, useMemo, useState } from 'react';
import { parseArtifactList, parseArtifactRef } from '../../core/artifactUrl';
import { type Config, defaultListIds, type Invitee, resolveInvites } from '../../core/config';
import { ACCESS_LABELS, type AccessLevel, type ArtifactRef } from '../../core/types';
import { type PreviewResult, send } from '../../lib/messages';
import { BackIcon, PlusIcon, SendIcon } from '../../ui/icons';
import { ListBadge } from '../../ui/ListBadge';
import { ListForm } from '../../ui/ListForm';
import { ArtifactLink, EmailGroup } from './viewComponents';
import { byName, people, plural, type Save } from './viewUtils';

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

export function ShareView({ config, save }: { config: Config; save: Save }) {
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
  // oxlint-disable-next-line react/set-state-in-effect, react-hooks/exhaustive-deps -- keyed on the default selection only, not every config change
  useEffect(() => setSelected(defaultListIds(config)), [defaultKey]);

  const lists = byName(config.lists);
  const artifacts = parseArtifactList(artifactText);
  const invites = useMemo(() => resolveInvites(config, selected), [config, selected]);
  const showForm = creating || lists.length === 0;

  const toggle = (id: string, on: boolean) =>
    setSelected((ids) => (on ? [...ids, id] : ids.filter((x) => x !== id)));

  const addCurrentTab = async () => {
    const ref = await currentTabArtifact();
    if (!ref) return setError('The current tab is not a claude.ai artifact.');
    setError('');
    if (!artifacts.refs.some((r) => r.id === ref.id))
      setArtifactText([artifactText.trim(), ref.url].filter(Boolean).join('\n'));
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
        {artifacts.invalid.length > 0 && (
          <span className="hint err">Not artifact links: {artifacts.invalid.join(', ')}</span>
        )}
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
                <input
                  type="checkbox"
                  checked={selected.includes(l.id)}
                  onChange={(e) => toggle(l.id, e.target.checked)}
                />
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
        {busy
          ? 'Checking current access…'
          : `Preview ${people(invites.length)} × ${plural(artifacts.refs.length, 'artifact')}`}
      </button>
      <p className="hint center">
        Preview only reads who already has access. Nothing is sent until you confirm.
      </p>
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
                    <span>already invited</span>
                  </div>
                </div>
                {r.plan.self.length > 0 && <p className="hint">Your own address is skipped.</p>}
                <EmailGroup
                  title="Will be invited"
                  emails={r.plan.toInvite.map((i) => `${i.email} · ${ACCESS_LABELS[i.access]}`)}
                />
                <EmailGroup
                  title="Existing email access (left unchanged)"
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
        On Claude Team and Enterprise plans, organization members may have direct access that is not shown
        here. Check those people in Claude's Share menu before sending; adding them may change their access.
      </p>
      <p className="hint">
        claude.ai allows up to 50 people outside your organization per artifact. If an artifact reaches that,
        the rest of its invites are skipped.
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
