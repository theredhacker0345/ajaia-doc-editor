import { Link } from "react-router-dom";
import { IconArrowRight, IconShield } from "../icons";

export type LegalKind = "privacy" | "terms";

const LAST_UPDATED = "October 4, 2026";

function Privacy() {
  return (
    <>
      <p>
        <strong>Short version:</strong> Ajaia Docs stores only what it needs to run — your
        display name, email, and the documents you create. There are no ads, no trackers,
        no third-party analytics, and no advertising cookies. Ever.
      </p>

      <h3>1. What we collect</h3>
      <ul>
        <li>
          <strong>Account data</strong> — the display name and email you sign in with (mock
          auth: no passwords are collected, stored, or hashed, because none exist). Recipients
          you share a document with are auto-registered the same way.
        </li>
        <li>
          <strong>Content</strong> — the documents you write, their version snapshots, and any
          files you attach (≤ 2 MB each). You can delete any document at any time; deleting
          removes its content, snapshots, attachments and share grants.
        </li>
        <li>
          <strong>Profile fields</strong> — optional title, bio, location and website you may
          add on the Profile page.
        </li>
      </ul>

      <h3>2. What we do <em>not</em> collect</h3>
      <ul>
        <li>No analytics or behavioral tracking of any kind.</li>
        <li>No advertising or third-party marketing cookies.</li>
        <li>
          No CAPTCHA cookies either — human verification uses <strong>ALTCHA</strong>, a
          proof-of-work puzzle your browser solves locally. It sends no data anywhere and
          stores nothing about you.
        </li>
      </ul>

      <h3>3. Cookies</h3>
      <p>
        Exactly one cookie is set: a strictly necessary, HTTP-only <code>session</code> cookie
        that keeps you signed in for up to 7 days. It is signed with HMAC-SHA256, contains a
        random user id and expiry (never document content), and is deleted when you sign out.
      </p>

      <h3>4. Where your data lives</h3>
      <p>
        All data is stored in Cloudflare D1 (SQLite) inside Cloudflare's network and served by
        a Cloudflare Worker. Access to documents is enforced server-side on every request via
        an owner / editor / viewer permission model.
      </p>

      <h3>5. Your controls</h3>
      <ul>
        <li>Edit your name and profile fields any time on the Profile page.</li>
        <li>Delete any document you own — content, versions, attachments and grants go with it.</li>
        <li>Revoke any share you granted with one click.</li>
        <li>
          Questions or deletion requests: <code>arifubaid0345@gmail.com</code>.
        </li>
      </ul>

      <h3>6. Scope note</h3>
      <p>
        Ajaia Docs is a portfolio/assessment project. It exists to demonstrate engineering, not
        to profile anyone — which is why the privacy design is "collect nothing, track nobody"
        by default rather than by policy document alone.
      </p>
    </>
  );
}

function Terms() {
  return (
    <>
      <p>
        <strong>Short version:</strong> this is a demonstration application built for the Ajaia
        AI-Native Full Stack Developer assignment. Use it freely to evaluate the work; don't
        rely on it as production infrastructure yet.
      </p>

      <h3>1. Acceptance</h3>
      <p>
        By using Ajaia Docs you agree to these terms. If you do not agree, please do not use
        the application.
      </p>

      <h3>2. The service</h3>
      <p>
        Ajaia Docs provides collaborative rich-text documents with sharing, attachments,
        version history and import/export. Sign-in is a documented mock-auth model (one click,
        no passwords) protected by an ALTCHA proof-of-work; it is intentionally not a
        production identity system.
      </p>

      <h3>3. Acceptable use</h3>
      <ul>
        <li>Do not use the service to store or distribute unlawful or harmful content.</li>
        <li>Do not attempt to bypass the ALTCHA human-verification or permission checks.</li>
        <li>Do not upload files above the 2 MB attachment limit or abuse the API.</li>
      </ul>

      <h3>4. Availability &amp; warranty</h3>
      <p>
        The service is provided <strong>"as is"</strong> without warranties of any kind. It runs
        on Cloudflare's free tier; availability, correctness and durability are not guaranteed
        for production use. Version history reduces accidental loss but is not a backup system.
      </p>

      <h3>5. Content ownership &amp; responsibility</h3>
      <p>
        You keep all rights to the content you write. You are responsible for what you create
        and whom you share it with. When you share a document, recipients receive the level of
        access you granted (editor or viewer), including any expiry you set.
      </p>

      <h3>6. Limitation of liability</h3>
      <p>
        To the maximum extent permitted by law, the author is not liable for any damages
        arising from use of, or inability to use, this application — including lost documents,
        lost profits, or data loss.
      </p>

      <h3>7. Changes</h3>
      <p>
        These terms may be updated as the project evolves; material changes will update the
        "last updated" date below.
      </p>
    </>
  );
}

export default function Legal({ kind }: { kind: LegalKind }) {
  const isPrivacy = kind === "privacy";
  return (
    <main className="legal-page">
      <header className="legal-topbar">
        <Link to="/" className="sidebar-brand">
          <span className="brand-mark">A</span>
          <span>Ajaia Docs</span>
        </Link>
        <Link to="/" className="btn ghost sm">
          <span style={{ display: "inline-flex", transform: "rotate(180deg)" }}>
            <IconArrowRight />
          </span>
          Back to the app
        </Link>
      </header>

      <div className="legal-sheet">
        <div className="legal-head">
          <span className="legal-shield"><IconShield size={22} /></span>
          <h1>{isPrivacy ? "Privacy Policy" : "Terms of Service"}</h1>
          <p className="muted">Last updated {LAST_UPDATED}</p>
        </div>

        {isPrivacy ? <Privacy /> : <Terms />}

        <div className="legal-switch">
          {isPrivacy ? (
            <Link to="/terms">Read the Terms of Service →</Link>
          ) : (
            <Link to="/privacy">Read the Privacy Policy →</Link>
          )}
        </div>
      </div>

      <footer className="legal-foot">
        <span>© {new Date().getFullYear()} Ubaid ur Rehman · Ajaia Docs</span>
        <nav aria-label="Legal">
          <Link to="/privacy">Privacy</Link>
          <Link to="/terms">Terms</Link>
        </nav>
      </footer>
    </main>
  );
}
