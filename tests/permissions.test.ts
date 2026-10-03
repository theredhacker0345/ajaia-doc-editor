import { describe, it, expect } from "vitest";
import { resolveAccess, type ShareGrant } from "../worker/permissions";

/**
 * Permission matrix tests: owner / editor / viewer / stranger / anonymous,
 * plus the v3 sharing model (can-share privilege, grant expiry).
 * These rules gate every mutating API route, so regressions here are security bugs.
 */
describe("resolveAccess", () => {
  const ownerId = "u-owner";

  it("grants the owner full control", () => {
    const a = resolveAccess({ ownerId, userId: ownerId, share: null });
    expect(a.isOwner).toBe(true);
    expect(a.role).toBe("owner");
    expect(a.canView).toBe(true);
    expect(a.canEdit).toBe(true);
    expect(a.canManage).toBe(true);
    expect(a.canShare).toBe(true);
  });

  it("owner role wins even if a stale share row exists", () => {
    const a = resolveAccess({
      ownerId,
      userId: ownerId,
      share: { role: "viewer", canShare: false, expiresAt: null },
    });
    expect(a.isOwner).toBe(true);
    expect(a.role).toBe("owner");
    expect(a.canManage).toBe(true);
  });

  it("editor can edit but cannot manage", () => {
    const a = resolveAccess({
      ownerId,
      userId: "u-editor",
      share: { role: "editor", canShare: false, expiresAt: null },
    });
    expect(a.isOwner).toBe(false);
    expect(a.role).toBe("editor");
    expect(a.canView).toBe(true);
    expect(a.canEdit).toBe(true);
    expect(a.canManage).toBe(false);
    expect(a.canShare).toBe(false);
  });

  it("viewer is read-only", () => {
    const a = resolveAccess({
      ownerId,
      userId: "u-viewer",
      share: { role: "viewer", canShare: false, expiresAt: null },
    });
    expect(a.canView).toBe(true);
    expect(a.canEdit).toBe(false);
    expect(a.canManage).toBe(false);
  });

  it("a stranger with no share row has no access", () => {
    const a = resolveAccess({ ownerId, userId: "u-stranger", share: null });
    expect(a.canView).toBe(false);
    expect(a.canEdit).toBe(false);
    expect(a.canManage).toBe(false);
    expect(a.role).toBeNull();
  });

  it("anonymous requests (no user) have no access", () => {
    const a = resolveAccess({
      ownerId,
      userId: null,
      share: { role: "editor", canShare: true, expiresAt: null },
    });
    expect(a.canView).toBe(false);
    expect(a.canEdit).toBe(false);
    expect(a.canManage).toBe(false);
  });

  /* ---------- v3: invite-more privilege ---------- */

  it("editor with can-share privilege may invite others", () => {
    const a = resolveAccess({
      ownerId,
      userId: "u-editor",
      share: { role: "editor", canShare: true, expiresAt: null },
    });
    expect(a.canView).toBe(true);
    expect(a.canEdit).toBe(true);
    expect(a.canShare).toBe(true);
    expect(a.canManage).toBe(false);
  });

  it("a viewer can never gain the invite privilege", () => {
    const a = resolveAccess({
      ownerId,
      userId: "u-viewer",
      share: { role: "viewer", canShare: true, expiresAt: null },
    });
    expect(a.canView).toBe(true);
    expect(a.canShare).toBe(false);
  });

  /* ---------- v3: grant expiry ---------- */

  const NOW = 1_700_000_000_000;

  it("an expired grant is revoked (no access at all)", () => {
    const a = resolveAccess({
      ownerId,
      userId: "u-past",
      now: NOW,
      share: {
        role: "editor",
        canShare: true,
        expiresAt: new Date(NOW - 1_000).toISOString(),
      },
    });
    expect(a.canView).toBe(false);
    expect(a.canEdit).toBe(false);
    expect(a.canShare).toBe(false);
    expect(a.role).toBeNull();
  });

  it("a future expiry still grants access", () => {
    const a = resolveAccess({
      ownerId,
      userId: "u-future",
      now: NOW,
      share: {
        role: "viewer",
        canShare: false,
        expiresAt: new Date(NOW + 3_600_000).toISOString(),
      },
    });
    expect(a.canView).toBe(true);
    expect(a.role).toBe("viewer");
  });

  it("expiry boundary is inclusive: a grant expiring exactly now is dead", () => {
    const a = resolveAccess({
      ownerId,
      userId: "u-edge",
      now: NOW,
      share: { role: "editor", canShare: false, expiresAt: new Date(NOW).toISOString() },
    });
    expect(a.canView).toBe(false);
  });

  it("an unparseable expiry never expires (fail open on grant, fail closed elsewhere)", () => {
    const a = resolveAccess({
      ownerId,
      userId: "u-weird",
      now: NOW,
      share: { role: "viewer", canShare: false, expiresAt: "not-a-date" },
    });
    expect(a.canView).toBe(true);
  });
});
