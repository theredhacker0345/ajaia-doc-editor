/**
 * Attachment routes. Files up to 2 MB are stored as BLOBs in D1 (scope choice,
 * documented in ARCHITECTURE.md - a production build would move this to R2).
 *
 * Document-scoped endpoints live on `documentAttachmentRoutes` (mounted at
 * /api/documents); file-scoped endpoints on `attachmentRoutes` (/api/attachments):
 *
 *   POST   /api/documents/:id/attachments   upload (owner/editor)
 *   GET    /api/documents/:id/attachments   list (anyone with view access)
 *   GET    /api/attachments/:id/download    download (anyone with view access)
 *   DELETE /api/attachments/:id             owner or original uploader
 */

import { Hono } from "hono";
import type { Context } from "hono";
import type { Env } from "../env";
import { resolveAccess, type ShareGrant } from "../permissions";
import { checkAttachment, sanitizeFilename } from "../validation";

interface GrantRow {
  role: "viewer" | "editor";
  can_share: number;
  expires_at: string | null;
}

async function myGrant(
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

async function resolveDocAccess(c: Context<Env>, documentId: string) {
  const user = c.get("user");
  const doc = await c.env.DB.prepare("SELECT id, owner_id FROM documents WHERE id = ?")
    .bind(documentId)
    .first<{ id: string; owner_id: string }>();
  if (!doc) return null;

  return {
    user,
    access: resolveAccess({
      ownerId: doc.owner_id,
      userId: user.id,
      share: doc.owner_id === user.id ? null : await myGrant(c, documentId, user.id),
    }),
  };
}

/** POST /api/documents/:id/attachments (multipart, field name: "file") */
async function upload(c: Context<Env>) {
  const documentId = c.req.param("id") ?? "";
  const resolved = await resolveDocAccess(c, documentId);
  if (!resolved) return c.json({ error: "Document not found." }, 404);
  if (!resolved.access.canEdit) {
    return c.json({ error: "You cannot attach files to this document." }, 403);
  }

  const form = await c.req.parseBody().catch(() => null);
  const file = form?.file;
  if (!(file instanceof File)) {
    return c.json({ error: "Missing 'file' field in the upload." }, 400);
  }

  const check = checkAttachment(file.name, file.size);
  if (!check.ok) return c.json({ error: check.error }, 400);

  const bytes = new Uint8Array(await file.arrayBuffer());
  const id = crypto.randomUUID();
  const filename = sanitizeFilename(file.name);

  await c.env.DB.prepare(
    `INSERT INTO attachments (id, document_id, filename, mime, size, data, uploaded_by)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(id, documentId, filename, file.type || "application/octet-stream", file.size, bytes, resolved.user.id)
    .run();

  return c.json(
    {
      attachment: {
        id,
        filename,
        mime: file.type || "application/octet-stream",
        size: file.size,
        uploaded_by: resolved.user.id,
      },
    },
    201
  );
}

/** GET /api/documents/:id/attachments */
async function listForDocument(c: Context<Env>) {
  const documentId = c.req.param("id") ?? "";
  const resolved = await resolveDocAccess(c, documentId);
  if (!resolved) return c.json({ error: "Document not found." }, 404);
  if (!resolved.access.canView) {
    return c.json({ error: "You do not have access to this document." }, 403);
  }

  const { results } = await c.env.DB.prepare(
    `SELECT id, filename, mime, size, uploaded_by, created_at
     FROM attachments WHERE document_id = ? ORDER BY created_at DESC`
  )
    .bind(documentId)
    .all();

  return c.json({ attachments: results ?? [] });
}

export const documentAttachmentRoutes = new Hono<Env>();
documentAttachmentRoutes.post("/:id/attachments", upload);
documentAttachmentRoutes.get("/:id/attachments", listForDocument);

/* ---------- file-scoped routes (mounted at /api/attachments) ---------- */

const attachmentRoutes = new Hono<Env>();

/** D1 returns BLOB values as plain number arrays / ArrayBuffers - normalize to bytes. */
function toBytes(data: unknown): Uint8Array {
  if (data instanceof Uint8Array) return data;
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (Array.isArray(data)) return new Uint8Array(data);
  return new Uint8Array(Object.values(data as Record<string, number>));
}

/** GET /api/attachments/:id/download */
attachmentRoutes.get("/:id/download", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  const row = await c.env.DB.prepare(
    `SELECT a.id, a.filename, a.mime, a.data, d.id AS doc_id, d.owner_id AS doc_owner
     FROM attachments a JOIN documents d ON d.id = a.document_id
     WHERE a.id = ?`
  )
    .bind(id)
    .first<{
      id: string;
      filename: string;
      mime: string;
      data: ArrayBuffer;
      doc_id: string;
      doc_owner: string;
    }>();

  if (!row) return c.json({ error: "Attachment not found." }, 404);

  const access = resolveAccess({
    ownerId: row.doc_owner,
    userId: user.id,
    share: row.doc_owner === user.id ? null : await myGrant(c, row.doc_id, user.id),
  });
  if (!access.canView) return c.json({ error: "You do not have access to this file." }, 403);

  return new Response(toBytes(row.data), {
    headers: {
      "Content-Type": row.mime,
      "Content-Disposition": `attachment; filename="${row.filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
});

/** DELETE /api/attachments/:id */
attachmentRoutes.delete("/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  const row = await c.env.DB.prepare(
    `SELECT a.uploaded_by, d.owner_id AS doc_owner
     FROM attachments a JOIN documents d ON d.id = a.document_id
     WHERE a.id = ?`
  )
    .bind(id)
    .first<{ uploaded_by: string; doc_owner: string }>();

  if (!row) return c.json({ error: "Attachment not found." }, 404);

  const isDocOwner = row.doc_owner === user.id;
  const isUploader = row.uploaded_by === user.id;
  if (!isDocOwner && !isUploader) {
    return c.json({ error: "Only the document owner or the uploader can remove this file." }, 403);
  }

  await c.env.DB.prepare("DELETE FROM attachments WHERE id = ?").bind(id).run();
  return c.json({ ok: true });
});

export default attachmentRoutes;
