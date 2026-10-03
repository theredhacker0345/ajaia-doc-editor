import { useMemo, useState } from "react";
import { api } from "../api";
import { useToast } from "../toast";
import type { ShareInfo } from "../types";
import { Modal, ModalX, ConfirmDialog, type ConfirmState } from "../ui";
import { initials } from "../lib/format";
import { IconCheckSimple, IconInfo, IconShare } from "../icons";

type Role = "viewer" | "editor";
type ExpiryChoice = "" | "24h" | "7d" | "30d";

const EXPIRY_LABEL: Record<ExpiryChoice, string> = {
  "": "No expiry",
  "24h": "Expires in 24 hours",
  "7d": "Expires in 7 days",
  "30d": "Expires in 30 days",
};

function expiryToIso(choice: ExpiryChoice): string | null {
  if (!choice) return null;
  const hours = choice === "24h" ? 24 : choice === "7d" ? 24 * 7 : 24 * 30;
  return new Date(Date.now() + hours * 3600_000).toISOString();
}

/** Human badge for a stored expiry timestamp. */
export function expiryBadge(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const diff = t - Date.now();
  if (diff <= 0) return "Expired";
  const days = Math.ceil(diff / 86_400_000);
  if (days <= 1) {
    const hours = Math.ceil(diff / 3_600_000);
    return `expires in ${hours}h`;
  }
  return `expires in ${days}d`;
}

/**
 * Sharing dialog. The owner manages roles, invite-more privilege, expiry and
 * ownership transfer; an editor holding the "can invite" privilege can also
 * add people (their invites never outlive their own grant).
 */
