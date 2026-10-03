/**
 * Client-side document export: TipTap JSON -> Markdown / clean HTML, plus
 * a dependency-free "Save as PDF" pipeline that drives the browser's own
 * print dialog over a print-styled hidden iframe (zero added bundle weight).
 */

/* ---------- shared helpers ---------- */

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export type Node = { type?: string; text?: string; marks?: Array<{ type: string }>; attrs?: Record<string, unknown>; content?: Node[] };

/** Inline rendering with marks (bold/italic/underline/code) applied. */
function inlineHtml(node: Node): string {
  return (node.content ?? [])
    .map((child) => {
      if (child.type === "hardBreak") return "<br />";
      let text = escapeHtml(typeof child.text === "string" ? child.text : "");
      for (const m of child.marks ?? []) {
        if (m.type === "bold") text = `<strong>${text}</strong>`;
        if (m.type === "italic") text = `<em>${text}</em>`;
        if (m.type === "underline") text = `<u>${text}</u>`;
        if (m.type === "code") text = `<code>${text}</code>`;
      }
      return text;
    })
    .join("");
}

function inlineMd(node: Node): string {
  return (node.content ?? [])
    .map((child) => {
      if (child.type === "hardBreak") return "\n";
      let text = typeof child.text === "string" ? child.text : "";
      const marks = child.marks ?? [];
      for (const m of marks) {
        if (m.type === "bold") text = `**${text}**`;
        if (m.type === "italic") text = `*${text}*`;
        if (m.type === "code") text = `\`${text}\``;
      }
      return text;
    })
    .join("");
}

/* ---------- Markdown ---------- */

export function docToMarkdown(node: Node): string {
  const blocks = node.content ?? [];
  const lines: string[] = [];

  for (const block of blocks) {
    switch (block.type) {
      case "heading": {
        const level = (block.attrs?.level as number | undefined) ?? 1;
        lines.push(`${"#".repeat(level)} ${inlineMd(block)}`);
        break;
      }
      case "bulletList":
        for (const item of block.content ?? []) lines.push(`- ${inlineMd(item)}`);
        break;
      case "orderedList":
        (block.content ?? []).forEach((item, i) => lines.push(`${i + 1}. ${inlineMd(item)}`));
        break;
      case "blockquote":
        lines.push(`> ${inlineMd(block)}`);
        break;
      case "codeBlock":
        lines.push("```\n" + inlineMd(block) + "\n```");
        break;
      default:
        lines.push(inlineMd(block));
    }
  }
  return lines.join("\n\n");
}

/* ---------- HTML (for PDF/print + previews) ---------- */

export function docToHtml(node: Node): string {
  const blocks = node.content ?? [];
  const out: string[] = [];

  const listHtml = (list: Node, tag: "ul" | "ol") =>
    `<${tag}>${(list.content ?? [])
      .map((li) => `<li>${(li.content ?? []).map((b) => inlineHtml(b)).join("")}</li>`)
      .join("")}</${tag}>`;

  for (const block of blocks) {
    switch (block.type) {
      case "heading": {
        const level = Math.min(6, Math.max(1, (block.attrs?.level as number | undefined) ?? 1));
        out.push(`<h${level}>${inlineHtml(block) || "&nbsp;"}</h${level}>`);
        break;
      }
      case "bulletList":
        out.push(listHtml(block, "ul"));
        break;
      case "orderedList":
        out.push(listHtml(block, "ol"));
        break;
      case "blockquote":
        out.push(`<blockquote>${inlineHtml(block)}</blockquote>`);
        break;
      case "codeBlock":
        out.push(`<pre><code>${inlineHtml(block)}</code></pre>`);
        break;
      case "paragraph":
        out.push(`<p>${inlineHtml(block) || "<br />"}</p>`);
        break;
      default:
        out.push(`<p>${inlineHtml(block)}</p>`);
    }
  }
  return out.join("\n");
}

/* ---------- downloads ---------- */

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/* ---------- PDF via the browser's print pipeline ---------- */

/** Render `bodyHtml` into a hidden iframe and open the print dialog (Save as PDF). */
export function printAsPdf(bodyHtml: string, title: string): void {
  const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>${escapeHtml(title)}</title>
<style>
  @page { margin: 22mm 18mm; }
  body { font-family: Georgia, "Times New Roman", serif; color: #1a1d27; line-height: 1.65; font-size: 12.5pt; }
  h1, h2, h3, h4 { font-family: "Helvetica Neue", Arial, sans-serif; line-height: 1.3; color: #10121a; }
  h1 { font-size: 22pt; } h2 { font-size: 17pt; } h3 { font-size: 14pt; }
  blockquote { margin: 1em 0; padding: 0.2em 1em; border-left: 3px solid #b9bdd1; color: #4a5264; }
  pre { background: #f4f5f9; padding: 12px 14px; border-radius: 6px; font-size: 10.5pt; white-space: pre-wrap; }
  code { font-family: "SF Mono", Consolas, monospace; font-size: 0.9em; background: #f4f5f9; padding: 1px 4px; border-radius: 4px; }
  pre code { background: none; padding: 0; }
  .print-meta { font-family: Arial, sans-serif; font-size: 9pt; color: #8b93a5; margin-bottom: 2em; }
</style>
</head>
<body>
  <div class="print-meta">${escapeHtml(title)} — exported from Ajaia Docs, ${new Date().toLocaleString()}</div>
  ${bodyHtml}
</body>
</html>`;

  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;";
  document.body.appendChild(frame);

  frame.srcdoc = html;
  frame.onload = () => {
    try {
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
    } finally {
      // Give the print dialog a moment to consume the frame before cleanup.
      window.setTimeout(() => frame.remove(), 60_000);
    }
  };
}
