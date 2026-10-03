import { describe, it, expect } from "vitest";
import {
  excerptFromContent,
  shouldSnapshot,
  SNAPSHOT_MIN_INTERVAL_MS,
  MAX_VERSIONS_PER_DOC,
} from "../worker/doc";

describe("excerptFromContent", () => {
  const doc = (blocks: object[]) =>
    JSON.stringify({ type: "doc", content: blocks });

  it("extracts plain text from paragraphs", () => {
    const e = excerptFromContent(
      doc([{ type: "paragraph", content: [{ type: "text", text: "Hello world" }] }])
    );
    expect(e).toBe("Hello world");
  });

  it("joins multiple blocks with spaces", () => {
    const e = excerptFromContent(
      doc([
        { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Title" }] },
        { type: "paragraph", content: [{ type: "text", text: "Body text here" }] },
      ])
    );
    expect(e).toBe("Title Body text here");
  });

  it("reads text inside lists and formatting marks", () => {
    const e = excerptFromContent(
      doc([
        {
          type: "bulletList",
          content: [
            { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "first" }] }] },
            { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "second" }] }] },
          ],
        },
      ])
    );
    expect(e).toBe("first second");
  });

  it("truncates long documents with an ellipsis", () => {
    const long = "x".repeat(500);
    const e = excerptFromContent(
      doc([{ type: "paragraph", content: [{ type: "text", text: long }] }])
    );
    expect(e.length).toBeLessThanOrEqual(140);
    expect(e.endsWith("…")).toBe(true);
  });

  it("handles empty, malformed and null content safely", () => {
    expect(excerptFromContent(null)).toBe("");
    expect(excerptFromContent("")).toBe("");
    expect(excerptFromContent("not-json{")).toBe("");
    expect(excerptFromContent(JSON.stringify({ type: "doc", content: [] }))).toBe("");
  });
});

describe("shouldSnapshot", () => {
  const NOW = 1_700_000_000_000;

  it("always snapshots when no previous version exists", () => {
    expect(shouldSnapshot({ lastVersionAt: null, now: NOW })).toBe(true);
  });

  it("skips when the last snapshot is younger than the minimum interval", () => {
    const recent = new Date(NOW - SNAPSHOT_MIN_INTERVAL_MS / 2).toISOString();
    expect(shouldSnapshot({ lastVersionAt: recent, now: NOW })).toBe(false);
  });

  it("snapshots when the minimum interval has elapsed", () => {
    const old = new Date(NOW - SNAPSHOT_MIN_INTERVAL_MS - 1).toISOString();
    expect(shouldSnapshot({ lastVersionAt: old, now: NOW })).toBe(true);
  });

  it("treats an unparseable timestamp as 'no version' (snapshot)", () => {
    expect(shouldSnapshot({ lastVersionAt: "garbage", now: NOW })).toBe(true);
  });

  it("respects a custom interval", () => {
    const recent = new Date(NOW - 1_000).toISOString();
    expect(shouldSnapshot({ lastVersionAt: recent, now: NOW, minIntervalMs: 500 })).toBe(true);
    expect(shouldSnapshot({ lastVersionAt: recent, now: NOW, minIntervalMs: 5_000 })).toBe(false);
  });

  it("keeps the retention bound sane", () => {
    expect(MAX_VERSIONS_PER_DOC).toBeGreaterThan(0);
    expect(MAX_VERSIONS_PER_DOC).toBeLessThanOrEqual(100);
  });
});
