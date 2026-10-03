import { useRef, useState } from "react";
import { api } from "../api";
import type { AttachmentMeta } from "../types";
import { formatBytes } from "../lib/format";

const ALLOWED_EXT = ".txt,.md,.markdown,.docx,.pdf,.png,.jpg,.jpeg,.gif,.csv,.json";

/** Per-document attachment panel (stored in D1, 2 MB cap - stated in the UI). */
export default function Attachments({
  docId,
  attachments,
  canEdit,
  canDeleteAny,
  onChanged,
}: {
  docId: string;
  attachments: AttachmentMeta[];
  canEdit: boolean;
  canDeleteAny: boolean;
  onChanged: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const upload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      await api(`/api/documents/${docId}/attachments`, { method: "POST", body: fd });
      onChanged();
    } catch (err) {
      // Surface validation errors (type / size) directly in the panel.
      alert(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    if (!window.confirm("Remove this attachment?")) return;
    try {
      await api(`/api/attachments/${id}`, { method: "DELETE" });
      onChanged();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Delete failed.");
    }
  };

  return (
    <aside className="att-panel">
      <h3>Attachments</h3>

      {canEdit && (
        <>
          <button type="button" className="btn" onClick={() => input.current?.click()} disabled={busy}>
            {busy ? "Uploading…" : "+ Attach file"}
          </button>
          <input ref={input} type="file" accept={ALLOWED_EXT} style={{ display: "none" }} onChange={upload} />
          <p className="muted att-hint">Max 2 MB. Allowed: txt, md, docx, pdf, png, jpg, gif, csv, json.</p>
        </>
      )}

      <ul className="att-list">
        {attachments.length === 0 && <li className="muted">No attachments yet.</li>}
        {attachments.map((a) => (
          <li key={a.id}>
            <a href={`/api/attachments/${a.id}/download`} className="att-name" title="Download">
              {a.filename}
              <span className="muted att-size">{formatBytes(a.size)}</span>
            </a>
            {canDeleteAny && (
              <button type="button" className="btn ghost danger" onClick={() => remove(a.id)} aria-label={`Remove ${a.filename}`}>
                ✕
              </button>
            )}
          </li>
        ))}
      </ul>
    </aside>
  );
}
