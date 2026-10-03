/**
 * Client-side document import: .docx / .md / .txt -> TipTap JSON.
 *
 * Parsing happens entirely in the browser (mammoth + marked + an offscreen
 * TipTap editor). The API only ever receives normalized TipTap JSON, which
 * keeps the backend simple and avoids server-side Office/Markdown parsing.
 *
 * All heavy parsers are dynamically imported so they stay out of the initial
 * bundle and only load when the user actually imports a file (LCP budget).
 */

import type { Editor } from "@tiptap/react";

let converter: Editor | null = null;

async function getConverter(): Promise<Editor> {
  if (!converter) {
    const [{ Editor: E }, { default: StarterKit }, { default: Underline }] = await Promise.all([
      import("@tiptap/react"),
      import("@tiptap/starter-kit"),
      import("@tiptap/extension-underline"),
    ]);
    converter = new E({ extensions: [StarterKit, Underline] });
  }
  return converter;
}

/** Convert an HTML string into a TipTap document using an offscreen editor. */
async function htmlToTiptapDoc(html: string): Promise<object> {
  const editor = await getConverter();
  editor.commands.setContent(html, false);
  return editor.getJSON();
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function txtToHtml(text: string): string {
  const paragraphs = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .map((line) => (line ? `<p>${escapeHtml(line)}</p>` : ""));
  const html = paragraphs.join("");
  return html || "<p></p>";
}

export const IMPORT_ACCEPT = ".txt,.md,.markdown,.docx";

export async function fileToDocContent(
  file: File
): Promise<{ title: string; content: object }> {
  const name = file.name;
  const dot = name.lastIndexOf(".");
  const ext = dot === -1 ? "" : name.slice(dot + 1).toLowerCase();
  const baseTitle = (dot === -1 ? name : name.slice(0, dot)).replace(/[_-]+/g, " ").trim();

  if (ext === "docx") {
    const mod = await import("mammoth");
    const mammoth = ((mod as unknown as Record<string, unknown>).default ?? mod) as {
      convertToHtml: (input: { arrayBuffer: ArrayBuffer }) => Promise<{ value: string; messages: unknown[] }>;
    };
    const { value } = await mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() });
    return { title: baseTitle || "Imported document", content: await htmlToTiptapDoc(value || "<p></p>") };
  }

  if (ext === "md" || ext === "markdown") {
    const { marked } = await import("marked");
    const html = await marked.parse(await file.text());
    return { title: baseTitle || "Imported document", content: await htmlToTiptapDoc(html) };
  }

  if (ext === "txt") {
    const html = txtToHtml(await file.text());
    return { title: baseTitle || "Imported document", content: await htmlToTiptapDoc(html) };
  }

  throw new Error(`Unsupported file type ".${ext}". Supported: .txt, .md, .docx`);
}
