import { useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth";
import { useToast } from "../toast";
import { initials } from "../lib/format";
import { IconFileText, IconUser, IconLogout } from "../icons";

/**
 * App shell: dark sidebar (desktop) + mobile top bar + main container.
 * Dashboard and Profile render inside it; the editor page has its own chrome.
 */
export default function Shell({
  active,
  children,
  navCount,
}: {
  active: "docs" | "profile";
  children: ReactNode;
  navCount?: number;
}) {
  const { user, logout } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [signingOut, setSigningOut] = useState(false);

  const signout = async () => {
    setSigningOut(true);
    try {
      await logout();
      navigate("/login", { replace: true });
    } catch (e) {
      toast(e instanceof Error ? e.message : "Sign out failed.");
      setSigningOut(false);
    }
  };

  return (
    <div className="app">
      <aside className="sidebar">
        <Link to="/" className="sidebar-brand">
          <span className="brand-mark">A</span>
          <span>Ajaia Docs</span>
        </Link>

        <nav className="sidebar-nav" aria-label="Primary">
          <Link to="/" className={`nav-item${active === "docs" ? " active" : ""}`}>
            <IconFileText />
            <span>Documents</span>
            {typeof navCount === "number" && <span className="nav-count">{navCount}</span>}
          </Link>
          <Link to="/profile" className={`nav-item${active === "profile" ? " active" : ""}`}>
            <IconUser />
            <span>Profile</span>
          </Link>
        </nav>

        <div className="sidebar-foot">
          {user && (
            <Link to="/profile" className="sidebar-user" title="Open your profile">
              <span className="avatar sm" style={{ background: user.color }}>
                {initials(user.name)}
              </span>
              <span className="sidebar-user-text">
                <strong>{user.name}</strong>
                <small>{user.email}</small>
              </span>
            </Link>
          )}
          <button type="button" className="sidebar-signout" onClick={signout} disabled={signingOut}>
            <IconLogout />
            <span>{signingOut ? "Signing out…" : "Sign out"}</span>
          </button>
        </div>
      </aside>

      <header className="mobile-nav">
        <Link to="/" className="mobile-brand">
          <span className="brand-mark">A</span>
          <span>Ajaia Docs</span>
        </Link>
        <nav aria-label="Mobile navigation">
          <Link to="/" className={`nav-item${active === "docs" ? " active" : ""}`} aria-label="Documents">
            <IconFileText />
          </Link>
          <Link to="/profile" className={`nav-item${active === "profile" ? " active" : ""}`} aria-label="Profile">
            <IconUser />
          </Link>
          <button type="button" className="btn-icon" onClick={signout} disabled={signingOut} aria-label="Sign out">
            <IconLogout />
          </button>
        </nav>
      </header>

      <main className="main">
        <div className="container">{children}</div>
      </main>
    </div>
  );
}
