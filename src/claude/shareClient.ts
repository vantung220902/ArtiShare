import type { InviteClient } from '../core/runner';
import type { ArtifactRef, Sharee } from '../core/types';

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
  /** Email invitees with access or a pending invitation. Excludes direct Team/Enterprise org members. */
  listSharees(artifact: ArtifactRef): Promise<Sharee[]>;
}
