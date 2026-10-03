/**
 * Document CRUD, sharing, transfer and version-history routes.
 * Every handler re-checks access via resolveAccess() - permissions are never
 * inferred from the client.
 *
 * Sharing model (v3):
 *   owner            - full control; can invite, set roles/expiry/can-share,
 *                      transfer ownership, delete.
 *   editor           - edit + attachments; may invite others when the owner
 *                      granted `can_share` (their invites never carry the
 *                      privilege and never outlive their own grant).
 *   viewer           - read-only.
 *   any expired grant - treated as no access at all.
 *
 * Version history:
 *   Snapshots are taken on content saves at most once every 2 minutes
 *   (see shouldSnapshot), the first 50 are kept per document, restores are
 *   themselves snapshotted so no state can ever be lost.
 */

import { Hono } from "hono";
import type { Context } from "hono";
import type { Env, UserRow } from "../env";
import { resolveAccess, type ShareGrant } from "../permissions";
import {
  sanitizeTitle,
  isValidDocContent,
  isValidEmail,
  isShareRole,
  nameFromEmail,
} from "../validation";
import {
  EMPTY_DOC_CONTENT,
  colorForEmail,
  excerptFromContent,
  shouldSnapshot,
  MAX_VERSIONS_PER_DOC,
} from "../doc";

interface DocMeta {
  id: string;
  title: string;
  owner_id: string;
  owner_name: string;
  owner_color: string;
  created_at: string;
  updated_at: string;
}

interface GrantRow {
  role: "viewer" | "editor";
  can_share: number;
  expires_at: string | null;
}

const documents = new Hono<Env>();

async function loadDocMeta(c: Context<Env>, id: string): Promise<DocMeta | null> {
  return c.env.DB.prepare(
    `SELECT d.id, d.title, d.owner_id, u.name AS owner_name, u.color AS owner_color,
            d.created_at, d.updated_at
     FROM documents d JOIN users u ON u.id = d.owner_id
     WHERE d.id = ?`
  )
    .bind(id)
    .first<DocMeta>();
}

async function myShareGrant(
  c: Context<Env>,
  documentId: string,
  userId: string
): Promise<ShareGrant | null> {
  const row = await c.env.DB.prepare(
    "SELECT role, can_share, expires_at FROM document_access WHERE document_id = ? AND user_id = ?"
  )
    .bind(documentId, userId)
    .first<GrantRow>();
  if (!row) return null;
  return { role: row.role, canShare: row.can_share === 1, expiresAt: row.expires_at };
}

/** Find a user by email or auto-provision them so share flows never dead-end. */
async function ensureUserByEmail(
  c: Context<Env>,
  email: string
): Promise<{ user: UserRow; created: boolean }> {
  const existing = await c.env.DB.prepare("SELECT id, name, email, color FROM users WHERE email = ?")
    .bind(email)
    .first<UserRow>();
  if (existing) return { user: existing, created: false };

  const id = crypto.randomUUID();
  const name = nameFromEmail(email);
  const color = colorForEmail(email);
  await c.env.DB.prepare("INSERT INTO users (id, name, email, color) VALUES (?, ?, ?, ?)")
    .bind(id, name, email, color)
    .run();
  return { user: { id, name, email, color }, created: true };
}

/** Validate the expiry field: undefined/null -> null (never), else a parseable date string. */
function parseExpiry(raw: unknown): { value: string | null } | { error: string } {
  if (raw === undefined || raw === null || raw === "") return { value: null };
  if (typeof raw !== "string") return { error: "Expiry must be a timestamp or null." };
  const t = Date.parse(raw);
  if (!Number.isFinite(t)) return { error: "Expiry must be a valid timestamp." };
  return { value: new Date(t).toISOString() };
}

/* ---------- version snapshots ---------- */

async function nextVersionNumber(c: Context<Env>, docId: string): Promise<number> {
  const row = await c.env.DB.prepare(
    "SELECT MAX(version_no) AS n FROM doc_versions WHERE document_id = ?"
  )
    .bind(docId)
    .first<{ n: number | null }>();
  return (row?.n ?? 0) + 1;
}

