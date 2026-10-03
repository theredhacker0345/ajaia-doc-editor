/**
 * ALTCHA routes (public - reachable before sign-in).
 *
 *   GET /api/altcha/challenge - issue a fresh proof-of-work puzzle.
 *
 * Signed with APP_SECRET (same key as session cookies) so the server never
 * needs to store pending challenges; the D1 replay ledger lives in the login
 * route where the solved payload arrives.
 */

import { Hono } from "hono";
import type { Env } from "../env";
import { createChallenge } from "../altcha";

const altcha = new Hono<Env>();

altcha.get("/challenge", async (c) => {
  const challenge = await createChallenge(c.env.APP_SECRET);
  c.header("Cache-Control", "no-store");
  return c.json(challenge);
});

export default altcha;
