import { describe, it, expect } from "vitest";
import {
  createChallenge,
  verifyAltcha,
  sha256Hex,
  type AltchaChallenge,
  type AltchaFailure,
  type AltchaVerification,
} from "../worker/altcha";

/**
 * ALTCHA proof-of-work round-trip tests. Node 18+ exposes the same WebCrypto
 * surface as the Workers runtime, so no polyfills are needed.
 */

async function solve(ch: AltchaChallenge): Promise<number> {
  for (let n = 0; n <= ch.maxnumber; n++) {
    if ((await sha256Hex(`${ch.salt}${n}`)) === ch.challenge) return n;
  }
  throw new Error("challenge not solvable");
}

const b64 = (v: unknown) => btoa(JSON.stringify(v));

/** Assert a verification fails and return its failure reason. */
async function failReason(p: Promise<AltchaVerification>): Promise<AltchaFailure> {
  const r = await p;
  if (r.ok) throw new Error("expected verification to fail, but it succeeded");
  return r.reason;
}

describe("ALTCHA proof-of-work", () => {
  const secret = "test-secret";

  it("issues a well-formed, signed challenge", async () => {
    const ch = await createChallenge(secret, { maxnumber: 500 });
    expect(ch.algorithm).toBe("SHA-256");
    expect(ch.challenge).toMatch(/^[0-9a-f]{64}$/);
    expect(ch.salt).toMatch(/^[0-9a-f]{16,64}\|\d{10,16}$/);
    expect(ch.signature).toMatch(/^[0-9a-f]{64}$/);
    expect(ch.maxnumber).toBe(500);
  });

  it("verifies a correctly solved challenge (base64 payload)", async () => {
    const ch = await createChallenge(secret, { maxnumber: 300 });
    const n = await solve(ch);
    expect(await verifyAltcha(b64({ ...ch, number: n }), secret)).toEqual({
      ok: true,
      challenge: ch.challenge,
    });
  });

  it("accepts an equivalent object payload", async () => {
    const ch = await createChallenge(secret, { maxnumber: 300 });
    const n = await solve(ch);
    expect(await verifyAltcha({ ...ch, number: n }, secret).then((r) => r.ok)).toBe(true);
  });

  it("rejects an incorrect solution", async () => {
    const ch = await createChallenge(secret, { maxnumber: 300 });
    const n = await solve(ch);
    const r = await verifyAltcha(b64({ ...ch, number: n + 1 }), secret);
    expect(r).toEqual({ ok: false, reason: "solution" });
  });

  it("rejects a tampered signature", async () => {
    const ch = await createChallenge(secret, { maxnumber: 300 });
    const n = await solve(ch);
    const r = await verifyAltcha(b64({ ...ch, number: n, signature: "0".repeat(64) }), secret);
    expect(r).toEqual({ ok: false, reason: "signature" });
  });

  it("rejects a challenge signed with a different secret", async () => {
    const ch = await createChallenge(secret, { maxnumber: 300 });
    const n = await solve(ch);
    const r = await verifyAltcha(b64({ ...ch, number: n }), "other-secret");
    expect(r).toEqual({ ok: false, reason: "signature" });
  });

  it("rejects expired challenges", async () => {
    const ch = await createChallenge(secret, { maxnumber: 50, now: Date.now() - 10 * 60_000 });
    const n = await solve(ch);
    const r = await verifyAltcha(b64({ ...ch, number: n }), secret);
    expect(r).toEqual({ ok: false, reason: "expired" });
  });

  it("rejects malformed payloads and wrong algorithms", async () => {
    expect(await failReason(verifyAltcha("!!! not base64 !!!", secret))).toBe("malformed");
    expect(await failReason(verifyAltcha(undefined, secret))).toBe("malformed");
    expect(await failReason(verifyAltcha(42, secret))).toBe("malformed");
    expect(
      await failReason(verifyAltcha(b64({ algorithm: "MD5", salt: "a|1", challenge: "x" }), secret))
    ).toBe("algorithm");
    expect(
      await failReason(
        verifyAltcha(b64({ algorithm: "SHA-256", salt: "bad salt", challenge: "x".repeat(64) }), secret)
      )
    ).toBe("malformed");
  });
});
