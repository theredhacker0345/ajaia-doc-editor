import { useState } from "react";
import { api } from "../api";
import { useToast } from "../toast";
import type { ShareInfo } from "../types";
import { Modal, ModalX } from "../ui";
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
  const toast = useToast();

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await api<{ created: boolean }>(`/api/documents/${docId}/share`, {
        method: "POST",
        body: JSON.stringify({ email: email.trim(), role }),
      });
      onChanged();
      toast(
        res.created
          ? `${email.trim()} was added and can sign in right away.`
          : `Updated access for ${email.trim()}.`,
        "ok"
      );
      setEmail("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not share.");
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (userId: string, name: string) => {
    setError(null);
    try {
      await api(`/api/documents/${docId}/share/${userId}`, { method: "DELETE" });
      onChanged();
      toast(`${name} no longer has access.`, "ok");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not revoke access.");
    }
  };

  return (
    <Modal onClose={onClose} labelledBy="share-title" maxWidth={520}>
      <ModalX onClick={onClose} />

      <div className="modal-head">
        <h3 className="modal-title" id="share-title">Share document</h3>
      </div>

      <form className="share-form" onSubmit={add}>
        <input
          className="input"
          type="email"
          placeholder="name@company.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-label="Email address"
          autoFocus
          required
        />
        <select
          className="select"
          value={role}
          onChange={(e) => setRole(e.target.value as "viewer" | "editor")}
          aria-label="Role"
        >
          <option value="editor">Can edit</option>
          <option value="viewer">Can view</option>
        </select>
        <button type="submit" className="btn primary" disabled={busy || !email.trim()}>
          {busy ? "Adding…" : "Add"}
        </button>
      </form>
      <p className="muted share-hint">
        New recipients are auto-created the first time they are shared with, so they
        can sign in and open the document right away.
      </p>

      {error && <p className="field-error">{error}</p>}

      <ul className="share-list">
        {shares.length === 0 && <li className="muted">Not shared with anyone yet.</li>}
        {shares.map((s) => (
          <li key={s.user.id}>
            <span className="avatar sm" style={{ background: s.user.color }}>
              {initials(s.user.name)}
            </span>
            <span className="share-who">
              <strong>{s.user.name}</strong>
              <span className="muted">{s.user.email}</span>
            </span>
            <span className={`badge${s.role === "editor" ? "" : " subtle"}`}>
              {s.role === "editor" ? "Can edit" : "Can view"}
            </span>
            <button
              type="button"
              className="btn ghost danger sm"
              onClick={() => revoke(s.user.id, s.user.name)}
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