export default function ShareModal({
  docId,
  shares,
  isOwner,
  canShare,
  onClose,
  onChanged,
}: {
  docId: string;
  shares: ShareInfo[];
  isOwner: boolean;
  canShare: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("editor");
  const [expiry, setExpiry] = useState<ExpiryChoice>("");
  const [canInviteOthers, setCanInviteOthers] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [transferEmail, setTransferEmail] = useState("");
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [copied, setCopied] = useState(false);
  const toast = useToast();

  const shareLink = useMemo(
    () => `${window.location.origin}/doc/${docId}`,
    [docId]
  );

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await api<{ created: boolean }>(`/api/documents/${docId}/share`, {
        method: "POST",
        body: JSON.stringify({
          email: email.trim(),
          role,
          expires_at: expiryToIso(expiry),
          ...(isOwner && role === "editor" ? { can_share: canInviteOthers } : {}),
        }),
      });
      onChanged();
      toast(
        res.created
          ? `${email.trim()} was added — they can sign in with that email (no password) and open the document right away.`
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

  const patchMember = async (userId: string, patch: Record<string, unknown>, okMsg: string) => {
    setError(null);
    try {
      await api(`/api/documents/${docId}/share/${userId}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
      onChanged();
      toast(okMsg, "ok");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update access.");
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

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareLink);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast("Copy failed — the link is " + shareLink, "error");
    }
  };

  const askTransfer = (e: React.FormEvent) => {
    e.preventDefault();
    const target = transferEmail.trim();
    if (!target) return;
    setConfirm({
      title: "Transfer ownership",
      body: `${target} will become the owner of this document. You will keep editor access and may still re-share, but only the new owner can delete the document or manage the invite privilege.`,
      confirmLabel: "Transfer ownership",
      onConfirm: async () => {
        const res = await api<{ newOwner: { name: string } }>(`/api/documents/${docId}/transfer`, {
          method: "POST",
          body: JSON.stringify({ email: target }),
        });
        setTransferEmail("");
        onChanged();
        toast(`Ownership transferred to ${res.newOwner.name}. You are now an editor.`, "ok");
        window.setTimeout(onClose, 900);
      },
    });
  };

  return (
    <Modal onClose={onClose} labelledBy="share-title" maxWidth={560}>
      <ModalX onClick={onClose} />

      <div className="modal-head">
        <h3 className="modal-title" id="share-title">Share document</h3>
        <button type="button" className="btn ghost sm" onClick={copyLink}>
          <IconShare /> {copied ? "Link copied" : "Copy link"}
        </button>
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
          onChange={(e) => setRole(e.target.value as Role)}
          aria-label="Role"
        >
          <option value="editor">Can edit</option>
          <option value="viewer">Can view</option>
        </select>
        <select
          className="select"
          value={expiry}
          onChange={(e) => setExpiry(e.target.value as ExpiryChoice)}
          aria-label="Access expiry"
          title="Access expiry"
        >
          {(Object.keys(EXPIRY_LABEL) as ExpiryChoice[]).map((k) => (
            <option key={k} value={k}>{EXPIRY_LABEL[k]}</option>
          ))}
        </select>
        <button type="submit" className="btn primary" disabled={busy || !email.trim()}>
          {busy ? "Adding…" : "Add"}
        </button>
      </form>

      {isOwner && (
        <label className="share-check">
          <input
            type="checkbox"
            checked={canInviteOthers}
            onChange={(e) => setCanInviteOthers(e.target.checked)}
            disabled={role !== "editor"}
          />
          <span>
            Allow this editor to invite others
            {role !== "editor" && <small> (editors only)</small>}
          </span>
        </label>
      )}

      <p className="muted share-hint">
        <IconInfo size={13} /> New recipients are auto-created on first share — they sign in
        with their email address (no password, mock auth) and the document is waiting under
        “Shared with you”.
      </p>

      {error && <p className="field-error">{error}</p>}

      <ul className="share-list">
        {shares.length === 0 && <li className="muted">Not shared with anyone yet.</li>}
        {shares.map((s) => {
          const badge = expiryBadge(s.expires_at);
          const expired = badge === "Expired";
          return (
            <li key={s.user.id} className={expired ? "share-row expired" : "share-row"}>
              <span className="avatar sm" style={{ background: s.user.color }}>
                {initials(s.user.name)}
              </span>
              <span className="share-who">
                <strong>
                  {s.user.name}
                  {s.can_share && (
                    <span className="badge subtle" title="May invite other people">
                      can invite
                    </span>
                  )}
                </strong>
                <span className="muted">{s.user.email}</span>
                {badge && <span className={`badge subtle${expired ? " danger" : ""}`}>{badge}</span>}
              </span>

              {isOwner ? (
                <>
                  <select
                    className="select sm"
                    value={s.role}
                    aria-label={`Role for ${s.user.name}`}
                    onChange={(e) =>
                      patchMember(s.user.id, { role: e.target.value }, `${s.user.name} is now ${e.target.value}.`)
                    }
                  >
                    <option value="editor">Can edit</option>
                    <option value="viewer">Can view</option>
                  </select>
                  <select
                    className="select sm"
                    value={s.expires_at ?? ""}
                    aria-label={`Expiry for ${s.user.name}`}
                    onChange={(e) =>
                      patchMember(
                        s.user.id,
                        { expires_at: e.target.value ? expiryToIso(e.target.value as ExpiryChoice) : null },
                        "Access window updated."
                      )
                    }
                  >
                    {(Object.keys(EXPIRY_LABEL) as ExpiryChoice[]).map((k) => (
                      <option key={k} value={k}>{EXPIRY_LABEL[k]}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="btn ghost danger sm"
                    onClick={() => revoke(s.user.id, s.user.name)}
                  >
                    Remove
                  </button>
                </>
              ) : (
                <>
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
                </>
              )}
            </li>
          );
        })}
      </ul>

      {isOwner && (
        <form className="transfer-box" onSubmit={askTransfer}>
          <div className="transfer-head">
            <strong>Transfer ownership</strong>
            <span className="muted">The new owner gets full control; you keep editor access.</span>
          </div>
          <div className="share-form">
            <input
              className="input"
              type="email"
              placeholder="new-owner@company.com"
              value={transferEmail}
              onChange={(e) => setTransferEmail(e.target.value)}
              aria-label="New owner email"
              required
            />
            <button type="submit" className="btn" disabled={!transferEmail.trim()}>
              Transfer
            </button>
          </div>
        </form>
      )}

      {!canShare && !isOwner && (
        <p className="muted share-hint">
          <IconCheckSimple size={13} /> You have access to this document but cannot invite
          others — only the owner can manage sharing.
        </p>
      )}

      {confirm && <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />}
    </Modal>
  );
}