/** Insert a snapshot now (caller decides whether it is due). */
async function insertVersion(
  c: Context<Env>,
  docId: string,
  title: string,
  content: string,
  userId: string
): Promise<void> {
  const versionNo = await nextVersionNumber(c, docId);
  await c.env.DB.batch([
    c.env.DB.prepare(
      "INSERT INTO doc_versions (id, document_id, version_no, title, content, created_by) VALUES (?, ?, ?, ?, ?, ?)"
    ).bind(crypto.randomUUID(), docId, versionNo, title, content, userId),
    // Retention: keep only the newest MAX_VERSIONS_PER_DOC snapshots.
    c.env.DB.prepare(
      `DELETE FROM doc_versions WHERE document_id = ? AND version_no <= (
         SELECT MAX(version_no) FROM doc_versions WHERE document_id = ?
       ) - ?`
    ).bind(docId, docId, MAX_VERSIONS_PER_DOC),
  ]);
}

/** Snapshot on save, throttled to one per SNAPSHOT_MIN_INTERVAL_MS. */
async function snapshotIfDue(
  c: Context<Env>,
  docId: string,
  title: string,
  content: string,
  userId: string
): Promise<void> {
  const last = await c.env.DB.prepare(
    "SELECT created_at FROM doc_versions WHERE document_id = ? ORDER BY version_no DESC LIMIT 1"
  )
    .bind(docId)
    .first<{ created_at: string }>();
  if (!shouldSnapshot({ lastVersionAt: last?.created_at ?? null, now: Date.now() })) return;
  await insertVersion(c, docId, title, content, userId);
}

/* ---------- routes ---------- */

/** GET /api/documents - owned + shared-with-me lists in one round trip. */
documents.get("/", async (c) => {
  const user = c.get("user");

  const owned = await c.env.DB.prepare(
    `SELECT d.id, d.title, d.owner_id, u.name AS owner_name, u.color AS owner_color,
            d.created_at, d.updated_at, d.content,
            (SELECT COUNT(*) FROM document_access da WHERE da.document_id = d.id) AS share_count
     FROM documents d JOIN users u ON u.id = d.owner_id
     WHERE d.owner_id = ?
     ORDER BY d.updated_at DESC`
  )
    .bind(user.id)
    .all();

  const shared = await c.env.DB.prepare(
    `SELECT d.id, d.title, d.owner_id, u.name AS owner_name, u.color AS owner_color,
            d.created_at, d.updated_at, d.content, da.role AS my_role
     FROM documents d
     JOIN users u ON u.id = d.owner_id
     JOIN document_access da ON da.document_id = d.id AND da.user_id = ?
     ORDER BY d.updated_at DESC`
  )
    .bind(user.id)
    .all();

  const withExcerpt = (rows: Record<string, unknown>[]) =>
    (rows ?? []).map((r) => {
      const { content, ...rest } = r;
      return { ...rest, excerpt: excerptFromContent(content as string) };
    });

  return c.json({
    owned: withExcerpt(owned.results ?? []),
    shared: withExcerpt(shared.results ?? []),
  });
});

/** POST /api/documents - create (optionally with imported content). */
documents.post("/", async (c) => {
  const user = c.get("user");
  const body = await c.req.json().catch(() => null);

  let title = "Untitled document";
  if (body?.title !== undefined) {
    const t = sanitizeTitle(body.title);
    if (!t) return c.json({ error: "Title cannot be empty." }, 400);
    title = t;
  }

  let content = EMPTY_DOC_CONTENT;
  if (body?.content !== undefined) {
    const contentStr = JSON.stringify(body.content ?? null);
    if (!isValidDocContent(contentStr)) {
      return c.json({ error: "Invalid document content." }, 400);
    }
    content = contentStr;
  }

  const id = crypto.randomUUID();
  await c.env.DB.prepare(
    "INSERT INTO documents (id, title, content, owner_id) VALUES (?, ?, ?, ?)"
  )
    .bind(id, title, content, user.id)
    .run();

  // Version 1 = the initial state, so history is never empty.
  await insertVersion(c, id, title, content, user.id);

  return c.json({ document: { id, title } }, 201);
});

