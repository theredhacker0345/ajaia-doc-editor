/**
 * Ajaia Docs - Worker entry point.
 *
 * Static assets (the built React SPA) are served by Cloudflare's assets
 * binding with SPA fallback; every /api/* request is routed to this Worker
 * first (run_worker_first in wrangler.jsonc).
 *
 * Route map:
 *   /api/health                public
 *   /api/altcha/*              public (proof-of-work challenge)
 *   /api/auth/*                public (login / logout / demo users)
 *   /api/me, /api/me/profile   session-gated (profile lives in routes/profile.ts)
 *   /api/documents/*           session-gated
 *   /api/attachments/*         session-gated
 */

import { Hono } from "hono";
import type { Env } from "./env";
import { requireAuth } from "./auth";
import authRoutes from "./routes/auth";
import documentRoutes from "./routes/documents";
import attachmentRoutes, { documentAttachmentRoutes } from "./routes/attachments";
import altchaRoutes from "./routes/altcha";
import profileRoutes from "./routes/profile";

const app = new Hono<Env>();

app.onError((err, c) => {
  console.error("Unhandled error:", err);
  return c.json({ error: "Internal server error." }, 500);
});

/* Security headers on every API response (static assets get them via public/_headers). */
app.use("/api/*", async (c, next) => {
  await next();
  c.res.headers.set("X-Content-Type-Options", "nosniff");
  c.res.headers.set("X-Frame-Options", "DENY");
  c.res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  c.res.headers.set("Cache-Control", "no-store");
});

/* Public routes first: health + ALTCHA challenge must be reachable pre-auth. */
app.get("/api/health", async (c) => {
  // Report schema readiness so deployment/provisioning issues are visible
  // without authenticating (no user data is exposed).
  let tables: string[] = [];
  try {
    const { results } = await c.env.DB.prepare(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name IN
       ('users','documents','document_access','attachments','doc_versions','altcha_seen')`
    ).all<{ name: string }>();
    tables = (results ?? []).map((r) => r.name);
  } catch {
    return c.json({ ok: false, service: "ajaia-docs", db: "unreachable", time: new Date().toISOString() }, 503);
  }
  return c.json({
    ok: true,
    service: "ajaia-docs",
    db: { ready: tables.length >= 6, tables },
    time: new Date().toISOString(),
  });
});
app.route("/api/altcha", altchaRoutes);

/* Session gate for everything else under /api. */
app.use("/api/*", async (c, next) => {
  if (c.req.path.startsWith("/api/auth/")) return next();
  return requireAuth(c, next);
});

app.route("/api/auth", authRoutes);
app.route("/api/documents", documentRoutes);
app.route("/api/documents", documentAttachmentRoutes);
app.route("/api/attachments", attachmentRoutes);
app.route("/api/me", profileRoutes);
app.get("/api/me", (c) => c.json({ user: c.get("user") }));

app.notFound((c) => {
  if (c.req.path.startsWith("/api/")) return c.json({ error: "Not found." }, 404);
  return c.newResponse("Not found", 404);
});

export default app;
