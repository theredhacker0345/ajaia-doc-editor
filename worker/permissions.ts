/**
 * Access-control rules, extracted as pure functions so they can be unit tested
 * without touching the database or the Workers runtime.
 *
 * Role model:
 *   owner  - created the document. Can rename, edit, delete, and manage sharing.
 *   editor - shared user. Can edit content and manage attachments.
 *   viewer - shared user. Read-only.
 */

export type Role = "owner" | "editor" | "viewer";

export interface AccessInput {
  ownerId: string;
  userId: string | null;
  shareRole?: "viewer" | "editor" | null;
}

export interface Access {
  isOwner: boolean;
  role: Role | null;
  canView: boolean;
  canEdit: boolean;
  canManage: boolean;
}

export function resolveAccess({ ownerId, userId, shareRole }: AccessInput): Access {
  // No session -> no access, regardless of any share rows.
  if (!userId) {
    return { isOwner: false, role: null, canView: false, canEdit: false, canManage: false };
  }

  const isOwner = userId === ownerId;
  const role: Role | null = isOwner ? "owner" : (shareRole ?? null);

  return {
    isOwner,
    role,
    canView: role !== null,
    canEdit: role === "owner" || role === "editor",
    canManage: isOwner,
  };
}
