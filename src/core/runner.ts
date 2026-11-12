import { artifactUuid } from './artifactUrl';
import type { AccessLevel, ArtifactRef } from './types';

export type ShareErrorCode =
  | 'rate-limited' // 429
  | 'network' // fetch failed, tab closed
  | 'server' // 5xx
  | 'not-ready' // explicit refusal while claude.ai finishes an artifact update
  | 'auth' // signed out of claude.ai
  | 'account-changed' // the signed-in account is not the one that started the run
  | 'forbidden' // not the owner / no permission to share
  | 'not-found' // artifact does not exist
  | 'unshareable' // artifact type can't be shared by email
  | 'external-disabled' // this address is outside an org that blocks outside invitations
  | 'limit' // per-artifact invitee cap reached
  | 'daily-limit' // the account's daily invitation cap reached
  | 'invalid' // the address was rejected
  | 'access-unavailable' // the requested access level is disabled
  | 'managed-elsewhere' // the invitee joined the organization; claude.ai manages their access
  | 'unknown';

export class ShareError extends Error {
  constructor(
    message: string,
    readonly code: ShareErrorCode,
    readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = 'ShareError';
  }
}

const RETRYABLE = new Set<ShareErrorCode>(['rate-limited', 'not-ready']);
/** Errors that will fail every other invite on the same artifact too. */
const ARTIFACT_LEVEL = new Set<ShareErrorCode>(['forbidden', 'not-found', 'unshareable', 'limit']);
/** Errors that will fail every invite in the run until the user acts; the item stays pending for Resume. */
const RUN_LEVEL: Partial<Record<ShareErrorCode, string>> = {
  auth: 'You are signed out of claude.ai. Sign in, then resume.',
  'account-changed': 'The signed-in account changed. Sign in as the account used for Preview, then resume.',
  'daily-limit': "claude.ai's daily invitation limit is reached. Resume tomorrow.",
  network: 'The last invitation may have been sent. Resume to check current access before trying again.',
  server: 'The last invitation may have been sent. Resume to check current access before trying again.',
  'rate-limited': 'claude.ai is still rate-limiting invitations. Resume later to try again.',
};

export function toShareError(err: unknown): ShareError {
  if (err instanceof ShareError) return err;

  if (err && typeof err === 'object' && 'code' in err && 'message' in err) {
    const e = err as { message: string; code: ShareErrorCode; retryAfterMs?: number };

    return new ShareError(e.message, e.code, e.retryAfterMs);
  }

  return new ShareError(err instanceof Error ? err.message : String(err), 'unknown');
}

export type ItemStatus = 'pending' | 'invited' | 'failed' | 'skipped';

export interface RunItem {
  artifact: ArtifactRef;
  email: string;
  access: AccessLevel;
  status: ItemStatus;
  error?: string;
  errorCode?: ShareErrorCode;
  attempts: number;
  finishedAt?: number;
}

export interface InviteClient {
  invite(artifact: ArtifactRef, email: string, access: AccessLevel): Promise<void>;
}

export interface RunOptions {
  delayMs: number;
  /** Random extra pause added to each delay, 0..jitterMs. */
  jitterMs?: number;
  maxRetries?: number;
  /** Stop the whole run after this many failed invites in a row. */
  maxConsecutiveFailures?: number;
  baseBackoffMs?: number;
  signal?: AbortSignal;
  onUpdate?: (item: RunItem, index: number) => void | Promise<void>;
  /** Must return early when `signal` aborts, so Stop takes effect during a pause or backoff. */
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  random?: () => number;
}

export interface RunSummary {
  status: 'completed' | 'stopped';
  reason?: string;
  invited: number;
  failed: number;
  skipped: number;
  pending: number;
}

/** Resolves after `ms`, or as soon as `signal` aborts. */
export function abortableSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve();

    const done = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', done);
      resolve();
    };

    const timer = setTimeout(done, ms);
    signal?.addEventListener('abort', done, { once: true });
  });
}

/**
 * Invites every `pending` item, one at a time. Mutates items in place and reports each change
 * through `onUpdate`, so the caller can persist progress and resume a stopped run later.
 */
