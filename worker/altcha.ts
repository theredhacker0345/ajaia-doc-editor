/**
 * ALTCHA v1 - privacy-friendly proof-of-work human verification (altcha.org).
 *
 * Implemented directly on the Web Crypto API so it runs on Cloudflare Workers
 * (and in Node 18+ tests) with zero dependencies. No cookies, no tracking,
 * no third-party calls - just a signed hashcash puzzle.
 *
 * Challenge format:
 *   salt      = "<random-hex>|<expires-at-ms>"            (expiry embedded, visible)
 *   challenge = SHA-256(salt + hiddenNumber)              hiddenNumber < maxnumber
 *   signature = HMAC-SHA256(APP_SECRET, salt|challenge)   (server-signed)
 *
 * The client brute-forces hiddenNumber and submits
 * base64(JSON {algorithm, challenge, number, salt, signature}) with the login
 * request. Verification re-checks signature, hash and expiry; the login route
 * additionally records the challenge in a D1 replay ledger so a solved puzzle
 * can never be submitted twice.
 */

const CHALLENGE_TTL_MS = 2 * 60 * 1000;
export const ALTCHA_MAX_NUMBER = 60_000;

function toHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function sha256Hex(input: string): Promise<string> {
  return toHex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input)));
}

async function hmacHex(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return toHex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload)));
}

/** Constant-time compare so a wrong signature leaks no byte-position hints. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export interface AltchaChallenge {
  algorithm: "SHA-256";
  challenge: string;
  maxnumber: number;
  salt: string;
  signature: string;
}

export async function createChallenge(
  secret: string,
  opts: { maxnumber?: number; now?: number } = {}
): Promise<AltchaChallenge> {
  const maxnumber = opts.maxnumber ?? ALTCHA_MAX_NUMBER;
  const expiresAt = (opts.now ?? Date.now()) + CHALLENGE_TTL_MS;
  const random = [...crypto.getRandomValues(new Uint8Array(12))]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const salt = `${random}|${expiresAt}`;
  const hidden = crypto.getRandomValues(new Uint32Array(1))[0] % maxnumber;
  const challenge = await sha256Hex(`${salt}${hidden}`);
  return {
    algorithm: "SHA-256",
    challenge,
    maxnumber,
    salt,
    signature: await hmacHex(`${salt}|${challenge}`, secret),
  };
}

export type AltchaFailure = "malformed" | "algorithm" | "expired" | "signature" | "solution";

export type AltchaVerification =
  | { ok: true; challenge: string }
  | { ok: false; reason: AltchaFailure };

/** Accepts the official base64 widget payload or an equivalent object. */
export async function verifyAltcha(
  raw: unknown,
  secret: string,
  opts: { now?: number } = {}
): Promise<AltchaVerification> {
  let p: Record<string, unknown>;

  if (typeof raw === "string" && raw.length > 0 && raw.length < 4096) {
    try {
      p = JSON.parse(atob(raw)) as Record<string, unknown>;
    } catch {
      return { ok: false, reason: "malformed" };
    }
  } else if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    p = raw as Record<string, unknown>;
  } else {
    return { ok: false, reason: "malformed" };
  }

  if (p.algorithm !== "SHA-256") return { ok: false, reason: "algorithm" };

  const salt = typeof p.salt === "string" ? p.salt : "";
  const match = /^[0-9a-f]{16,64}\|(\d{10,16})$/.exec(salt);
  if (!match) return { ok: false, reason: "malformed" };
  if (Number(match[1]) < (opts.now ?? Date.now())) return { ok: false, reason: "expired" };

  const challenge = typeof p.challenge === "string" ? p.challenge : "";
  if (!/^[0-9a-f]{64}$/.test(challenge)) return { ok: false, reason: "malformed" };

  if (
    typeof p.number !== "number" ||
    !Number.isInteger(p.number) ||
    p.number < 0 ||
    p.number > 100_000_000
  ) {
    return { ok: false, reason: "malformed" };
  }

  const expectedSig = await hmacHex(`${salt}|${challenge}`, secret);
  const gotSig = typeof p.signature === "string" ? p.signature : "";
  if (!timingSafeEqual(expectedSig, gotSig)) return { ok: false, reason: "signature" };

  const solved = await sha256Hex(`${salt}${p.number}`);
  if (!timingSafeEqual(solved, challenge)) return { ok: false, reason: "solution" };

  return { ok: true, challenge };
}
