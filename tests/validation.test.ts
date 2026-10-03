import { describe, it, expect } from "vitest";
import {
  sanitizeTitle,
  isValidEmail,
  isShareRole,
  checkAttachment,
  isValidDocContent,
  sanitizeFilename,
  nameFromEmail,
  MAX_TITLE_LENGTH,
} from "../worker/validation";

describe("sanitizeTitle", () => {
  it("trims and collapses whitespace", () => {
    expect(sanitizeTitle("  Hello   World  ")).toBe("Hello World");
  });

  it("rejects empty or whitespace-only titles", () => {
    expect(sanitizeTitle("   ")).toBeNull();
    expect(sanitizeTitle("")).toBeNull();
    expect(sanitizeTitle(null)).toBeNull();
    expect(sanitizeTitle(42)).toBeNull();
  });

  it("caps very long titles", () => {
    expect(sanitizeTitle("x".repeat(5000))?.length).toBe(MAX_TITLE_LENGTH);
  });
});

describe("isValidEmail", () => {
  it("accepts normal addresses", () => {
    expect(isValidEmail("aisha@aajaia.dev")).toBe(true);
    expect(isValidEmail("a.b+c@d.co")).toBe(true);
  });

  it("rejects malformed input", () => {
    expect(isValidEmail("nope")).toBe(false);
    expect(isValidEmail("nope@")).toBe(false);
    expect(isValidEmail("@nope.com")).toBe(false);
    expect(isValidEmail(123)).toBe(false);
    expect(isValidEmail(null)).toBe(false);
  });
});

describe("isShareRole", () => {
  it("accepts viewer/editor and nothing else", () => {
    expect(isShareRole("viewer")).toBe(true);
    expect(isShareRole("editor")).toBe(true);
    expect(isShareRole("admin")).toBe(false);
    expect(isShareRole("owner")).toBe(false);
    expect(isShareRole(undefined)).toBe(false);
  });
});

describe("checkAttachment", () => {
  it("accepts allowed types within the size cap", () => {
    expect(checkAttachment("notes.txt", 100).ok).toBe(true);
    expect(checkAttachment("spec.DOCX", 2048).ok).toBe(true);
    expect(checkAttachment("image.png", 1024).ok).toBe(true);
  });

  it("rejects disallowed extensions", () => {
    const r = checkAttachment("evil.exe", 10);
    expect(r.ok).toBe(false);
    expect(r.error).toContain(".exe");
  });

  it("rejects oversized and empty files", () => {
    expect(checkAttachment("big.pdf", 3_000_000).ok).toBe(false);
    expect(checkAttachment("empty.md", 0).ok).toBe(false);
  });
});

describe("isValidDocContent", () => {
  it("accepts TipTap-shaped doc JSON", () => {
    expect(isValidDocContent(JSON.stringify({ type: "doc", content: [{ type: "paragraph" }] }))).toBe(true);
  });

  it("rejects non-doc JSON, broken JSON and oversized payloads", () => {
    expect(isValidDocContent(JSON.stringify({ type: "not-doc", content: [] }))).toBe(false);
    expect(isValidDocContent("{broken")).toBe(false);
    expect(isValidDocContent("12345")).toBe(false);
    expect(isValidDocContent(JSON.stringify({ type: "doc", content: "x".repeat(3_000_000) }))).toBe(false);
  });
});

describe("sanitizeFilename", () => {
  it("strips unsafe characters and caps length", () => {
    expect(sanitizeFilename('weird"file<>name.txt')).toBe("weird_file__name.txt");
    expect(sanitizeFilename("報告.docx")).toBe("__.docx"); // one underscore per non-ASCII char
    expect(sanitizeFilename("")).toBe("file");
  });
});

describe("nameFromEmail", () => {
  it("builds a display name from the local part", () => {
    expect(nameFromEmail("aisha.khan@aajaia.dev")).toBe("Aisha Khan");
    expect(nameFromEmail("carlos-mendez@x.co")).toBe("Carlos Mendez");
  });

  it("falls back when the local part is empty", () => {
    expect(nameFromEmail("@x.co")).toBe("New User");
  });
});
