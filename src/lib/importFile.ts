/**
 * Client-side document import: .docx / .md / .txt -> TipTap JSON.
 *
 * Parsing happens entirely in the browser (mammoth + marked + an offscreen
 * TipTap editor). The API only ever receives normalized TipTap JSON, which
 * keeps the backend simple and avoids server-side Office/Markdown parsing.
 */

import * as mammothNs from "mammoth";
import { marked } from "marked";
import { Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";

const mammoth = ((mammothNs as Record<string, unknown>).default ?? mammothNs) as {
  convertToHtml: (input: { arrayBuffer: ArrayBuffer }) => Promise<{ value: string; messages: unknown[] }>;
};

let converter: Editor | null = null;

/** Convert an HTML string into a TipTap document using an offscreen editor. */
function htmlToTiptapDoc(html: string): object {
  if (!converter) {
    converter = new Editor({ extensions: [StarterKit, Underline] });
  }
  converter.commands.setContent(html, false);
  return converter.getJSON();
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
    const { value } = await mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() });
    return { title: baseTitle || "Imported document", content: htmlToTiptapDoc(value || "<p></p>") };
  }

  if (ext === "md" || ext === "markdown") {
    const html = await marked.parse(await file.text());
    return { title: baseTitle || "Imported document", content: htmlToTiptapDoc(html) };
  }

  if (ext === "txt") {
    const html = txtToHtml(await file.text());
    return { title: baseTitle || "Imported document", content: htmlToTiptapDoc(html) };
  }

  throw new Error(`Unsupported file type ".${ext}". Supported: .txt, .md, .docx`);
}