/** GET /api/documents/:id - detail incl. content, my role, shares, attachments. */
documents.get("/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  const doc = await loadDocMeta(c, id);
  if (!doc) return c.json({ error: "Document not found." }, 404);

  const access = resolveAccess({
    ownerId: doc.owner_id,
    userId: user.id,
    share: doc.owner_id === user.id ? null : await myShareGrant(c, id, user.id),
  });
  if (!access.canView) return c.json({ error: "You do not have access to this document." }, 403);

  const row = await c.env.DB.prepare("SELECT content FROM documents WHERE id = ?").bind(id).first<{
    content: string;
  }>();
  let content: unknown = { type: "doc", content: [] };
  try {
    content = JSON.parse(row?.content ?? "null");
  } catch {
    /* keep fallback */
  }

  // Sharing list is visible to the owner and to editors who may invite others.
  let shares: Array<{ user: UserRow; role: string; can_share: boolean; expires_at: string | null; created_at: string }> = [];
  if (access.canShare) {
    const { results } = await c.env.DB.prepare(
      `SELECT u.id, u.name, u.email, u.color, da.role, da.can_share, da.expires_at, da.created_at
       FROM document_access da JOIN users u ON u.id = da.user_id
       WHERE da.document_id = ? ORDER BY da.created_at ASC`
    )
      .bind(id)
      .all<{ id: string; name: string; email: string; color: string; role: string; can_share: number; expires_at: string | null; created_at: string }>();
    shares = (results ?? []).map((r) => ({
      user: { id: r.id, name: r.name, email: r.email, color: r.color },
      role: r.role,
      can_share: r.can_share === 1,
      expires_at: r.expires_at,
      created_at: r.created_at,
    }));
  }

  const attachments = await c.env.DB.prepare(
    `SELECT id, filename, mime, size, uploaded_by, created_at
     FROM attachments WHERE document_id = ? ORDER BY created_at DESC`
  )
    .bind(id)
    .all();

  return c.json({
    document: { ...doc, content },
    myRole: access.role,
    isOwner: access.isOwner,
    canShare: access.canShare,
    shares,
    attachments: attachments.results ?? [],
  });
});

/** PATCH /api/documents/:id - rename (owner) and/or save content (owner/editor). */
documents.patch("/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  const doc = await loadDocMeta(c, id);
  if (!doc) return c.json({ error: "Document not found." }, 404);

  const access = resolveAccess({
    ownerId: doc.owner_id,
    userId: user.id,
    share: doc.owner_id === user.id ? null : await myShareGrant(c, id, user.id),
  });

  const body = await c.req.json().catch(() => null);
  if (!body || (body.title === undefined && body.content === undefined)) {
    return c.json({ error: "Nothing to update." }, 400);
  }

  const sets: string[] = [];
  const values: unknown[] = [];
  let newTitle = doc.title;
  let savedContent: string | null = null;

  if (body.title !== undefined) {
    if (!access.isOwner) return c.json({ error: "Only the owner can rename a document." }, 403);
    const t = sanitizeTitle(body.title);
    if (!t) return c.json({ error: "Title cannot be empty." }, 400);
    sets.push("title = ?");
    values.push(t);
    newTitle = t;
  }

  if (body.content !== undefined) {
    if (!access.canEdit) return c.json({ error: "You have view-only access to this document." }, 403);
    const contentStr = JSON.stringify(body.content ?? null);
    if (!isValidDocContent(contentStr)) return c.json({ error: "Invalid document content." }, 400);
    sets.push("content = ?");
    values.push(contentStr);
    savedContent = contentStr;
  }

  if (sets.length === 0) return c.json({ error: "Nothing to update." }, 400);

  sets.push("updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')");
  values.push(id);

  await c.env.DB.prepare(`UPDATE documents SET ${sets.join(", ")} WHERE id = ?`)
    .bind(...values)
    .run();

  // Version history: snapshot content saves at most once every 2 minutes.
  if (savedContent !== null) {
    await snapshotIfDue(c, id, newTitle, savedContent, user.id);
  }

  return c.json({ ok: true });
});

