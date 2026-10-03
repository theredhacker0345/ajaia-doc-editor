import { useState } from "react";
import { api } from "../api";
import type { ShareInfo, User } from "../types";
import { initials } from "../lib/format";

/** Owner-only sharing dialog: grant viewer/editor access by email, revoke anytime. */
export default function ShareModal({
  docId,
  shares,
  onClose,
  onChanged,
}: {
  docId: string;
  shares: ShareInfo[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"viewer" | "editor">("editor");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await api<{ created: boolean }>(`/api/documents/${docId}/share`, {
        method: "POST",
        body: JSON.stringify({ email: email.trim(), role }),
      });
      setEmail("");
      onChanged();
      if (res.created) setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not share.");
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (userId: string) => {
    setError(null);
    try {
      await api(`/api/documents/${docId}/share/${userId}`, { method: "DELETE" });
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not revoke access.");
    }
  };

  return (
    <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="Share document">
        <div className="modal-head">
          <h3>Share document</h3>
          <button type="button" className="btn ghost" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <form className="share-form" onSubmit={add}>
          <input
            type="email"
            placeholder="name@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-label="Email address"
            required
          />
          <select value={role} onChange={(e) => setRole(e.target.value as "viewer" | "editor")} aria-label="Role">
            <option value="editor">Can edit</option>
            <option value="viewer">Can view</option>
          </select>
          <button type="submit" className="btn primary" disabled={busy || !email.trim()}>
            {busy ? "Adding…" : "Add"}
          </button>
        </form>
        <p className="muted share-hint">
          New recipients are auto-created as users the first time they are shared with, so they can
          sign in right away.
        </p>

        {error && <p className="form-error">{error}</p>}

        <ul className="share-list">
          {shares.length === 0 && <li className="muted">Not shared with anyone yet.</li>}
          {shares.map((s: ShareInfo) => (
            <li key={s.user.id}>
              <span className="avatar tiny" style={{ background: s.user.color }}>
                {initials(s.user.name)}
              </span>
              <span className="share-who">
                <strong>{s.user.name}</strong>
                <span className="muted">{s.user.email}</span>
              </span>
              <span className={`badge ${s.role === "editor" ? "" : "subtle"}`}>
                {s.role === "editor" ? "Can edit" : "Can view"}
              </span>
              <button type="button" className="btn ghost danger" onClick={() => revoke(s.user.id)}>
                Remove
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
