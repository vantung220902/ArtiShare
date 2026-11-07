import type { Account } from '../claude/shareClient';
import type { Invitee } from '../core/config';
import type { ArtifactPlan } from '../core/planner';
import type { ArtifactRef } from '../core/types';

export interface PreviewResult {
  artifact: ArtifactRef;
  plan?: ArtifactPlan;
  error?: string;
}

export interface Messages {
  whoami: { req: Record<string, never>; res: Account };
  preview: { req: { artifacts: ArtifactRef[]; invites: Invitee[] }; res: PreviewResult[] };
  /** `label` names the run in the side panel, e.g. the lists it came from. */
  start: { req: { label: string; plans: ArtifactPlan[] }; res: null };
  stop: { req: Record<string, never>; res: null };
  resume: { req: Record<string, never>; res: null };
  clear: { req: Record<string, never>; res: null };
}

export type MessageType = keyof Messages;
export type Envelope = { [K in MessageType]: { type: K } & Messages[K]['req'] }[MessageType];
export type Reply<T> = { ok: true; data: T } | { ok: false; error: string };

/** Sends a request to the background worker and unwraps its reply. */
export async function send<K extends MessageType>(type: K, req: Messages[K]['req']): Promise<Messages[K]['res']> {
  const reply = (await chrome.runtime.sendMessage({ type, ...req })) as Reply<Messages[K]['res']> | undefined;
  if (!reply) throw new Error('The extension background did not answer. Reload the extension and try again.');
  if (!reply.ok) throw new Error(reply.error);
  return reply.data;
}
