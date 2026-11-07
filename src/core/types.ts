/** Access levels offered by the claude.ai Share menu ("Can view", "Commenter", "Can edit"). */
export type AccessLevel = 'view' | 'comment' | 'edit';

export const ACCESS_LEVELS: readonly AccessLevel[] = ['view', 'comment', 'edit'];

export const ACCESS_LABELS: Record<AccessLevel, string> = {
  view: 'Can view',
  comment: 'Commenter',
  edit: 'Can edit',
};

export interface ArtifactRef {
  /** The id as it appears in the URL. */
  id: string;
  /** `artifact` for claude.ai/artifact/{id}, `code-artifact` for claude.ai/code/artifact/{uuid}. */
  kind: 'artifact' | 'code-artifact';
  /** Canonical URL for display and navigation. */
  url: string;
}

/** Someone who already has access to an artifact, or has a pending invitation. */
export interface Sharee {
  email: string;
  access: AccessLevel | 'owner' | 'unknown';
  status: 'active' | 'pending';
}
