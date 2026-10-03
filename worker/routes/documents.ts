/**
 * Document CRUD + sharing routes. Every handler re-checks access via
 * resolveAccess() - permissions are never inferred from the client.
 */

import { Hono } from "hono";
import type { Context } from "hono";
import type { Env, ShareRoleRow, UserRow } from "../env";
import { resolveAccess } from "../permissions";
import {
  sanitizeTitle,
  isValidDocContent,
  isValidEmail,
  isShareRole,
  nameFromEmail,
} from "../validation";
import { EMPTY_DOC_CONTENT, colorForEmail } from "../doc";

interface DocMeta {
  id: string;
  title: string;
  owner_id: string;
  owner_name: string;
  owner_color: string;
  created_at: string;
  updated_at: string;
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

async function myShareRole(
  c: Context<Env>,
  documentId: string,
  userId: string
): Promise<"viewer" | "editor" | null> {
  const row = await c.env.DB.prepare(
    "SELECT role FROM document_access WHERE document_id = ? AND user_id = ?"
  )
    .bind(documentId, userId)
    .first<ShareRoleRow>();
  return row?.role ?? null;
}

/** GET /api/documents - owned + shared-with-me lists in one round trip. */
documents.get("/", async (c) => {
  const user = c.get("user");

  const owned = await c.env.DB.prepare(
    `SELECT d.id, d.title, d.owner_id, u.name AS owner_name, u.color AS owner_color,
            d.created_at, d.updated_at,
            (SELECT COUNT(*) FROM document_access da WHERE da.document_id = d.id) AS share_count
     FROM documents d JOIN users u ON u.id = d.owner_id
     WHERE d.owner_id = ?
     ORDER BY d.updated_at DESC`
  )
    .bind(user.id)
    .all();

  const shared = await c.env.DB.prepare(
    `SELECT d.id, d.title, d.owner_id, u.name AS owner_name, u.color AS owner_color,
            d.created_at, d.updated_at, da.role AS my_role
     FROM documents d
     JOIN users u ON u.id = d.owner_id
     JOIN document_access da ON da.document_id = d.id AND da.user_id = ?
     ORDER BY d.updated_at DESC`
  )
    .bind(user.id)
    .all();

  return c.json({ owned: owned.results ?? [], shared: shared.results ?? [] });
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

  return c.json({ document: { id, title } }, 201);
});

/** GET /api/documents/:id - detail incl. content, my role, shares (owner), attachments. */
documents.get("/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  const doc = await loadDocMeta(c, id);
  if (!doc) return c.json({ error: "Document not found." }, 404);

  const access = resolveAccess({
    ownerId: doc.owner_id,
    userId: user.id,
    shareRole: doc.owner_id === user.id ? null : await myShareRole(c, id, user.id),
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

  let shares: Array<{ user: UserRow; role: string; created_at: string }> = [];
  if (access.isOwner) {
    const { results } = await c.env.DB.prepare(
      `SELECT u.id, u.name, u.email, u.color, da.role, da.created_at
       FROM document_access da JOIN users u ON u.id = da.user_id
       WHERE da.document_id = ? ORDER BY da.created_at ASC`
    )
      .bind(id)
      .all<{ id: string; name: string; email: string; color: string; role: string; created_at: string }>();
    shares = (results ?? []).map((r) => ({
      user: { id: r.id, name: r.name, email: r.email, color: r.color },
      role: r.role,
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
    shareRole: doc.owner_id === user.id ? null : await myShareRole(c, id, user.id),
  });

  const body = await c.req.json().catch(() => null);
  if (!body || (body.title === undefined && body.content === undefined)) {
    return c.json({ error: "Nothing to update." }, 400);
  }

  const sets: string[] = [];
  const values: unknown[] = [];

  if (body.title !== undefined) {
    if (!access.isOwner) return c.json({ error: "Only the owner can rename a document." }, 403);
    const t = sanitizeTitle(body.title);
    if (!t) return c.json({ error: "Title cannot be empty." }, 400);
    sets.push("title = ?");
    values.push(t);
  }

  if (body.content !== undefined) {
    if (!access.canEdit) return c.json({ error: "You have view-only access to this document." }, 403);
    const contentStr = JSON.stringify(body.content ?? null);
    if (!isValidDocContent(contentStr)) return c.json({ error: "Invalid document content." }, 400);
    sets.push("content = ?");
    values.push(contentStr);
  }

  if (sets.length === 0) return c.json({ error: "Nothing to update." }, 400);

  sets.push("updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')");
  values.push(id);

  await c.env.DB.prepare(`UPDATE documents SET ${sets.join(", ")} WHERE id = ?`)
    .bind(...values)
    .run();

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
    c.env.DB.prepare("DELETE FROM document_access WHERE document_id = ?").bind(id),
    c.env.DB.prepare("DELETE FROM documents WHERE id = ?").bind(id),
  ]);

  return c.json({ ok: true });
});

/** POST /api/documents/:id/share - grant/update {email, role}. Owner only. */
documents.post("/:id/share", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  const doc = await loadDocMeta(c, id);
  if (!doc) return c.json({ error: "Document not found." }, 404);
  if (doc.owner_id !== user.id) {
    return c.json({ error: "Only the owner can manage sharing." }, 403);
  }

  const body = await c.req.json().catch(() => null);
  if (!isValidEmail(body?.email)) return c.json({ error: "Enter a valid email address." }, 400);
  if (!isShareRole(body?.role)) return c.json({ error: "Role must be 'viewer' or 'editor'." }, 400);

  const email = body.email.toLowerCase().trim();
  const role: "viewer" | "editor" = body.role;

  let target = await c.env.DB.prepare("SELECT id, name, email, color FROM users WHERE email = ?")
    .bind(email)
    .first<UserRow>();
  let created = false;

  if (!target) {
    // Auto-provision the recipient so the share flow never dead-ends.
    const newId = crypto.randomUUID();
    await c.env.DB.prepare("INSERT INTO users (id, name, email, color) VALUES (?, ?, ?, ?)")
      .bind(newId, nameFromEmail(email), email, colorForEmail(email))
      .run();
    target = { id: newId, name: nameFromEmail(email), email, color: colorForEmail(email) };
    created = true;
  }

  if (target.id === doc.owner_id) {
    return c.json({ error: "The owner already has full access." }, 400);
  }

  await c.env.DB.prepare(
    `INSERT INTO document_access (id, document_id, user_id, role)
     VALUES (?, ?, ?, ?)
     ON CONFLICT (document_id, user_id) DO UPDATE SET role = excluded.role`
  )
    .bind(crypto.randomUUID(), id, target.id, role)
    .run();

  await c.env.DB.prepare(
    "UPDATE documents SET updated_at = updated_at WHERE id = ?"
  ).bind(id).run();

  return c.json({ share: { user: target, role }, created });
});

/** GET /api/documents/:id/shares - list people with access. Owner only. */
documents.get("/:id/shares", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  const doc = await loadDocMeta(c, id);
  if (!doc) return c.json({ error: "Document not found." }, 404);
  if (doc.owner_id !== user.id) {
    return c.json({ error: "Only the owner can view the sharing list." }, 403);
  }

  const { results } = await c.env.DB.prepare(
    `SELECT u.id, u.name, u.email, u.color, da.role, da.created_at
     FROM document_access da JOIN users u ON u.id = da.user_id
     WHERE da.document_id = ? ORDER BY da.created_at ASC`
  )
    .bind(id)
    .all<{ id: string; name: string; email: string; color: string; role: string; created_at: string }>();

  return c.json({
    shares: (results ?? []).map((r) => ({
      user: { id: r.id, name: r.name, email: r.email, color: r.color },
      role: r.role,
      created_at: r.created_at,
    })),
  });
});

/** DELETE /api/documents/:id/share/:userId - revoke access. Owner only. */
documents.delete("/:id/share/:userId", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const targetUserId = c.req.param("userId");

  const doc = await loadDocMeta(c, id);
  if (!doc) return c.json({ error: "Document not found." }, 404);
  if (doc.owner_id !== user.id) {
    return c.json({ error: "Only the owner can manage sharing." }, 403);
  }

  await c.env.DB.prepare("DELETE FROM document_access WHERE document_id = ? AND user_id = ?")
    .bind(id, targetUserId)
    .run();

  return c.json({ ok: true });
});

export default documents;
