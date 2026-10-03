/**
 * Public auth routes: list demo users, sign in (auto-provision new users),
 * sign out.
 *
 * Sign-in is protected by ALTCHA proof-of-work: the client must present a
 * freshly solved, server-signed challenge (base64 payload). Verified
 * challenges are recorded in a D1 replay ledger so no solution can ever be
 * reused. Session issuance lives in worker/auth.ts.
 */

import { Hono } from "hono";
import { setCookie, deleteCookie } from "hono/cookie";
import type { Env, UserRow } from "../env";
import { SESSION_COOKIE, createSessionToken } from "../auth";
import { verifyAltcha, type AltchaFailure } from "../altcha";
import { isValidEmail, nameFromEmail } from "../validation";
import { colorForEmail } from "../doc";

const ALTCHA_ERRORS: Record<AltchaFailure, string> = {
  malformed: "Human verification is missing or malformed - please retry.",
  algorithm: "Unsupported verification algorithm - please retry.",
  expired: "Human verification expired - please retry.",
  signature: "Human verification failed the signature check - please retry.",
  solution: "Human verification solution was incorrect - please retry.",
};

const auth = new Hono<Env>();

auth.get("/users", async (c) => {
  const { results } = await c.env.DB.prepare(
    "SELECT id, name, email, color FROM users ORDER BY created_at ASC LIMIT 50"
  ).all<UserRow>();
  return c.json({ users: results ?? [] });
});

auth.post("/login", async (c) => {
  const body = await c.req.json().catch(() => null);

  // 1. ALTCHA proof-of-work - reject bots before touching user data.
  const check = await verifyAltcha(body?.altcha, c.env.APP_SECRET);
  if (!check.ok) {
    return c.json(
      { error: ALTCHA_ERRORS[check.reason], code: `altcha_${check.reason}` },
      400
    );
  }

  // 2. Replay ledger - a solved challenge is single-use (batch: cleanup + insert).
  const now = Date.now();
  const [, seen] = await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM altcha_seen WHERE seen_at < ?").bind(now - 10 * 60_000),
    c.env.DB.prepare(
      "INSERT INTO altcha_seen (challenge, seen_at) VALUES (?, ?) ON CONFLICT (challenge) DO NOTHING"
    ).bind(check.challenge, now),
  ]);
  if ((seen.meta?.changes ?? 0) !== 1) {
    return c.json(
      { error: "This verification was already used - please request a new one.", code: "altcha_replay" },
      400
    );
  }

  // 3. Credentials (mock auth - no passwords, by assignment design).
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

  // 4. Issue the HMAC-signed session cookie.
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
