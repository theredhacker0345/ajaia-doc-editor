import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";
import { useToast } from "../toast";
import type { DocSummary } from "../types";
import Shell from "../components/Shell";
import { ConfirmDialog, type ConfirmState } from "../ui";
import { timeAgo, initials } from "../lib/format";
import { IMPORT_ACCEPT, fileToDocContent } from "../lib/importFile";
import { IconFileText, IconPlus, IconSearch, IconTrash, IconUpload } from "../icons";

type Seg = "all" | "owned" | "shared";
type SortKey = "recent" | "title" | "oldest";

const SORTERS: Record<SortKey, (a: DocSummary, b: DocSummary) => number> = {
  recent: (a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at),
  oldest: (a, b) => Date.parse(a.updated_at) - Date.parse(b.updated_at),
  title: (a, b) => a.title.localeCompare(b.title),
};

const SORT_LABEL: Record<SortKey, string> = {
  recent: "Recently edited",
  title: "Title A–Z",
  oldest: "Oldest first",
};

function DocCard({
  doc,
  kind,
  onDelete,
}: {
  doc: DocSummary;
  kind: "owned" | "shared";
  onDelete: (doc: DocSummary) => void;
}) {
  return (
    <article className="doc-card">
      <div className="doc-card-head">
        <span className="doc-icon"><IconFileText /></span>
        <span className="doc-badges">
          {kind === "shared" && (
            <span className="badge">{doc.my_role === "editor" ? "Editor" : "Viewer"}</span>
          )}
          {kind === "owned" && (doc.share_count ?? 0) > 0 && (
            <span className="badge subtle">Shared · {doc.share_count}</span>
          )}
        </span>
      </div>

      <h3 className="doc-card-title">
        <Link to={`/doc/${doc.id}`}>{doc.title}</Link>
      </h3>

      {doc.excerpt ? (
        <p className="doc-card-excerpt">{doc.excerpt}</p>
      ) : (
        <p className="doc-card-excerpt muted">No content yet — open to start writing.</p>
      )}

      <p className="doc-card-meta">
        {kind === "shared" ? (
          <>
            <span className="avatar xs" style={{ background: doc.owner_color }}>
              {initials(doc.owner_name)}
            </span>{" "}
            {doc.owner_name} ·
          </>
        ) : (
          "You ·"
        )}{" "}
        edited {timeAgo(doc.updated_at)}
      </p>

      {kind === "owned" && (
        <div className="doc-card-actions">
          <button
            type="button"
            className="btn-icon"
            title="Delete document"
            aria-label={`Delete ${doc.title}`}
            onClick={() => onDelete(doc)}
          >
            <IconTrash />
          </button>
        </div>
      )}
    </article>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const [owned, setOwned] = useState<DocSummary[]>([]);
  const [shared, setShared] = useState<DocSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [seg, setSeg] = useState<Seg>("all");
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("recent");
  const [importing, setImporting] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
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

  const askDelete = (doc: DocSummary) => {
    setConfirm({
      title: "Delete document",
      body: `"${doc.title}" will be permanently removed, along with its attachments, version history and sharing access for everyone.`,
      confirmLabel: "Delete",
      onConfirm: async () => {
        await api(`/api/documents/${doc.id}`, { method: "DELETE" });
        setOwned((prev) => prev.filter((d) => d.id !== doc.id));
        setShared((prev) => prev.filter((d) => d.id !== doc.id));
        toast("Document deleted.", "ok");
      },
    });
  };

  const q = query.trim().toLowerCase();
  const sortFn = SORTERS[sortKey];
  const filter = (list: DocSummary[]) =>
    (q ? list.filter((d) => d.title.toLowerCase().includes(q)) : list).sort(sortFn);

  const fOwned = useMemo(() => filter(owned), [owned, q, sortFn]); // eslint-disable-line react-hooks/exhaustive-deps
  const fShared = useMemo(() => filter(shared), [shared, q, sortFn]); // eslint-disable-line react-hooks/exhaustive-deps
  const total = owned.length + shared.length;

  const renderGrid = (list: DocSummary[], kind: "owned" | "shared") => (
    <div className="card-grid">
      {list.map((d) => (
        <DocCard key={d.id} doc={d} kind={kind} onDelete={askDelete} />
      ))}
    </div>
  );

  const renderSection = (label: string, list: DocSummary[], kind: "owned" | "shared") => (
    <section>
      <h2 className="section-label">{label}</h2>
      {list.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon"><IconFileText /></div>
          <h3 className="empty-title">
            {q ? `No matches for "${query.trim()}"` : kind === "owned" ? "No documents yet" : "Nothing shared with you yet"}
          </h3>
          <p className="muted">
            {q
              ? "Try a different search term."
              : kind === "owned"
                ? "Create a blank document, or import a .txt / .md / .docx file to get started."
                : `Ask someone to share a document with ${user?.email} — it will appear here the moment they do.`}
          </p>
          {!q && kind === "owned" && (
            <button type="button" className="btn primary sm" onClick={newDoc}>
              <IconPlus /> New document
            </button>
          )}
        </div>
      ) : (
        renderGrid(list, kind)
      )}
    </section>
  );

  return (
    <Shell active="docs" navCount={total}>
      <div className="page-head">
        <div>
          <h1 className="page-title">Documents</h1>
          <p className="page-sub">
            Welcome back{user ? `, ${user.name.split(" ")[0]}` : ""} — {total}{" "}
            {total === 1 ? "document" : "documents"} in your workspace.
          </p>
        </div>
        <div className="dash-toolbar">
          <label className="search-box">
            <IconSearch />
            <input
              type="search"
              placeholder="Search documents…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search documents"
            />
          </label>
          <div className="seg" role="tablist" aria-label="Filter documents">
            {(
              [
                ["all", `All (${total})`],
                ["owned", `Owned (${owned.length})`],
                ["shared", `Shared (${shared.length})`],
              ] as Array<[Seg, string]>
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={seg === value}
                className={`seg-btn${seg === value ? " active" : ""}`}
                onClick={() => setSeg(value)}
              >
                {label}
              </button>
            ))}
          </div>
          <select
            className="select"
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            aria-label="Sort documents"
          >
            {(Object.keys(SORT_LABEL) as SortKey[]).map((k) => (
              <option key={k} value={k}>{SORT_LABEL[k]}</option>
            ))}
          </select>
          <button
            type="button"
            className="btn"
            onClick={() => importInput.current?.click()}
            disabled={importing !== null}
          >
            <IconUpload /> {importing ? "Importing…" : "Import"}
          </button>
          <button type="button" className="btn primary" onClick={newDoc}>
            <IconPlus /> New document
          </button>
          <input
            ref={importInput}
            type="file"
            accept={IMPORT_ACCEPT}
            style={{ display: "none" }}
            onChange={onImportPick}
          />
        </div>
      </div>

      {loading ? (
        <div className="card-grid doc-loading" aria-hidden="true">
          {Array.from({ length: 6 }, (_, i) => (
            <div className="sk-card" key={i}>
              <span className="skeleton sk-line w-40" />
              <span className="skeleton sk-line w-90" />
              <span className="skeleton sk-line w-75" />
              <span className="skeleton sk-line w-60" />
            </div>
          ))}
        </div>
      ) : (
        <>
          {(seg === "all" || seg === "owned") && renderSection("Owned by you", fOwned, "owned")}
          {(seg === "all" || seg === "shared") && renderSection("Shared with you", fShared, "shared")}
        </>
      )}

      {confirm && <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />}
    </Shell>
  );
}
