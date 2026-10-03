import { describe, it, expect } from "vitest";
import { resolveAccess } from "../worker/permissions";

/**
 * Permission matrix tests: owner / editor / viewer / stranger / anonymous.
 * These rules gate every mutating API route, so regressions here are security bugs.
 */
describe("resolveAccess", () => {
  const ownerId = "u-owner";

  it("grants the owner full control", () => {
    const a = resolveAccess({ ownerId, userId: ownerId, shareRole: null });
    expect(a.isOwner).toBe(true);
    expect(a.role).toBe("owner");
    expect(a.canView).toBe(true);
    expect(a.canEdit).toBe(true);
    expect(a.canManage).toBe(true);
  });

  it("owner role wins even if a stale share row exists", () => {
    const a = resolveAccess({ ownerId, userId: ownerId, shareRole: "viewer" });
    expect(a.isOwner).toBe(true);
    expect(a.role).toBe("owner");
    expect(a.canManage).toBe(true);
  });

  it("editor can edit but cannot manage", () => {
    const a = resolveAccess({ ownerId, userId: "u-editor", shareRole: "editor" });
    expect(a.isOwner).toBe(false);
    expect(a.role).toBe("editor");
    expect(a.canView).toBe(true);
    expect(a.canEdit).toBe(true);
    expect(a.canManage).toBe(false);
  });

  it("viewer is read-only", () => {
    const a = resolveAccess({ ownerId, userId: "u-viewer", shareRole: "viewer" });
    expect(a.canView).toBe(true);
    expect(a.canEdit).toBe(false);
    expect(a.canManage).toBe(false);
  });

  it("a stranger with no share row has no access", () => {
    const a = resolveAccess({ ownerId, userId: "u-stranger", shareRole: null });
    expect(a.canView).toBe(false);
    expect(a.canEdit).toBe(false);
    expect(a.canManage).toBe(false);
    expect(a.role).toBeNull();
  });

  it("anonymous requests (no user) have no access", () => {
    const a = resolveAccess({ ownerId, userId: null, shareRole: "editor" });
    expect(a.canView).toBe(false);
    expect(a.canEdit).toBe(false);
    expect(a.canManage).toBe(false);
  });
});
