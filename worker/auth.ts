/**
 * Mock-auth session handling.
 *
 * The assignment explicitly allows simulated users / mocked auth. Sessions are
 * HMAC-SHA256 signed cookies (userId + expiry + signature) - lightweight but a
 * real mechanism, not a hardcoded userId header.
 *
 * Swapping in real auth later means replacing `requireAuth` only; every route
 * already relies on `c.get("user")`.
 */

import { Context, Next } from "hono";
import { getCookie } from "hono/cookie";
import type { Env, UserRow } from "./env";

export const SESSION_COOKIE = "ajaia_session";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function toHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function hmac(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return toHex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload)));
}

/** Constant-time string compare to avoid trivial signature oracle behavior. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function createSessionToken(userId: string, secret: string): Promise<string> {
  const payload = `${userId}.${Date.now() + SESSION_TTL_MS}`;
  return `${payload}.${await hmac(payload, secret)}`;
}

export async function verifySessionToken(
  token: string | undefined,
  secret: string
): Promise<string | null> {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [userId, exp, sig] = parts;
  const expMs = Number(exp);
  if (!Number.isFinite(expMs) || expMs < Date.now()) return null;
  const expected = await hmac(`${userId}.${exp}`, secret);
  return timingSafeEqual(expected, sig) ? userId : null;
}

/** Hono middleware: resolves the session cookie into `c.set("user", ...)`. */
export async function requireAuth(c: Context<Env>, next: Next) {
  const userId = await verifySessionToken(getCookie(c, SESSION_COOKIE), c.env.APP_SECRET);
  if (!userId) return c.json({ error: "Please sign in to continue." }, 401);

  const user = await c.env.DB.prepare("SELECT id, name, email, color FROM users WHERE id = ?")
    .bind(userId)
    .first<UserRow>();
  if (!user) return c.json({ error: "Please sign in to continue." }, 401);

  c.set("user", user);
  await next();
}
