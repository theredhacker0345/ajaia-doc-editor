import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";
import type { User } from "../types";
import { initials } from "../lib/format";
import { fetchChallenge, solveChallenge, encodePayload } from "../lib/altcha";
import { IconCheckSimple, IconShield } from "../icons";

type AltchaStatus = "solving" | "verified" | "error";

/**
 * Sign-in screen.
 *
 * Left: product story + a decorative mock editor. Right: one-click sign-in
 * for seeded demo users, or create a new user with name + email.
 *
 * Every sign-in is protected by ALTCHA proof-of-work: the browser fetches a
 * signed challenge on mount, solves it in a Web Worker, and submits the
 * payload with the login request. Mock auth (no passwords) is an explicit
 * assignment allowance - documented in ARCHITECTURE.md.
 */
export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [users, setUsers] = useState<User[]>([]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [altchaStatus, setAltchaStatus] = useState<AltchaStatus>("solving");
  const altchaPayload = useRef<string | null>(null);
  const altchaAttempt = useRef(0);

  const runAltcha = useCallback(async () => {
    const attempt = ++altchaAttempt.current;
    setAltchaStatus("solving");
    try {
      const challenge = await fetchChallenge();
      const number = await solveChallenge(challenge);
      if (attempt !== altchaAttempt.current) return; // a newer attempt superseded this one
      altchaPayload.current = encodePayload(challenge, number);
      setAltchaStatus("verified");
    } catch {
      if (attempt === altchaAttempt.current) setAltchaStatus("error");
    }
  }, []);

  useEffect(() => {
    void runAltcha();
  }, [runAltcha]);

  useEffect(() => {
    api<{ users: User[] }>("/api/auth/users")
      .then((d) => setUsers(d.users))
      .catch(() => setUsers([]));
  }, []);

  const signIn = async (targetEmail: string, targetName?: string) => {
    if (altchaStatus !== "verified" || !altchaPayload.current) {
      setError("Still verifying you are human - one moment.");
      return;
    }
    setError(null);
    setBusy(targetEmail);
    try {
      await login(targetEmail, altchaPayload.current, targetName);
      navigate("/", { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign-in failed.");
      // A consumed or expired challenge is the usual cause - refresh it.
      void runAltcha();
    } finally {
      setBusy(null);
    }
  };

  const submitCustom = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    signIn(email.trim(), name.trim() || undefined);
  };

  const altchaPill =
    altchaStatus === "verified" ? (
      <span className="save-pill saved" role="status">
        <IconCheckSimple size={13} /> ALTCHA verified - human check passed
      </span>
    ) : altchaStatus === "error" ? (
      <span className="save-pill error" role="status">
        <IconShield size={13} /> Verification failed
        <button type="button" className="btn ghost sm" onClick={() => void runAltcha()}>
          Retry
        </button>
      </span>
    ) : (
      <span className="save-pill saving" role="status">
        <span className="spinner" aria-hidden="true" /> Solving proof-of-work…
      </span>
    );

  return (
    <main className="auth-page">
      {/* ------- brand side ------- */}
      <section className="auth-side">
        <div className="sidebar-brand">
          <span className="brand-mark">A</span>
          <span>Ajaia Docs</span>
        </div>

        <p className="auth-eyebrow">Collaborative document editor</p>
        <h1 className="auth-headline">
          Write together.
          <br />
          Stay in flow.
        </h1>
        <p className="auth-sub">
          Create rich documents, import existing files, share them with granular
          viewer / editor roles - and never think about saving.
        </p>

        <ul className="auth-points">
          <li className="auth-point">
            <span className="point-check" aria-hidden="true">✓</span>
            <div className="auth-point-text">
              <strong>Rich text, zero friction</strong>
              <span>Formatting, headings and lists with instant autosave.</span>
            </div>
          </li>
          <li className="auth-point">
            <span className="point-check" aria-hidden="true">✓</span>
            <div className="auth-point-text">
              <strong>Import anything</strong>
              <span>.docx, .markdown and .txt files become editable documents.</span>
            </div>
          </li>
          <li className="auth-point">
            <span className="point-check" aria-hidden="true">✓</span>
            <div className="auth-point-text">
              <strong>Share with confidence</strong>
              <span>Server-enforced owner / editor / viewer permissions.</span>
            </div>
          </li>
        </ul>

        <div className="mock-editor" aria-hidden="true">
          <span className="mock-chip">✓ autosaved</span>
          <div className="mock-toolbar">
            <span className="mock-key">B</span>
            <span className="mock-key">I</span>
            <span className="mock-key">H1</span>
            <span className="mock-key">•</span>
          </div>
          <p className="mock-title">Q3 planning notes</p>
          <p className="mock-text">
            Drafted together in real time — headings, lists and{" "}
            <span className="mock-mark">highlights</span> stay in sync for every
            editor on the document.
          </p>
          <p className="mock-meta">Shared with 3 editors · roles enforced server-side</p>
        </div>

        <p className="auth-side-sub">
          Built on Cloudflare Workers, D1, React and TipTap - Full Stack Developer
          assignment by Ubaid ur Rehman.
        </p>
      </section>

      {/* ------- sign-in card ------- */}
      <section className="auth-panel">
        <div className="auth-card">
          <div className="auth-card-head">
            <h2>Sign in</h2>
            <p className="auth-sub">Pick a demo user, or bring your own email.</p>
          </div>

          <div className="user-grid">
            {users.map((u) => (
              <button
                key={u.id}
                type="button"
                className="user-card"
                onClick={() => signIn(u.email)}
                disabled={busy !== null || altchaStatus !== "verified"}
              >
                <span className="avatar" style={{ background: u.color }}>
                  {initials(u.name)}
                </span>
                <span className="user-card-text">
                  <strong>{u.name}</strong>
                  <span className="muted">{u.email}</span>
                </span>
                {busy === u.email ? (
                  <span className="spinner" aria-label="Signing in" />
                ) : (
                  <span className="user-card-arrow" aria-hidden="true">→</span>
                )}
              </button>
            ))}
            {users.length === 0 && <p className="muted">Loading demo users…</p>}
          </div>

          <div className="auth-divider"><span>or create a new user</span></div>

          <form className="auth-form" onSubmit={submitCustom}>
            <div className="field">
              <label className="label" htmlFor="login-name">Display name</label>
              <input
                id="login-name"
                className="input"
                type="text"
                placeholder="Ada Lovelace"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
              />
            </div>
            <div className="field">
              <label className="label" htmlFor="login-email">Email address</label>
              <input
                id="login-email"
                className="input"
                type="email"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
              />
            </div>

            {altchaPill}
            {error && <p className="field-error">{error}</p>}

            <button
              type="submit"
              className="btn primary lg block"
              disabled={busy !== null || altchaStatus !== "verified"}
            >
              {busy ? "Signing in…" : "Continue"}
            </button>
          </form>

          <p className="auth-foot muted">
            Sessions are HMAC-signed, HTTP-only cookies. Sign-in is protected by
            ALTCHA proof-of-work - no CAPTCHAs, no tracking, just a hash puzzle
            your browser solves locally.
          </p>

          <nav className="legal-links" aria-label="Legal">
            <Link to="/privacy">Privacy Policy</Link>
            <span aria-hidden="true">·</span>
            <Link to="/terms">Terms of Service</Link>
          </nav>
        </div>
      </section>
    </main>
  );
}
