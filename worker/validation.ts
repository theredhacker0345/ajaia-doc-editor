/**
 * Pure input-validation helpers. No I/O, no runtime dependencies -> easy to test.
 */

export const MAX_TITLE_LENGTH = 200;
export const MAX_CONTENT_BYTES = 2_000_000; // TipTap JSON serialized size cap
export const MAX_ATTACHMENT_BYTES = 2_000_000; // 2 MB per file (D1 row limit)

export const ALLOWED_ATTACHMENT_EXTENSIONS = [
  "txt",
  "md",
  "markdown",
  "docx",
  "pdf",
  "png",
  "jpg",
  "jpeg",
  "gif",
  "csv",
  "json",
] as const;

/** Trim, collapse whitespace and length-cap a title. Returns null when empty. */
export function sanitizeTitle(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const t = raw.replace(/\s+/g, " ").trim().slice(0, MAX_TITLE_LENGTH);
  return t.length > 0 ? t : null;
}

export function isValidEmail(raw: unknown): raw is string {
  if (typeof raw !== "string" || raw.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw);
}

export function isShareRole(raw: unknown): raw is "viewer" | "editor" {
  return raw === "viewer" || raw === "editor";
}

export interface AttachmentCheck {
  ok: boolean;
  error?: string;
}

export function checkAttachment(filename: string, size: number): AttachmentCheck {
  const ext = (filename.split(".").pop() ?? "").toLowerCase();
  if (!(ALLOWED_ATTACHMENT_EXTENSIONS as readonly string[]).includes(ext)) {
    return {
      ok: false,
      error: `File type ".${ext || "?"}" is not allowed. Allowed types: ${ALLOWED_ATTACHMENT_EXTENSIONS.join(", ")}.`,
    };
  }
  if (size <= 0) return { ok: false, error: "File is empty." };
  if (size > MAX_ATTACHMENT_BYTES) return { ok: false, error: "File exceeds the 2 MB size limit." };
  return { ok: true };
}

/** Valid TipTap doc JSON, serialized, under the size cap. */
export function isValidDocContent(raw: unknown): boolean {
  if (typeof raw !== "string" || raw.length > MAX_CONTENT_BYTES) return false;
  try {
    const parsed = JSON.parse(raw);
    return (
      parsed !== null &&
      typeof parsed === "object" &&
      parsed.type === "doc" &&
      Array.isArray(parsed.content)
    );
  } catch {
    return false;
  }
}

/** Make a filename safe for a Content-Disposition header. */
export function sanitizeFilename(name: string): string {
  const cleaned = name.replace(/[^a-zA-Z0-9._ -]/g, "_").replace(/\s+/g, " ").trim();
  return (cleaned || "file").slice(0, 120);
}

/** Collapse whitespace and length-cap free-text profile fields (title, bio, location). */
export function sanitizeProfileText(raw: unknown, maxLen: number): string {
  if (typeof raw !== "string") return "";
  return raw.replace(/\s+/g, " ").trim().slice(0, maxLen);
}

/**
 * Profile website field: "" clears the value, invalid input returns null,
 * otherwise a normalized absolute https URL (scheme optional on input).
 */
export function sanitizeWebsite(raw: unknown): string | null {
  if (raw === undefined || raw === null || raw === "") return "";
  if (typeof raw !== "string") return null;
  const s = raw.trim().slice(0, 200);
  if (!s) return "";
  const candidate = /^https?:\/\//i.test(s) ? s : `https://${s}`;
  try {
    const url = new URL(candidate);
    if (!url.hostname.includes(".")) return null;
    return url.toString();
  } catch {
    return null;
  }
}

/** Derive a human display name from an email local-part: aisha.khan@x.com -> "Aisha Khan". */
export function nameFromEmail(email: string): string {
  const local = email.split("@")[0] ?? "";
  const name = local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ")
    .slice(0, 60);
  return name || "New User";
}
