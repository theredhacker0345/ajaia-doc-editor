/**
 * Ajaia Docs - Worker entry point.
 *
 * Static assets (the built React SPA) are served by Cloudflare's assets
 * binding with SPA fallback; every /api/* request is routed to this Worker
 * first (run_worker_first in wrangler.jsonc).
 */

import { Hono } from "hono";
import type { Env } from "./env";
import { requireAuth } from "./auth";
import authRoutes from "./routes/auth";
import documentRoutes from "./routes/documents";
import attachmentRoutes, { documentAttachmentRoutes } from "./routes/attachments";

const app = new Hono<Env>();

app.onError((err, c) => {
  console.error("Unhandled error:", err);
  return c.json({ error: "Internal server error." }, 500);
});

app.get("/api/health", (c) =>
  c.json({ ok: true, service: "ajaia-docs", time: new Date().toISOString() })
);

// Auth routes are public; everything else under /api requires a valid session.
app.use("/api/*", async (c, next) => {
  if (c.req.path.startsWith("/api/auth/")) return next();
  return requireAuth(c, next);
});

app.notFound((c) => {
  if (c.req.path.startsWith("/api/")) return c.json({ error: "Not found." }, 404);
  return c.newResponse("Not found", 404);
});

app.route("/api/auth", authRoutes);
app.route("/api/documents", documentRoutes);
app.route("/api/documents", documentAttachmentRoutes);
app.route("/api/attachments", attachmentRoutes);

app.get("/api/me", (c) => c.json({ user: c.get("user") }));

export default app;