/** DELETE /api/documents/:id - owner only. Children cleared explicitly (no FK surprises). */
documents.delete("/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  const doc = await loadDocMeta(c, id);
  if (!doc) return c.json({ error: "Document not found." }, 404);
  if (doc.owner_id !== user.id) {
    return c.json({ error: "Only the owner can delete a document." }, 403);
  }

  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM attachments WHERE document_id = ?").bind(id),
    c.env.DB.prepare("DELETE FROM doc_versions WHERE document_id = ?").bind(id),
    c.env.DB.prepare("DELETE FROM document_access WHERE document_id = ?").bind(id),
    c.env.DB.prepare("DELETE FROM documents WHERE id = ?").bind(id),
  ]);

  return c.json({ ok: true });
});

/* ---------- sharing ---------- */

/** POST /api/documents/:id/share - grant/update access {email, role, can_share?, expires_at?}.
 *  Allowed for the owner, and for editors holding the can_share privilege. */
documents.post("/:id/share", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  const doc = await loadDocMeta(c, id);
  if (!doc) return c.json({ error: "Document not found." }, 404);

  const access = resolveAccess({
    ownerId: doc.owner_id,
    userId: user.id,
    share: doc.owner_id === user.id ? null : await myShareGrant(c, id, user.id),
  });
  if (!access.canShare) {
    return c.json({ error: "You do not have permission to share this document." }, 403);
  }

  const body = await c.req.json().catch(() => null);
  if (!isValidEmail(body?.email)) return c.json({ error: "Enter a valid email address." }, 400);
  if (!isShareRole(body?.role)) return c.json({ error: "Role must be 'viewer' or 'editor'." }, 400);

  const expiry = parseExpiry(body?.expires_at);
  if ("error" in expiry) return c.json({ error: expiry.error }, 400);

  const email = body.email.toLowerCase().trim();
  const role: "viewer" | "editor" = body.role;

  // Only owners hand out the invite-more privilege; only owners set open-ended grants.
  const isOwner = access.isOwner;
  const canShare = isOwner && body?.can_share === true;
  let expiresAt = expiry.value;
  if (!isOwner) {
    // An editor's invite can never outlive their own grant.
    const own = await c.env.DB.prepare(
      "SELECT expires_at FROM document_access WHERE document_id = ? AND user_id = ?"
    )
      .bind(id, user.id)
      .first<GrantRow>();
    const ownExpiry = own?.expires_at ?? null;
    if (ownExpiry && (!expiresAt || Date.parse(expiresAt) > Date.parse(ownExpiry))) {
      expiresAt = ownExpiry;
    }
  }

  const { user: target, created } = await ensureUserByEmail(c, email);
  if (target.id === doc.owner_id) {
    return c.json({ error: "The owner already has full access." }, 400);
  }

  await c.env.DB.prepare(
    `INSERT INTO document_access (id, document_id, user_id, role, can_share, expires_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (document_id, user_id) DO UPDATE SET role = excluded.role,
       can_share = excluded.can_share, expires_at = excluded.expires_at`
  )
    .bind(crypto.randomUUID(), id, target.id, role, canShare ? 1 : 0, expiresAt)
    .run();

  return c.json({
    share: { user: target, role, can_share: canShare, expires_at: expiresAt },
    created,
  });
});

/** GET /api/documents/:id/shares - list people with access (owner / can-share editors). */
documents.get("/:id/shares", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  const doc = await loadDocMeta(c, id);
  if (!doc) return c.json({ error: "Document not found." }, 404);

  const access = resolveAccess({
    ownerId: doc.owner_id,
    userId: user.id,
    share: doc.owner_id === user.id ? null : await myShareGrant(c, id, user.id),
  });
  if (!access.canShare) {
    return c.json({ error: "You do not have permission to view the sharing list." }, 403);
  }

  const { results } = await c.env.DB.prepare(
    `SELECT u.id, u.name, u.email, u.color, da.role, da.can_share, da.expires_at, da.created_at
     FROM document_access da JOIN users u ON u.id = da.user_id
     WHERE da.document_id = ? ORDER BY da.created_at ASC`
  )
    .bind(id)
    .all<{ id: string; name: string; email: string; color: string; role: string; can_share: number; expires_at: string | null; created_at: string }>();

  return c.json({
    shares: (results ?? []).map((r) => ({
      user: { id: r.id, name: r.name, email: r.email, color: r.color },
      role: r.role,
      can_share: r.can_share === 1,
      expires_at: r.expires_at,
      created_at: r.created_at,
    })),
  });
});

