import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";
import { useToast } from "../toast";
import type { ProfilePayload, ProfileFields } from "../types";
import Shell from "../components/Shell";
import { Modal, ModalX } from "../ui";
import { timeAgo, initials } from "../lib/format";
import {
  IconCheckSimple,
  IconFileText,
  IconPaperclip,
  IconPencil,
  IconShield,
  IconUsers,
} from "../icons";

type EditForm = ProfileFields & { name: string };

export default function Profile() {
  const { updateProfile } = useAuth();
  const toast = useToast();

  const [data, setData] = useState<ProfilePayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<EditForm>({ name: "", title: "", bio: "", location: "", website: "" });
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const d = await api<ProfilePayload>("/api/me/profile");
    setData(d);
    setForm({ name: d.user.name, ...d.profile });
  }, []);

  useEffect(() => {
    load().catch((e) => setError(e instanceof Error ? e.message : "Could not load your profile."));
  }, [load]);

  const openEdit = () => {
    setFormError(null);
    setEditOpen(true);
  };

  const set = (key: keyof EditForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((prev) => ({ ...prev, [key]: e.target.value }));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setFormError(null);
    try {
      await updateProfile(form);
      await load();
      setEditOpen(false);
      toast("Profile updated.", "ok");
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Could not update your profile.");
    } finally {
      setBusy(false);
    }
  };

  if (error) {
    return (
      <Shell active="profile">
        <div className="empty-state">
          <div className="empty-icon"><IconShield /></div>
          <h3 className="empty-title">Could not load your profile</h3>
          <p className="muted">{error}</p>
          <Link className="btn primary" to="/">Back to documents</Link>
        </div>
      </Shell>
    );
  }

  return (
    <Shell active="profile">
      {!data ? (
        <div aria-hidden="true">
          <div className="sk-card" style={{ marginBottom: 16 }}>
            <span className="skeleton sk-avatar" />
            <span className="skeleton sk-line w-40" />
            <span className="skeleton sk-line w-60" />
          </div>
          <div className="stat-grid">
            {Array.from({ length: 4 }, (_, i) => (
              <div className="sk-card" key={i}>
                <span className="skeleton sk-line w-40" />
                <span className="skeleton sk-line w-75" />
              </div>
            ))}
          </div>
        </div>
      ) : (
        <>
          {/* ---------- hero ---------- */}
          <section className="profile-hero">
            <div className="profile-banner" aria-hidden="true" />
            <div className="profile-id">
              <span className="profile-avatar-ring">
                <span className="avatar xl" style={{ background: data.user.color }}>
                  {initials(data.user.name)}
                </span>
              </span>
              <div className="profile-id-main">
                <h1 className="profile-name">{data.user.name}</h1>
                <p className="profile-email">{data.user.email}</p>
                <div className="profile-chips">
                  {data.profile.title && <span className="badge">{data.profile.title}</span>}
                  {data.profile.location && (
                    <span className="badge subtle">{data.profile.location}</span>
                  )}
                  <span className="badge subtle">
                    Member since{" "}
                    {new Date(data.member_since).toLocaleDateString(undefined, {
                      month: "long",
                      year: "numeric",
                    })}
                  </span>
                </div>
              </div>
              <div className="profile-id-actions">
                {data.profile.website && (
                  <a className="btn sm" href={data.profile.website} target="_blank" rel="noreferrer">
                    Website
                  </a>
                )}
                <button type="button" className="btn primary sm" onClick={openEdit}>
                  <IconPencil /> Edit profile
                </button>
              </div>
            </div>
          </section>

          {/* ---------- stats ---------- */}
          <section className="stat-grid" aria-label="Activity statistics">
            <div className="stat-card">
              <span className="stat-icon"><IconFileText /></span>
              <span className="stat-num">{data.stats.owned_docs}</span>
              <span className="stat-label">Documents owned</span>
            </div>
            <div className="stat-card">
              <span className="stat-icon"><IconUsers /></span>
              <span className="stat-num">{data.stats.shared_with_me}</span>
              <span className="stat-label">Shared with you</span>
            </div>
            <div className="stat-card">
              <span className="stat-icon"><IconUsers /></span>
              <span className="stat-num">{data.stats.grants_given}</span>
              <span className="stat-label">Access grants</span>
            </div>
            <div className="stat-card">
              <span className="stat-icon"><IconPaperclip /></span>
              <span className="stat-num">{data.stats.attachments}</span>
              <span className="stat-label">Attachments</span>
            </div>
          </section>

          {/* ---------- details + security ---------- */}
          <div className="profile-grid">
            <section className="profile-section">
              <h2 className="section-label">About</h2>
              <p className="page-sub">
                {data.profile.bio ||
                  "No bio yet - click Edit profile to introduce yourself. Your bio appears here and helps collaborators know who they are working with."}
              </p>

              <h2 className="section-label">Recent documents</h2>
              {data.recent.length === 0 ? (
                <p className="muted">
                  No documents yet -{" "}
                  <Link to="/" className="accent">
                    create your first one
                  </Link>
                  .
                </p>
              ) : (
                <ul className="recent-list">
                  {data.recent.map((d) => (
                    <li key={d.id} className="recent-item">
                      <Link to={`/doc/${d.id}`} className="recent-main">
                        <span className="recent-title">{d.title}</span>
                        <span className="recent-meta">Edited {timeAgo(d.updated_at)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <aside className="shield-card">
              <div className="shield-head">
                <IconShield />
                <h2>Security</h2>
              </div>
              <ul>
                <li className="shield-row">
                  ALTCHA proof-of-work verification on every sign-in - no CAPTCHAs, no third parties
                </li>
                <li className="shield-row">
                  HMAC-signed, HTTP-only session cookies with 7-day expiry
                </li>
                <li className="shield-row">
                  Server-enforced owner / editor / viewer permission matrix
                </li>
                <li className="shield-row">
                  Strict input validation, CSP, nosniff and frame-deny headers
                </li>
                <li className="shield-row">
                  Single-use verification ledger blocks replayed challenges
                </li>
              </ul>
              <p className="shield-note">
                Mock auth (email-only sign-in, no passwords) is an intentional scope
                choice for this assignment - documented in ARCHITECTURE.md.
              </p>
            </aside>
          </div>

          {/* ---------- edit modal ---------- */}
          {editOpen && (
            <Modal onClose={() => setEditOpen(false)} labelledBy="edit-profile-title" maxWidth={520}>
              <ModalX onClick={() => setEditOpen(false)} />
              <div className="modal-head">
                <h3 className="modal-title" id="edit-profile-title">Edit profile</h3>
              </div>
              <form onSubmit={save}>
                <div className="field">
                  <label className="label" htmlFor="pf-name">Name</label>
                  <input id="pf-name" className="input" value={form.name} onChange={set("name")} maxLength={60} required />
                </div>
                <div className="field">
                  <label className="label" htmlFor="pf-title">Title</label>
                  <input id="pf-title" className="input" placeholder="e.g. Full Stack Developer" value={form.title} onChange={set("title")} maxLength={80} />
                </div>
                <div className="field">
                  <label className="label" htmlFor="pf-bio">Bio</label>
                  <textarea id="pf-bio" className="input" rows={3} maxLength={400} value={form.bio} onChange={set("bio")} />
                </div>
                <div className="field">
                  <label className="label" htmlFor="pf-location">Location</label>
                  <input id="pf-location" className="input" placeholder="City, Country" value={form.location} onChange={set("location")} maxLength={80} />
                </div>
                <div className="field">
                  <label className="label" htmlFor="pf-website">Website</label>
                  <input id="pf-website" className="input" type="url" placeholder="https://your-site.dev" value={form.website} onChange={set("website")} />
                </div>
                {formError && <p className="field-error">{formError}</p>}
                <div className="modal-foot">
                  <button type="button" className="btn" onClick={() => setEditOpen(false)} disabled={busy}>
                    Cancel
                  </button>
                  <button type="submit" className="btn primary" disabled={busy}>
                    {busy ? "Saving…" : "Save changes"}
                  </button>
                </div>
              </form>
            </Modal>
          )}
        </>
      )}
    </Shell>
  );
}
