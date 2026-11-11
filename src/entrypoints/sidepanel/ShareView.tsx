import { useEffect, useMemo, useRef, useState } from 'react';
import type { Account } from '../../claude/shareClient';
import { parseArtifactList, parseArtifactRef } from '../../core/artifactUrl';
import { type Config, defaultListIds, type Invitee, resolveInvites } from '../../core/config';
import { ACCESS_LABELS, type AccessLevel, type ArtifactRef } from '../../core/types';
import { type PreviewResult, send } from '../../lib/messages';
import { BackIcon, PlusIcon, SendIcon } from '../../ui/icons';
import { ListBadge } from '../../ui/ListBadge';
import { type ListDraft, ListForm, type ListFormHandle } from '../../ui/ListForm';
import { RequiredMark } from '../../ui/RequiredMark';
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

export function ShareView({
  config,
  save,
  onAccount,
}: {
  config: Config;
  save: Save;
  onAccount: (account: Account) => void;
}) {
  const [artifactText, setArtifactText] = useState('');
  const [selected, setSelected] = useState<string[]>(() => defaultListIds(config));
  const [creating, setCreating] = useState(false);
  const [preview, setPreview] = useState<{
    draft: Draft;
    results: PreviewResult[];
    accountEmail: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState<ListDraft | null>(null);
  const form = useRef<ListFormHandle>(null);
  const previousListIds = useRef(new Set(config.lists.map((list) => list.id)));

  // Start from the artifact you're looking at.
  useEffect(() => {
    void currentTabArtifact().then((ref) => ref && setArtifactText((text) => (text.trim() ? text : ref.url)));
  }, []);

  // Changing the default selection in the Lists tab re-applies it here.
  const defaultKey = JSON.stringify(config.defaultSelection);
  // oxlint-disable-next-line react/set-state-in-effect, react-hooks/exhaustive-deps -- keyed on the default selection only, not every config change
  useEffect(() => setSelected(defaultListIds(config)), [defaultKey]);

  // In "All lists" mode, include lists created in the Lists tab without losing manual unticks.
  useEffect(() => {
    const ids = config.lists.map((list) => list.id);
    const available = new Set(ids);
    const added =
      config.defaultSelection.mode === 'all' ? ids.filter((id) => !previousListIds.current.has(id)) : [];
    previousListIds.current = available;
    setSelected((current) => {
      const next = current.filter((id) => available.has(id));
      for (const id of added) if (!next.includes(id)) next.push(id);
      return next.length === current.length && next.every((id, i) => id === current[i]) ? current : next;
    });
  }, [config.lists, config.defaultSelection.mode]);

  const lists = byName(config.lists);
  const artifacts = parseArtifactList(artifactText);
  const showForm = creating || lists.length === 0;
  const invites = useMemo(() => resolveInvites(config, selected), [config, selected]);
  // The button counts an unsaved new list too, since Preview saves it first.
  const draftList = showForm && draft ? { id: 'draft', name: '', ...draft } : null;
  const previewCount = draftList
    ? resolveInvites({ ...config, lists: [...config.lists, draftList] }, [...selected, draftList.id]).length
    : invites.length;

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
    let current = { config, selected, invites };

    // A new list typed but not saved is meant to be shared with: save it first, like Save list would.
    if (showForm && form.current?.hasDraft()) {
      setBusy(true);
      const saved = await form.current.submit();
      setBusy(false);
      // The form shows why it could not save.
      if (!saved) return;
      const ids = [...selected, saved.list.id];
      current = { config: saved.config, selected: ids, invites: resolveInvites(saved.config, ids) };
    }

    if (!current.invites.length) return setError('Tick a list, or create one.');
    const label = byName(current.config.lists)
      .filter((l) => current.selected.includes(l.id))
      .map((l) => l.name)
      .join(', ');
    const next: Draft = { label, artifacts: artifacts.refs, invites: current.invites };
    setBusy(true);

    try {
      const { account, results } = await send('preview', {
        artifacts: next.artifacts,
        invites: next.invites,
      });
      onAccount(account);
      setPreview({ draft: next, results, accountEmail: account.email });
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
            Artifacts
            <RequiredMark />{' '}
            {artifacts.refs.length > 0 && <span className="count">{artifacts.refs.length}</span>}
          </label>
          <button className="pill" onClick={addCurrentTab}>
            <PlusIcon size={13} /> Current tab
          </button>
        </div>
        <textarea
          id="artifacts"
          aria-required="true"
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
              ref={form}
              config={config}
              save={save}
              onSaved={(list) => {
                setSelected((ids) => [...ids, list.id]);
                setCreating(false);
              }}
              onCancel={lists.length ? () => setCreating(false) : undefined}
              onDraftChange={setDraft}
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
          : `Preview ${people(previewCount)} × ${plural(artifacts.refs.length, 'artifact')}`}
      </button>
      <p className="hint center">
        Preview only reads who already has access. Nothing is sent until you confirm.
      </p>
    </div>
  );
}

function Preview({
  draft,
  results,
  accountEmail,
  onBack,
}: {
  draft: Draft;
  results: PreviewResult[];
  accountEmail: string;
  onBack: () => void;
}) {
  const [error, setError] = useState('');
  const [starting, setStarting] = useState(false);
  const plans = results.flatMap((r) => (r.plan ? [r.plan] : []));
  const total = plans.reduce((n, p) => n + p.toInvite.length, 0);

  const start = async () => {
    const ok = window.confirm(
      `Send ${plural(total, 'invitation')} across ${plural(plans.length, 'artifact')} as ${accountEmail}?\n\n` +
        'People outside your organization will get an email from Claude.',
    );
    if (!ok) return;
    setStarting(true);

    try {
      await send('start', { label: draft.label, plans, accountEmail });
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
      <p className="hint">Sending as {accountEmail}</p>
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
                {r.plan.sameInbox.map((s) => (
                  <p key={s.email} className="hint">
                    {s.email} is skipped: claude.ai treats it as the same person as {s.as}, and keeps one
                    invitation per person.
                  </p>
                ))}
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
                      }${s.as ? ` · invited as ${s.as}` : ''}`,
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
