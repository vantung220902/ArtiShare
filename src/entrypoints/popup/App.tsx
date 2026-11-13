import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { Account } from '../../claude/shareClient';
import type { ArtifactRef } from '../../core/types';
import { emptyPopupState, type PopupState, reconcileListsDraft, type Tab } from '../../core/popupState';
import { send } from '../../lib/messages';
import { loadPopupState, patchPopupState } from '../../lib/storage';
import { useConfig, useRun } from '../../ui/hooks';
import { SendIcon, UsersIcon } from '../../ui/icons';
import { ListsView } from './ListsView';
import { ManageView } from './ManageView';
import { RunView } from './RunView';
import { ShareView } from './ShareView';
import { currentTabArtifact } from './viewUtils';

export function App() {
  const [config, save, configError] = useConfig();
  const [run, runError] = useRun();
  // What was open and typed before the popup last closed. Nothing is drawn until it is known,
  // so the first state of every form is the restored one.
  const [stored, setStored] = useState<PopupState | undefined>(undefined);
  const [tabChoice, setTabChoice] = useState<Tab | null>(null);
  const tab = tabChoice ?? stored?.tab ?? 'share';
  // The artifact in the tab the popup opened over, which Manage access is about. Read once: a popup
  // closes when you click away, so it can't outlive a change of tab.
  const [tabArtifact, setTabArtifact] = useState<ArtifactRef | null>(null);
  // Set while People with access is open, whichever tab it was opened from.
  const [managing, setManaging] = useState<ArtifactRef | null>(null);
  const manageIconRef = useRef<HTMLButtonElement>(null);
  const setTab = (next: Tab) => {
    // Choosing a tab shows that tab, so People with access closes.
    setManaging(null);
    setTabChoice(next);
    void patchPopupState({ tab: next });
  };
  const [account, setAccount] = useState<Account | null>(null);
  const [accountError, setAccountError] = useState('');
  // Set by "Start a new share", so the fresh Share form is ready to type in. Not on a plain panel open.
  const [focusArtifacts, setFocusArtifacts] = useState(false);

  useEffect(() => {
    void currentTabArtifact().then(setTabArtifact, () => {});
  }, []);

  const refreshAccount = () => {
    // oxlint-disable-next-line react/set-state-in-effect -- also a click handler; clears the old error before re-checking
    setAccountError('');
    send('whoami', {}).then(setAccount, (e: Error) => {
      setAccount(null);
      setAccountError(e.message);
    });
  };

  useEffect(refreshAccount, []);

  useEffect(() => {
    // Restoring is a convenience: if it can't be read, open on an empty Share tab.
    void loadPopupState().then(setStored, () => setStored(emptyPopupState()));
  }, []);

  const onTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    let next: Tab | null = null;
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') next = tab === 'share' ? 'lists' : 'share';
    if (event.key === 'Home') next = 'share';
    if (event.key === 'End') next = 'lists';

    if (next) {
      event.preventDefault();
      setTab(next);
      document.getElementById(`tab-${next}`)?.focus();
    }
  };

  if (configError && !config)
    return (
      <div className="popup">
        <div className="popup-body alert">Could not load lists: {configError}</div>
      </div>
    );
  if (runError && run === undefined)
    return (
      <div className="popup">
        <div className="popup-body alert">Could not load invitation progress: {runError}</div>
      </div>
    );
  if (!config || run === undefined || !stored)
    return (
      <div className="popup">
        <div className="popup-body muted">Loading…</div>
      </div>
    );

  const manageView = (artifact: ArtifactRef) => (
    <ManageView
      artifact={artifact}
      run={run}
      onBack={() => {
        setManaging(null);
        // The icon opened this and is still in the header, so focus returns to it.
        manageIconRef.current?.focus();
      }}
    />
  );

  return (
    // Header and tabs stay put and only .popup-body scrolls; the popup itself is capped at 600 px.
    // There is no close button: a popup closes when you click away, and a run keeps going in the background.
    <div className="popup">
      <div className="popup-top">
        <header className="header">
          <div className="brand">
            <span className="logo">
              <SendIcon size={16} />
            </span>
            <h1 className="wordmark">ArtiShare</h1>
          </div>
          <AccountPill account={account} error={accountError} />
          {/* Only where it works: an artifact tab. In the header so it never scrolls out of reach. */}
          {tabArtifact && (
            <button
              ref={manageIconRef}
              className="ghost icon-btn"
              aria-label="Manage access"
              title="Manage access to this artifact"
              aria-pressed={managing !== null}
              onClick={() => setManaging(managing ? null : tabArtifact)}
            >
              <UsersIcon size={16} />
            </button>
          )}
        </header>

        {accountError && (
          <p className="alert">
            {accountError}{' '}
            <button className="link" onClick={refreshAccount}>
              Retry
            </button>
          </p>
        )}

        <div className="segmented" role="tablist" aria-label="Sections">
          <button
            id="tab-share"
            role="tab"
            aria-controls="panel-share"
            aria-selected={tab === 'share'}
            tabIndex={tab === 'share' ? 0 : -1}
            onKeyDown={onTabKeyDown}
            onClick={() => setTab('share')}
          >
            Share
          </button>
          <button
            id="tab-lists"
            role="tab"
            aria-controls="panel-lists"
            aria-selected={tab === 'lists'}
            tabIndex={tab === 'lists' ? 0 : -1}
            onKeyDown={onTabKeyDown}
            onClick={() => setTab('lists')}
          >
            Lists <span className="count">{config.lists.length}</span>
          </button>
        </div>
      </div>

      <div className="popup-body">
        {/* Both tabs stay mounted so switching doesn't lose what you've typed. */}
        <div id="panel-share" role="tabpanel" aria-labelledby="tab-share" hidden={tab !== 'share'}>
          {/* The form or run stays mounted (just hidden) under Manage access, so Back finds it as it was. */}
          <div hidden={managing !== null}>
            {run ? (
              <RunView run={run} onStartNew={setFocusArtifacts} />
            ) : (
              <ShareView
                focusArtifacts={focusArtifacts}
                onArtifactsFocused={() => setFocusArtifacts(false)}
                config={config}
                save={save}
                onAccount={(next) => {
                  setAccount(next);
                  setAccountError('');
                }}
              />
            )}
          </div>
          {managing && tab === 'share' && manageView(managing)}
        </div>
        <div id="panel-lists" role="tabpanel" aria-labelledby="tab-lists" hidden={tab !== 'lists'}>
          {/* Hidden, not unmounted, under Manage access: an open list and its unsaved changes survive. */}
          <div hidden={managing !== null}>
            <ListsView
              config={config}
              save={save}
              initial={reconcileListsDraft(
                stored.lists,
                config.lists.map((list) => list.id),
              )}
            />
          </div>
          {managing && tab === 'lists' && manageView(managing)}
        </div>
      </div>

      <footer className="footer">Version {chrome.runtime.getManifest().version}</footer>
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