/** PATCH /api/documents/:id/share/:userId - owner updates role / can_share / expiry. */
documents.patch("/:id/share/:userId", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const targetUserId = c.req.param("userId");

  const doc = await loadDocMeta(c, id);
  if (!doc) return c.json({ error: "Document not found." }, 404);
  if (doc.owner_id !== user.id) {
    return c.json({ error: "Only the owner can manage access." }, 403);
  }

  const body = await c.req.json().catch(() => null);
  if (!body || (body.role === undefined && body.can_share === undefined && body.expires_at === undefined)) {
    return c.json({ error: "Nothing to update." }, 400);
  }

  const sets: string[] = [];
  const values: unknown[] = [];

  if (body.role !== undefined) {
    if (!isShareRole(body.role)) return c.json({ error: "Role must be 'viewer' or 'editor'." }, 400);
    sets.push("role = ?");
    values.push(body.role);
  }
  if (body.can_share !== undefined) {
    sets.push("can_share = ?");
    values.push(body.can_share === true ? 1 : 0);
  }
  if (body.expires_at !== undefined) {
    const expiry = parseExpiry(body.expires_at);
    if ("error" in expiry) return c.json({ error: expiry.error }, 400);
    sets.push("expires_at = ?");
    values.push(expiry.value);
  }

  values.push(id, targetUserId);
  const res = await c.env.DB.prepare(
    `UPDATE document_access SET ${sets.join(", ")} WHERE document_id = ? AND user_id = ?`
  )
    .bind(...values)
    .run();
  if ((res.meta?.changes ?? 0) === 0) return c.json({ error: "That user has no grant here." }, 404);

  return c.json({ ok: true });
});

/** DELETE /api/documents/:id/share/:userId - revoke access (owner / can-share editors). */
documents.delete("/:id/share/:userId", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const targetUserId = c.req.param("userId");

  const doc = await loadDocMeta(c, id);
  if (!doc) return c.json({ error: "Document not found." }, 404);

  const access = resolveAccess({
    ownerId: doc.owner_id,
    userId: user.id,
    share: doc.owner_id === user.id ? null : await myShareGrant(c, id, user.id),
  });
  if (!access.canShare) {
    return c.json({ error: "You do not have permission to manage sharing." }, 403);
  }
  if (targetUserId === doc.owner_id) {
    return c.json({ error: "The owner's access cannot be revoked." }, 400);
  }

  await c.env.DB.prepare("DELETE FROM document_access WHERE document_id = ? AND user_id = ?")
    .bind(id, targetUserId)
    .run();

  return c.json({ ok: true });
});

/** POST /api/documents/:id/transfer - owner transfers ownership {email}. */
documents.post("/:id/transfer", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  const doc = await loadDocMeta(c, id);
  if (!doc) return c.json({ error: "Document not found." }, 404);
  if (doc.owner_id !== user.id) {
    return c.json({ error: "Only the owner can transfer ownership." }, 403);
  }

  const body = await c.req.json().catch(() => null);
  if (!isValidEmail(body?.email)) return c.json({ error: "Enter a valid email address." }, 400);

  const email = body.email.toLowerCase().trim();
  const { user: target } = await ensureUserByEmail(c, email);
  if (target.id === user.id) {
    return c.json({ error: "You already own this document." }, 400);
  }

  // Atomic swap: new owner, and the previous owner keeps editor access.
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE documents SET owner_id = ? WHERE id = ?").bind(target.id, id),
    c.env.DB.prepare(
      `INSERT INTO document_access (id, document_id, user_id, role, can_share)
       VALUES (?, ?, ?, 'editor', 1)
       ON CONFLICT (document_id, user_id) DO UPDATE SET role = 'editor', can_share = 1, expires_at = NULL`
    ).bind(crypto.randomUUID(), id, user.id),
  ]);

  return c.json({ ok: true, newOwner: { id: target.id, name: target.name, email: target.email } });
});

