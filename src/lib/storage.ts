import { type Config, ConfigSchema, loadStoredConfig } from '../core/config';
import type { RunItem } from '../core/runner';
import { parseShareDraft, type ShareDraft } from '../core/shareDraft';

const CONFIG_KEY = 'config';
const RUN_KEY = 'run';
const SHARE_DRAFT_KEY = 'shareDraft';

export interface RunState {
  id: string;
  label: string;
  createdAt: number;
  /** Optional only for runs saved by an older extension version. */
  accountEmail?: string;
  status: 'running' | 'stopped' | 'completed';
  reason?: string;
  items: RunItem[];
}

export async function loadConfig(): Promise<Config> {
  const raw: unknown = (await chrome.storage.local.get(CONFIG_KEY))[CONFIG_KEY];
  const config = loadStoredConfig(raw);
  // Version 1 list ids are generated during migration, so persist them before
  // another extension view can load a different set of ids.
  if (raw && typeof raw === 'object' && 'version' in raw && raw.version === 1) await saveConfig(config);

  return config;
}

export async function saveConfig(config: Config): Promise<void> {
  await chrome.storage.local.set({ [CONFIG_KEY]: ConfigSchema.parse(config) });
}

export async function loadRun(): Promise<RunState | null> {
  return ((await chrome.storage.local.get(RUN_KEY))[RUN_KEY] as RunState | undefined) ?? null;
}

export async function saveRun(run: RunState | null): Promise<void> {
  if (run) await chrome.storage.local.set({ [RUN_KEY]: run });
  else await chrome.storage.local.remove(RUN_KEY);
}

// Session storage, not local: a draft is only worth keeping until the browser closes, and it
// should never outlive a restart as stale text. It survives the popup being closed.
export async function loadShareDraft(): Promise<ShareDraft | null> {
  return parseShareDraft((await chrome.storage.session.get(SHARE_DRAFT_KEY))[SHARE_DRAFT_KEY]);
}

export async function saveShareDraft(draft: ShareDraft | null): Promise<void> {
  if (draft) await chrome.storage.session.set({ [SHARE_DRAFT_KEY]: draft });
  else await chrome.storage.session.remove(SHARE_DRAFT_KEY);
}

function watch<T>(key: string, cb: (value: T | null) => void): () => void {
  const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    if (area === 'local' && key in changes) cb((changes[key]!.newValue as T | undefined) ?? null);
  };

  chrome.storage.onChanged.addListener(listener);

  return () => chrome.storage.onChanged.removeListener(listener);
}

export const watchConfig = (cb: (config: Config | null) => void) => watch<Config>(CONFIG_KEY, cb);
export const watchRun = (cb: (run: RunState | null) => void) => watch<RunState>(RUN_KEY, cb);
