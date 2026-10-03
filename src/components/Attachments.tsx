import { useRef, useState } from "react";
import { api } from "../api";
import { useToast } from "../toast";
import type { AttachmentMeta } from "../types";
import { ConfirmDialog, type ConfirmState } from "../ui";
import { formatBytes } from "../lib/format";
import { IconPaperclip, IconPlus, IconX } from "../icons";

const ALLOWED_EXT = ".txt,.md,.markdown,.docx,.pdf,.png,.jpg,.jpeg,.gif,.csv,.json";

/** Per-document attachment rail (stored in D1, 2 MB cap - stated in the UI). */
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
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const toast = useToast();

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
      toast("Attachment uploaded.", "ok");
    } catch (err) {
      // Surface validation errors (type / size) as toasts, not alerts.
      toast(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  };

  const askRemove = (a: AttachmentMeta) => {
    setConfirm({
      title: "Remove attachment",
      body: `"${a.filename}" will be removed for everyone with access to this document.`,
      confirmLabel: "Remove",
      onConfirm: async () => {
        await api(`/api/attachments/${a.id}`, { method: "DELETE" });
        onChanged();
        toast("Attachment removed.", "ok");
      },
    });
  };

  return (
    <aside className="att-rail" aria-label="Attachments">
      <div className="att-head">
        <h3>Attachments</h3>
        {canEdit && (
          <button type="button" className="btn sm" onClick={() => input.current?.click()} disabled={busy}>
            <IconPlus /> {busy ? "Uploading…" : "Add file"}
          </button>
        )}
      </div>

      {canEdit && (
        <p className="att-hint muted">Max 2 MB · txt, md, docx, pdf, png, jpg, gif, csv, json</p>
      )}

      <ul className="att-list">
        {attachments.length === 0 && <li className="att-empty muted">No attachments yet.</li>}
        {attachments.map((a) => (
          <li key={a.id} className="att-item">
            <span className="att-file-icon"><IconPaperclip /></span>
            <a
              href={`/api/attachments/${a.id}/download`}
              className="att-name"
              title="Download attachment"
            >
              {a.filename}
              <span className="att-size">{formatBytes(a.size)}</span>
            </a>
            {canDeleteAny && (
              <button
                type="button"
                className="btn-icon"
                onClick={() => askRemove(a)}
                aria-label={`Remove ${a.filename}`}
              >
                <IconX />
              </button>
            )}
          </li>
        ))}
      </ul>

      <input
        ref={input}
        type="file"
        accept={ALLOWED_EXT}
        style={{ display: "none" }}
        onChange={upload}
      />

      {confirm && <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />}
    </aside>
  );
}