export async function runInvites(
  items: RunItem[],
  client: InviteClient,
  options: RunOptions,
): Promise<RunSummary> {
  const {
    delayMs,
    jitterMs = 0,
    maxRetries = 3,
    maxConsecutiveFailures = 5,
    baseBackoffMs = 2_000,
    signal,
    onUpdate,
    sleep = abortableSleep,
    random = Math.random,
  } = options;

  let consecutiveFailures = 0;
  let sentAny = false;
  let stopReason: string | undefined;
  const STOPPED = 'Stopped by you.';
  const stopped = () => signal?.aborted === true;

  for (let i = 0; i < items.length; i++) {
    const item = items[i]!;
    if (item.status !== 'pending') continue;

    if (stopped()) {
      stopReason = STOPPED;
      break;
    }

    if (sentAny && delayMs > 0) {
      await sleep(delayMs + Math.floor(random() * jitterMs), signal);

      // Stop pressed during the pause: don't send this one.
      if (stopped()) {
        stopReason = STOPPED;
        break;
      }
    }

    sentAny = true;

    let error: ShareError | undefined;
    let interrupted = false;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      item.attempts++;

      try {
        await client.invite(item.artifact, item.email, item.access);
        error = undefined;
        break;
      } catch (err) {
        error = toShareError(err);
        if (!RETRYABLE.has(error.code) || attempt === maxRetries) break;
        const backoff = error.retryAfterMs ?? Math.min(baseBackoffMs * 2 ** attempt, 60_000);
        if (!stopped()) await sleep(backoff, signal);

        if (stopped()) {
          interrupted = true;
          break;
        }
      }
    }

    if (interrupted) {
      // Stopped while waiting to retry: leave it pending so Resume tries it again.
      await onUpdate?.(item, i);
      stopReason = STOPPED;
      break;
    }

    const runLevel = error && RUN_LEVEL[error.code];

    if (runLevel) {
      // Not this address's fault: keep it pending so Resume sends it.
      await onUpdate?.(item, i);
      stopReason = runLevel;
      break;
    }

    if (!error) {
      item.status = 'invited';
      item.error = undefined;
      item.errorCode = undefined;
      item.finishedAt = Date.now();
      consecutiveFailures = 0;
      await onUpdate?.(item, i);
      continue;
    }

    item.status = 'failed';
    item.error = error.message;
    item.errorCode = error.code;
    item.finishedAt = Date.now();
    consecutiveFailures++;
    await onUpdate?.(item, i);

    if (error.code === 'external-disabled') {
      // This rule applies to outside addresses, not to colleagues on the same artifact.
      consecutiveFailures = 0;
      continue;
    }

    if (ARTIFACT_LEVEL.has(error.code) || error.code === 'access-unavailable') {
      // Skip only the scope that this rejection applies to.
      const artifactKey = artifactUuid(item.artifact) ?? item.artifact.url;
      for (let j = i + 1; j < items.length; j++) {
        const other = items[j]!;

        if (
          other.status === 'pending' &&
          (artifactUuid(other.artifact) ?? other.artifact.url) === artifactKey &&
          (error.code !== 'access-unavailable' || other.access === item.access)
        ) {
          other.status = 'skipped';
          other.error = `Skipped: ${error.message}`;
          other.errorCode = error.code;
          other.finishedAt = Date.now();
          await onUpdate?.(other, j);
        }
      }

      // An artifact-level rejection isn't a sign the whole run is broken.
      consecutiveFailures = 0;
      continue;
    }

    if (consecutiveFailures >= maxConsecutiveFailures) {
      stopReason = `Stopped after ${consecutiveFailures} failed invites in a row. Last error: ${error.message}`;
      break;
    }
  }

  return summarize(items, stopReason);
}

export function summarize(items: readonly RunItem[], stopReason?: string): RunSummary {
  const count = (s: ItemStatus) => items.filter((i) => i.status === s).length;
  const pending = count('pending');

  return {
    status: stopReason || pending > 0 ? 'stopped' : 'completed',
    reason: stopReason,
    invited: count('invited'),
    failed: count('failed'),
    skipped: count('skipped'),
    pending,
  };
}
