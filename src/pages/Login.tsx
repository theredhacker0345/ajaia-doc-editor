import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";
import type { User } from "../types";
import { initials } from "../lib/format";

/**
 * Mock-auth sign-in (explicitly allowed by the assignment):
 * one-click sign-in for seeded demo users, or create a new user with
 * name + email. No passwords by design - documented in ARCHITECTURE.md.
 */
export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [users, setUsers] = useState<User[]>([]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ users: User[] }>("/api/auth/users")
      .then((d) => setUsers(d.users))
      .catch(() => setUsers([]));
  }, []);

  const signIn = async (targetEmail: string, targetName?: string) => {
    setError(null);
    setBusy(targetEmail);
    try {
      await login(targetEmail, targetName);
      navigate("/", { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign-in failed.");
    } finally {
      setBusy(null);
    }
  };

  const submitCustom = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    signIn(email.trim(), name.trim() || undefined);
  };

  return (
    <main className="login-page">
      <div className="login-card">
        <div className="brand-row">
          <span className="brand-mark">A</span>
          <h1>Ajaia Docs</h1>
        </div>
        <p className="login-sub">
          A lightweight collaborative document editor.{" "}
          <span className="muted">Full Stack Developer assignment - Ubaid ur Rehman.</span>
        </p>

        <h2 className="login-heading">Sign in as a demo user</h2>
        <div className="user-grid">
          {users.map((u) => (
            <button
              key={u.id}
              type="button"
              className="user-card"
              onClick={() => signIn(u.email)}
              disabled={busy !== null}
            >
              <span className="avatar" style={{ background: u.color }}>
                {initials(u.name)}
              </span>
              <span className="user-card-text">
                <strong>{u.name}</strong>
                <span className="muted">{u.email}</span>
              </span>
              {busy === u.email && <span className="spinner" aria-label="Signing in" />}
            </button>
          ))}
          {users.length === 0 && <p className="muted">Loading demo users…</p>}
        </div>

        <div className="login-divider"><span>or create a new user</span></div>

        <form className="login-form" onSubmit={submitCustom}>
          <input
            type="text"
            placeholder="Display name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-label="Display name"
          />
          <input
            type="email"
            placeholder="Email address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-label="Email address"
            required
          />
          <button type="submit" className="btn primary" disabled={busy !== null}>
            {busy ? "Signing in…" : "Continue"}
          </button>
        </form>

        {error && <p className="form-error">{error}</p>}

        <p className="login-footnote muted">
          Mock auth for the assignment demo: sessions are signed HTTP-only cookies, there are no
          passwords. Built with Cloudflare Workers, D1, React and TipTap.
        </p>
      </div>
    </main>
  );
}