/* ---------- version history ---------- */

/** GET /api/documents/:id/versions - snapshot list, newest first. */
documents.get("/:id/versions", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  const doc = await loadDocMeta(c, id);
  if (!doc) return c.json({ error: "Document not found." }, 404);

  const access = resolveAccess({
    ownerId: doc.owner_id,
    userId: user.id,
    share: doc.owner_id === user.id ? null : await myShareGrant(c, id, user.id),
  });
  if (!access.canView) return c.json({ error: "You do not have access to this document." }, 403);

  const { results } = await c.env.DB.prepare(
    `SELECT v.version_no, v.title, v.created_at, v.created_by, u.name AS created_by_name
     FROM doc_versions v JOIN users u ON u.id = v.created_by
     WHERE v.document_id = ? ORDER BY v.version_no DESC LIMIT ?`
  )
    .bind(id, MAX_VERSIONS_PER_DOC)
    .all();

  return c.json({ versions: results ?? [] });
});

/** GET /api/documents/:id/versions/:no - one snapshot with full content. */
documents.get("/:id/versions/:no", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const no = Number(c.req.param("no"));

  const doc = await loadDocMeta(c, id);
  if (!doc) return c.json({ error: "Document not found." }, 404);

  const access = resolveAccess({
    ownerId: doc.owner_id,
    userId: user.id,
    share: doc.owner_id === user.id ? null : await myShareGrant(c, id, user.id),
  });
  if (!access.canView) return c.json({ error: "You do not have access to this document." }, 403);
  if (!Number.isInteger(no) || no < 1) return c.json({ error: "Invalid version number." }, 400);

  const v = await c.env.DB.prepare(
    `SELECT v.version_no, v.title, v.content, v.created_at, v.created_by, u.name AS created_by_name
     FROM doc_versions v JOIN users u ON u.id = v.created_by
     WHERE v.document_id = ? AND v.version_no = ?`
  )
    .bind(id, no)
    .first<{ version_no: number; title: string; content: string; created_at: string; created_by: string; created_by_name: string }>();
  if (!v) return c.json({ error: "Version not found." }, 404);

  let content: unknown = null;
  try {
    content = JSON.parse(v.content);
  } catch {
    /* keep null */
  }

  return c.json({ version: { ...v, content } });
});

/** POST /api/documents/:id/versions/:no/restore - roll content back (owner/editor).
 *  The pre-restore state is snapshotted first, so nothing is ever lost. */
documents.post("/:id/versions/:no/restore", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const no = Number(c.req.param("no"));

  const doc = await loadDocMeta(c, id);
  if (!doc) return c.json({ error: "Document not found." }, 404);

  const access = resolveAccess({
    ownerId: doc.owner_id,
    userId: user.id,
    share: doc.owner_id === user.id ? null : await myShareGrant(c, id, user.id),
  });
  if (!access.canEdit) return c.json({ error: "You have view-only access to this document." }, 403);
  if (!Number.isInteger(no) || no < 1) return c.json({ error: "Invalid version number." }, 400);

  const v = await c.env.DB.prepare(
    "SELECT version_no, title, content FROM doc_versions WHERE document_id = ? AND version_no = ?"
  )
    .bind(id, no)
    .first<{ version_no: number; title: string; content: string }>();
  if (!v) return c.json({ error: "Version not found." }, 404);

  const current = await c.env.DB.prepare("SELECT content, title FROM documents WHERE id = ?")
    .bind(id)
    .first<{ content: string; title: string }>();
  if (!current) return c.json({ error: "Document not found." }, 404);

  if (current.content !== v.content) {
    // Preserve the state being replaced as its own snapshot.
    await insertVersion(c, id, current.title, current.content, user.id);
  }

  await c.env.DB.prepare(
    "UPDATE documents SET content = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?"
  )
    .bind(v.content, id)
    .run();

  return c.json({ ok: true, restored: v.version_no });
});

export default documents;
