import type { InviteClient } from '../core/runner';
import type { AccessLevel, ArtifactRef, Sharee } from '../core/types';

export interface Account {
  email: string;
  /** Name of the claude.ai organization the artifacts live in, when known. */
  orgName?: string;
}

/**
 * Everything the extension needs from claude.ai. The implementation talks to the same
 * endpoints the Share menu uses; keep every claude.ai detail behind this interface so a
 * change on their side is a one-file fix.
 */
export interface ShareClient extends InviteClient {
  whoami(): Promise<Account>;
  /**
   * Email invitees with access or a pending invitation, each with the invitation `id` that
   * `changeAccess` and `removeInvite` need. Excludes direct Team/Enterprise org members.
   */
  listSharees(artifact: ArtifactRef): Promise<Sharee[]>;
  /** Changes an invitation's permission. Throws `managed-elsewhere` for someone who joined the organization. */
  changeAccess(artifact: ArtifactRef, inviteId: string, access: AccessLevel): Promise<void>;
  /** Removes an invitation (or a person's access). Throws like `changeAccess`. */
  removeInvite(artifact: ArtifactRef, inviteId: string): Promise<void>;
}
