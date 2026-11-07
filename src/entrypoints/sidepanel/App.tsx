import { useEffect, useState, type KeyboardEvent } from 'react';
import type { Account } from '../../claude/shareClient';
import { send } from '../../lib/messages';
import { useConfig, useRun } from '../../ui/hooks';
import { CloseIcon, SendIcon } from '../../ui/icons';
import { ListsView } from './ListsView';
import { RunView } from './RunView';
import { ShareView } from './ShareView';

type Tab = 'share' | 'lists';

export function App() {
  const [config, save, configError] = useConfig();
  const [run, runError] = useRun();
  const [tab, setTab] = useState<Tab>('share');
  const [account, setAccount] = useState<Account | null>(null);
  const [accountError, setAccountError] = useState('');

  const refreshAccount = () => {
    // oxlint-disable-next-line react/set-state-in-effect -- also a click handler; clears the old error before re-checking
    setAccountError('');
    send('whoami', {}).then(setAccount, (e: Error) => {
      setAccount(null);
      setAccountError(e.message);
    });
  };

  useEffect(refreshAccount, []);

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

  if (configError && !config) return <div className="panel alert">Could not load lists: {configError}</div>;
  if (runError && run === undefined)
    return <div className="panel alert">Could not load invitation progress: {runError}</div>;
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
        {/* window.close() closes the side panel. A run keeps going in the background. */}
        <button
          className="ghost icon-btn"
          aria-label="Close ArtiShare"
          title="Close"
          onClick={() => window.close()}
        >
          <CloseIcon size={16} />
        </button>
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

      {/* Both tabs stay mounted so switching doesn't lose what you've typed. */}
      <div id="panel-share" role="tabpanel" aria-labelledby="tab-share" hidden={tab !== 'share'}>
        {run ? <RunView run={run} /> : <ShareView config={config} save={save} />}
      </div>
      <div id="panel-lists" role="tabpanel" aria-labelledby="tab-lists" hidden={tab !== 'lists'}>
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
