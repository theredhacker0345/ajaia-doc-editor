/**
 * Profile routes (mounted at /api/me):
 *
 *   GET   /api/me/profile - display profile + usage stats + recent documents
 *   PATCH /api/me/profile - update display name and profile fields
 *
 * Every field is sanitized server-side; the client re-renders from the
 * returned row so the UI can never drift from what is actually stored.
 */

import { Hono } from "hono";
import type { Context } from "hono";
import type { Env } from "../env";
import { sanitizeTitle, sanitizeProfileText, sanitizeWebsite } from "../validation";

interface ProfileRow {
  id: string;
  name: string;
  email: string;
  color: string;
  title: string;
  bio: string;
  location: string;
  website: string;
  created_at: string;
}

const profile = new Hono<Env>();

async function loadProfile(c: Context<Env>, id: string): Promise<ProfileRow | null> {
  return c.env.DB.prepare(
    `SELECT id, name, email, color, title, bio, location, website, created_at
     FROM users WHERE id = ?`
  )
    .bind(id)
    .first<ProfileRow>();
}

profile.get("/profile", async (c) => {
  const user = c.get("user");
  const me = await loadProfile(c, user.id);
  if (!me) return c.json({ error: "User not found." }, 404);

  // One round trip: five counters + the recent-documents list.
  const [owned, shared, grants, collabs, atts, recent] = await c.env.DB.batch([
    c.env.DB.prepare("SELECT COUNT(*) AS n FROM documents WHERE owner_id = ?").bind(user.id),
    c.env.DB.prepare("SELECT COUNT(*) AS n FROM document_access WHERE user_id = ?").bind(user.id),
    c.env.DB.prepare(
      `SELECT COUNT(*) AS n FROM document_access da
       JOIN documents d ON d.id = da.document_id WHERE d.owner_id = ?`
    ).bind(user.id),
    c.env.DB.prepare(
      `SELECT COUNT(DISTINCT da.user_id) AS n FROM document_access da
       JOIN documents d ON d.id = da.document_id
       WHERE d.owner_id = ? AND da.user_id != ?`
    ).bind(user.id, user.id),
    c.env.DB.prepare("SELECT COUNT(*) AS n FROM attachments WHERE uploaded_by = ?").bind(user.id),
    c.env.DB.prepare(
      `SELECT d.id, d.title, d.owner_id, u.name AS owner_name, u.color AS owner_color,
              d.created_at, d.updated_at
       FROM documents d JOIN users u ON u.id = d.owner_id
       WHERE d.owner_id = ? ORDER BY d.updated_at DESC LIMIT 5`
    ).bind(user.id),
  ]);

  const countOf = (r: { results?: unknown[] }) => {
    const row = r.results?.[0] as { n?: number } | undefined;
    return row?.n ?? 0;
  };

  return c.json({
    user: { id: me.id, name: me.name, email: me.email, color: me.color },
    profile: {
      title: me.title,
      bio: me.bio,
      location: me.location,
      website: me.website,
    },
    stats: {
      owned_docs: countOf(owned),
      shared_with_me: countOf(shared),
      grants_given: countOf(grants),
      collaborators: countOf(collabs),
      attachments: countOf(atts),
    },
    recent: recent.results ?? [],
    member_since: me.created_at,
  });
});

profile.patch("/profile", async (c) => {
  const user = c.get("user");
  const body = await c.req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return c.json({ error: "Nothing to update." }, 400);
  }

  const sets: string[] = [];
  const values: unknown[] = [];

  if (body.name !== undefined) {
    const name = sanitizeTitle(body.name);
    if (!name) return c.json({ error: "Name cannot be empty." }, 400);
    if (name.length > 60) return c.json({ error: "Name is limited to 60 characters." }, 400);
    sets.push("name = ?");
    values.push(name);
  }
  if (body.title !== undefined) {
    sets.push("title = ?");
    values.push(sanitizeProfileText(body.title, 80));
  }
  if (body.bio !== undefined) {
    sets.push("bio = ?");
    values.push(sanitizeProfileText(body.bio, 400));
  }
  if (body.location !== undefined) {
    sets.push("location = ?");
    values.push(sanitizeProfileText(body.location, 80));
  }
  if (body.website !== undefined) {
    const website = sanitizeWebsite(body.website);
    if (website === null) {
      return c.json({ error: "Website must be a valid URL (e.g. https://example.com)." }, 400);
    }
    sets.push("website = ?");
    values.push(website);
  }

  if (sets.length === 0) return c.json({ error: "Nothing to update." }, 400);

  await c.env.DB.prepare(`UPDATE users SET ${sets.join(", ")} WHERE id = ?`)
    .bind(...values, user.id)
    .run();

  const me = await loadProfile(c, user.id);
  if (!me) return c.json({ error: "User not found." }, 404);

  return c.json({
    user: { id: me.id, name: me.name, email: me.email, color: me.color },
    profile: { title: me.title, bio: me.bio, location: me.location, website: me.website },
  });
});

export default profile;
