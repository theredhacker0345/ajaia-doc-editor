/** Default empty TipTap document (one empty paragraph). */
export const EMPTY_DOC_CONTENT = JSON.stringify({
  type: "doc",
  content: [{ type: "paragraph" }],
});

/** Color palette used when a brand-new user is auto-provisioned via sharing. */
export const USER_PALETTE = [
  "#4f46e5",
  "#e8710a",
  "#188038",
  "#9334e6",
  "#d93025",
  "#12b5cb",
  "#f9ab00",
  "#7b1fa2",
];

/** Deterministic color pick so a given email always maps to the same color. */
export function colorForEmail(email: string): string {
  let sum = 0;
  for (const ch of email) sum += ch.charCodeAt(0);
  return USER_PALETTE[sum % USER_PALETTE.length];
}

/* ---------- version-history snapshot policy (pure, unit tested) ---------- */

/** Minimum wall-clock distance between two automatic snapshots. */
export const SNAPSHOT_MIN_INTERVAL_MS = 2 * 60_000; // 2 minutes
/** Maximum number of versions retained per document (oldest pruned). */
export const MAX_VERSIONS_PER_DOC = 50;

export interface SnapshotDecision {
  lastVersionAt: string | null; // created_at of the newest snapshot, if any
  now: number; // ms epoch
  minIntervalMs?: number;
}

/** Take a snapshot only when enough time has passed since the previous one. */
export function shouldSnapshot({ lastVersionAt, now, minIntervalMs }: SnapshotDecision): boolean {
  if (!lastVersionAt) return true;
  const last = Date.parse(lastVersionAt);
  if (!Number.isFinite(last)) return true;
  return now - last >= (minIntervalMs ?? SNAPSHOT_MIN_INTERVAL_MS);
}

/* ---------- plain-text excerpt (pure, unit tested) ---------- */

interface TiptapNode {
  type?: string;
  text?: string;
  content?: TiptapNode[];
}

/** Collect text from a TipTap node, inserting paragraph/newline breaks. */
function collectText(node: TiptapNode, out: string[]): void {
  if (node.type === "text" && typeof node.text === "string") {
    out.push(node.text);
    return;
  }
  if (node.type === "hardBreak") {
    out.push(" ");
    return;
  }
  for (const child of node.content ?? []) collectText(child, out);
  if (node.type === "paragraph" || node.type === "heading" || node.type === "blockquote") {
    out.push(" ");
  }
}

/** Plain-text preview of a serialized TipTap document (max ~140 chars). */
export function excerptFromContent(serialized: string | null | undefined, max = 140): string {
  if (!serialized) return "";
  let doc: TiptapNode | null = null;
  try {
    doc = JSON.parse(serialized) as TiptapNode;
  } catch {
    return "";
  }
  const parts: string[] = [];
  collectText(doc ?? {}, parts);
  const text = parts.join("").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}
