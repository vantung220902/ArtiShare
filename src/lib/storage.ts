import { type Config, ConfigSchema, loadStoredConfig } from '../core/config';
import type { RunItem } from '../core/runner';
import { emptyPopupState, parsePopupState, type PopupState } from '../core/popupState';
import { parseShareDraft, type ShareDraft } from '../core/shareDraft';

const CONFIG_KEY = 'config';
const RUN_KEY = 'run';
const SHARE_DRAFT_KEY = 'shareDraft';
const POPUP_STATE_KEY = 'popupState';

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

// The popup's own state (open tab, Lists tab drafts) is written piece by piece by different
// components, so a copy is kept here: each piece is merged into it and the whole is written,
// in order, so two quick changes can't overwrite each other.
let popupState = emptyPopupState();
let popupWrites: Promise<unknown> = Promise.resolve();

/** The popup state as last loaded or patched, for a view that mounts after the popup has loaded it. */
export const currentPopupState = (): PopupState => popupState;

export async function loadPopupState(): Promise<PopupState> {
  popupState = parsePopupState((await chrome.storage.session.get(POPUP_STATE_KEY))[POPUP_STATE_KEY]);

  return popupState;
}

/** Keeps `patch` for the next time the popup opens. Failing to is not worth bothering anyone about. */
export function patchPopupState(patch: Partial<PopupState>): Promise<void> {
  popupState = { ...popupState, ...patch };
  const snapshot = popupState;
  popupWrites = popupWrites
    .then(() => chrome.storage.session.set({ [POPUP_STATE_KEY]: snapshot }))
    .catch(() => {});

  return popupWrites.then(() => {});
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
