import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";
import { useToast } from "../toast";
import type { DocSummary } from "../types";
import { timeAgo, initials } from "../lib/format";
import { IMPORT_ACCEPT, fileToDocContent } from "../lib/importFile";

function DocCard({
  doc,
  kind,
  onDelete,
}: {
  doc: DocSummary;
  kind: "owned" | "shared";
  onDelete: (id: string) => void;
}) {
  return (
    <a className="doc-card" href={`/doc/${doc.id}`}>
      <div className="doc-card-top">
        <h3>{doc.title}</h3>
        <span className="doc-badges">
          {kind === "shared" && <span className="badge">{doc.my_role === "editor" ? "Editor" : "Viewer"}</span>}
          {kind === "owned" && (doc.share_count ?? 0) > 0 && (
            <span className="badge subtle">Shared · {doc.share_count}</span>
          )}
        </span>
      </div>
      <p className="muted">
        {kind === "shared" ? (
          <>
            <span className="avatar tiny" style={{ background: doc.owner_color }}>
              {initials(doc.owner_name)}
            </span>{" "}
            Shared by {doc.owner_name}
          </>
        ) : (
          "Owned by you"
        )}
        {" · "}Edited {timeAgo(doc.updated_at)}
      </p>
      {kind === "owned" && (
        <button
          type="button"
          className="doc-delete"
          title="Delete document"
          aria-label={`Delete ${doc.title}`}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onDelete(doc.id);
          }}
        >
          Delete
        </button>
      )}
    </a>
  );
}

export default function Dashboard() {
  const { user, logout } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [owned, setOwned] = useState<DocSummary[]>([]);
  const [shared, setShared] = useState<DocSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState<string | null>(null);
  const importInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const d = await api<{ owned: DocSummary[]; shared: DocSummary[] }>("/api/documents");
    setOwned(d.owned);
    setShared(d.shared);
  }, []);

  useEffect(() => {
    load()
      .catch((e) => toast(e instanceof Error ? e.message : "Could not load documents."))
      .finally(() => setLoading(false));
  }, [load, toast]);

  const newDoc = async () => {
    try {
      const d = await api<{ document: { id: string } }>("/api/documents", {
        method: "POST",
        body: JSON.stringify({}),
      });
      navigate(`/doc/${d.document.id}`);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not create document.");
    }
  };

  const onImportPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setImporting(file.name);
    try {
      const { title, content } = await fileToDocContent(file);
      const d = await api<{ document: { id: string } }>("/api/documents", {
        method: "POST",
        body: JSON.stringify({ title, content }),
      });
      navigate(`/doc/${d.document.id}`);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Import failed.");
    } finally {
      setImporting(null);
    }
  };

  const deleteDoc = async (id: string) => {
    if (!window.confirm("Delete this document permanently? Access for everyone is removed.")) return;
    try {
      await api(`/api/documents/${id}`, { method: "DELETE" });
      setOwned((prev) => prev.filter((d) => d.id !== id));
      toast("Document deleted.", "ok");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Delete failed.");
    }
  };

  return (
    <div className="shell">
      <header className="app-header">
        <a className="brand" href="/">
          <span className="brand-mark">A</span> Ajaia Docs
        </a>
        <div className="header-actions">
          {user && (
            <span className="user-chip">
              <span className="avatar tiny" style={{ background: user.color }}>
                {initials(user.name)}
              </span>
              {user.name}
            </span>
          )}
          <button type="button" className="btn ghost" onClick={() => logout()}>
            Sign out
          </button>
        </div>
      </header>

      <main className="container">
        <div className="dash-actions">
          <button type="button" className="btn primary" onClick={newDoc}>
            + New document
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => importInput.current?.click()}
            disabled={importing !== null}
          >
            {importing ? `Importing ${importing}…` : "Import .txt / .md / .docx"}
          </button>
          <input
            ref={importInput}
            type="file"
            accept={IMPORT_ACCEPT}
            style={{ display: "none" }}
            onChange={onImportPick}
          />
        </div>

        {loading ? (
          <p className="muted">Loading documents…</p>
        ) : (
          <>
            <section>
              <h2 className="section-title">Owned documents</h2>
              {owned.length === 0 ? (
                <p className="empty muted">
                  No documents yet. Create one, or import a .txt / .md / .docx file to get started.
                </p>
              ) : (
                <div className="card-grid">
                  {owned.map((d) => (
                    <DocCard key={d.id} doc={d} kind="owned" onDelete={deleteDoc} />
                  ))}
                </div>
              )}
            </section>

            <section>
              <h2 className="section-title">Shared with me</h2>
              {shared.length === 0 ? (
                <p className="empty muted">
                  Nothing shared with you yet. Ask another demo user to share a document with{" "}
                  <strong>{user?.email}</strong>.
                </p>
              ) : (
                <div className="card-grid">
                  {shared.map((d) => (
                    <DocCard key={d.id} doc={d} kind="shared" onDelete={deleteDoc} />
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}
