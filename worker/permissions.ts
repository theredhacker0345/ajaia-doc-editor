/**
 * Access-control rules, extracted as pure functions so they can be unit tested
 * without touching the database or the Workers runtime.
 *
 * Role model:
 *   owner  - created the document. Can rename, edit, delete, manage sharing
 *            and transfer ownership.
 *   editor - shared user. Can edit content and manage attachments. May also
 *            invite others when the owner granted the `canShare` privilege.
 *   viewer - shared user. Read-only.
 *
 * Grants can carry an `expiresAt` timestamp; an expired grant is exactly
 * equivalent to no grant at all (access is revoked without touching rows,
 * so re-sharing simply issues a fresh expiry).
 */

export type Role = "owner" | "editor" | "viewer";

export interface ShareGrant {
  role: "viewer" | "editor";
  /** Editor-only privilege: may invite others (viewer/editor, never wider than own role). */
  canShare: boolean;
  /** ISO timestamp after which the grant no longer applies; null = never expires. */
  expiresAt: string | null;
}

export interface AccessInput {
  ownerId: string;
  userId: string | null;
  /** The caller's share row, or null when they own the document / have none. */
  share?: ShareGrant | null;
  /** Injectable clock (ms epoch) so expiry logic is deterministic in tests. */
  now?: number;
}

export interface Access {
  isOwner: boolean;
  role: Role | null;
  canView: boolean;
  canEdit: boolean;
  /** Owner, or an editor with the invite-more privilege. */
  canShare: boolean;
  canManage: boolean;
}

const NO_ACCESS: Access = {
  isOwner: false,
  role: null,
  canView: false,
  canEdit: false,
  canShare: false,
  canManage: false,
};

function isExpired(grant: ShareGrant, now: number): boolean {
  if (!grant.expiresAt) return false;
  const t = Date.parse(grant.expiresAt);
  return Number.isFinite(t) && t <= now;
}

export function resolveAccess({ ownerId, userId, share, now }: AccessInput): Access {
  // No session -> no access, regardless of any share rows.
  if (!userId) return NO_ACCESS;

  const isOwner = userId === ownerId;
  if (isOwner) {
    return { isOwner: true, role: "owner", canView: true, canEdit: true, canShare: true, canManage: true };
  }

  // No grant, or a grant whose expiry has passed -> no access.
  if (!share || isExpired(share, now ?? Date.now())) return NO_ACCESS;

  const canShare = share.role === "editor" && share.canShare;
  return {
    isOwner: false,
    role: share.role,
    canView: true,
    canEdit: share.role === "editor",
    canShare,
    canManage: false,
  };
}
