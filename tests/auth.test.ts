import { describe, it, expect } from "vitest";
import { createSessionToken, verifySessionToken } from "../worker/auth";

/**
 * Session token round-trip tests (Node 18+ exposes WebCrypto on globalThis,
 * same API surface as the Workers runtime).
 */
describe("session tokens", () => {
  const secret = "test-secret";

  it("round-trips a valid token back to the user id", async () => {
    const token = await createSessionToken("u-123", secret);
    expect(await verifySessionToken(token, secret)).toBe("u-123");
  });

  it("rejects a token signed with a different secret", async () => {
    const token = await createSessionToken("u-123", secret);
    expect(await verifySessionToken(token, "other-secret")).toBeNull();
  });

  it("rejects tampered payloads", async () => {
    const token = await createSessionToken("u-123", secret);
    const [userId, exp, sig] = token.split(".");
    const tampered = `${"u-999"}.${exp}.${sig}`;
    expect(await verifySessionToken(tampered, secret)).toBeNull();
  });

  it("rejects expired tokens", async () => {
    // Build a token whose expiry is already in the past.
    const payload = `u-123.${Date.now() - 1000}`;
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const sig = [...new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload)))]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    expect(await verifySessionToken(`${payload}.${sig}`, secret)).toBeNull();
  });

  it("rejects malformed input", async () => {
    expect(await verifySessionToken(undefined, secret)).toBeNull();
    expect(await verifySessionToken("garbage", secret)).toBeNull();
    expect(await verifySessionToken("a.b", secret)).toBeNull();
  });
});
