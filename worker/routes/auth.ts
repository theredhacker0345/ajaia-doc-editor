/**
 * Public auth routes: list demo users, sign in (auto-provision new users),
 * sign out. Session issuance lives in worker/auth.ts.
 */

import { Hono } from "hono";
import { setCookie, deleteCookie } from "hono/cookie";
import type { Env, UserRow } from "../env";
import { SESSION_COOKIE, createSessionToken } from "../auth";
import { isValidEmail, nameFromEmail } from "../validation";
import { colorForEmail } from "../doc";

const auth = new Hono<Env>();

auth.get("/users", async (c) => {
  const { results } = await c.env.DB.prepare(
    "SELECT id, name, email, color FROM users ORDER BY created_at ASC LIMIT 50"
  ).all<UserRow>();
  return c.json({ users: results ?? [] });
});

auth.post("/login", async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!isValidEmail(body?.email)) {
    return c.json({ error: "A valid email address is required." }, 400);
  }
  const email = body.email.toLowerCase().trim();

  let user = await c.env.DB.prepare("SELECT id, name, email, color FROM users WHERE email = ?")
    .bind(email)
    .first<UserRow>();

  if (!user) {
    // Auto-provision: the share flow relies on any email being reachable.
    const name = typeof body?.name === "string" ? body.name.trim().slice(0, 60) : "";
    if (!name) {
      return c.json(
        { error: "No account with that email yet. Add a display name to create one." },
        404
      );
    }
    const id = crypto.randomUUID();
    const color = colorForEmail(email);
    await c.env.DB.prepare("INSERT INTO users (id, name, email, color) VALUES (?, ?, ?, ?)")
      .bind(id, name, email, color)
      .run();
    user = { id, name, email, color };
  }

  const token = await createSessionToken(user.id, c.env.APP_SECRET);
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "Lax",
    path: "/",
    maxAge: 7 * 24 * 60 * 60,
  });
  return c.json({ user });
});

auth.post("/logout", (c) => {
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
  return c.json({ ok: true });
});

export default auth;
