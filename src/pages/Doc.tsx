import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Placeholder from "@tiptap/extension-placeholder";

import { api } from "../api";
import { useToast } from "../toast";
import type { DocDetail } from "../types";
import Toolbar from "../components/Toolbar";
import ShareModal from "../components/ShareModal";
import Attachments from "../components/Attachments";
import HistoryPanel from "../components/HistoryPanel";
import { timeAgo, initials } from "../lib/format";
import { docToHtml, docToMarkdown, downloadBlob, printAsPdf, type Node } from "../lib/exportDoc";
import {
  IconArrowRight,
  IconClock,
  IconDownload,
  IconEye,
  IconPaperclip,
  IconShare,
} from "../icons";

const SAVE_LABEL: Record<string, string> = {
  saved: "Saved",
  dirty: "Unsaved changes",
  saving: "Saving…",
  error: "Save failed",
};

/* ---------- page ---------- */

export default function DocPage() {
  const { id } = useParams<{ id: string }>();
  const toast = useToast();

  const [detail, setDetail] = useState<DocDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [saveState, setSaveState] = useState<"saved" | "dirty" | "saving" | "error">("saved");
  const [shareOpen, setShareOpen] = useState(false);
  const [attOpen, setAttOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [stats, setStats] = useState({ words: 0, chars: 0 });

  /* --- autosave engine: debounce + in-flight dedupe + stale-write guard ---
     - latest.current    : newest content not yet confirmed persisted
     - inflight.current  : a PATCH is on the wire
     - if edits land while a save is in flight, the ref moves on and the
       completed response is recognised as stale (save pill stays "dirty",
       a follow-up save is queued) - no lost writes, no "Saved" lie. */
  const latest = useRef<object | null>(null);
  const savedJson = useRef<string | null>(null);
  const inflight = useRef(false);
  const timer = useRef<number | null>(null);
  const runSaveRef = useRef<() => void>(() => {});

  const runSave = useCallback(async () => {
    if (inflight.current || !id || !latest.current) return;
    const payload = latest.current;
    inflight.current = true;
    setSaveState("saving");
    try {
      await api(`/api/documents/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ content: payload }),
      });
      if (latest.current === payload) {
        latest.current = null;
        savedJson.current = JSON.stringify(payload);
        setSaveState("saved");
        setDetail((prev) =>
          prev
            ? { ...prev, document: { ...prev.document, updated_at: new Date().toISOString() } }
            : prev
        );
      } else {
        setSaveState("dirty"); // edits landed mid-flight; follow-up save below
      }
    } catch (e) {
      setSaveState("error");
      toast(e instanceof Error ? e.message : "Autosave failed.");
    } finally {
      inflight.current = false;
      if (latest.current && timer.current === null) {
        timer.current = window.setTimeout(() => {
          timer.current = null;
          runSaveRef.current();
        }, 250);
      }
    }
  }, [id, toast]);
  runSaveRef.current = () => void runSave();

  const scheduleSave = useCallback(
    (content: object) => {
      // Editor recreation / ProseMirror normalization can emit a no-op update;
      // never mark the doc dirty (or hit the API) when nothing really changed.
      const json = JSON.stringify(content);
      if (json === savedJson.current) return;
      latest.current = content;
      setSaveState((s) => (s === "saving" ? "saving" : "dirty"));
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => {
        timer.current = null;
        runSaveRef.current();
      }, 900);
    },
    []
  );

  // Ctrl/Cmd+S saves immediately; hidden tabs flush best-effort.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "s" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        runSaveRef.current();
      }
    };
    const onVis = () => {
      if (document.visibilityState === "hidden" && latest.current) runSaveRef.current();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("visibilitychange", onVis);
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, []);

  const recount = useCallback((text: string) => {
    const trimmed = text.trim();
    setStats({
      words: trimmed ? trimmed.split(/\s+/).length : 0,
      chars: text.length,
    });
  }, []);

  const reload = useCallback(async () => {
    if (!id) return;
    const d = await api<DocDetail>(`/api/documents/${id}`);
    setDetail(d);
    setTitle(d.document.title);
    savedJson.current = JSON.stringify(d.document.content ?? null);
  }, [id]);

  useEffect(() => {
    reload()
      .then(() => setSaveState("saved"))
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load document."));
  }, [reload]);

  const canEdit = detail ? detail.myRole !== "viewer" : false;

  const editor = useEditor(
    {
      extensions: [
        StarterKit,
        Underline,
        Placeholder.configure({ placeholder: "Start writing your document…" }),
      ],
      content: detail?.document.content ?? { type: "doc", content: [{ type: "paragraph" }] },
      editable: canEdit,
      onUpdate: ({ editor: e }) => {
        scheduleSave(e.getJSON());
        recount(e.getText());
      },
    },
    // Recreate once the document loads so the initial content is correct.
    // (App also keys this page by URL, so switching documents remounts.)
    [detail !== null]
  );

  // Editable state + initial word count once the editor/document exist.
  useEffect(() => {
    if (!editor) return;
    editor.setEditable(canEdit);
    recount(editor.getText());
  }, [editor, canEdit, recount, detail]);

  const commitTitle = async () => {
    if (!detail || !detail.isOwner) return;
    const t = title.trim();
    if (!t || t === detail.document.title) {
      setTitle(detail.document.title);
      return;
    }
    try {
      await api(`/api/documents/${detail.document.id}`, {
        method: "PATCH",
        body: JSON.stringify({ title: t }),
      });
      setDetail((prev) =>
        prev ? { ...prev, document: { ...prev.document, title: t } } : prev
      );
    } catch (e) {
      setTitle(detail.document.title);
      toast(e instanceof Error ? e.message : "Rename failed.");
    }
  };

  /* ---------- export (Markdown + PDF via print pipeline) ---------- */

  const safeName = () =>
    (detail?.document.title ?? "document").replace(/[\\/:*?"<>|]+/g, "").trim() || "document";

  const exportMd = () => {
    if (!editor || !detail) return;
    const md = `# ${detail.document.title}\n\n${docToMarkdown(editor.getJSON() as Node)}\n`;
    downloadBlob(new Blob([md], { type: "text/markdown;charset=utf-8" }), `${safeName()}.md`);
    setExportOpen(false);
    toast("Markdown exported.", "ok");
  };

  const exportPdf = () => {
    if (!editor || !detail) return;
    printAsPdf(docToHtml(editor.getJSON() as Node), detail.document.title);
    setExportOpen(false);
  };

  if (error) {
    return (
      <div className="doc-shell">
        <main className="editor-area" style={{ alignItems: "center", justifyContent: "center" }}>
          <div className="empty-state">
            <div className="empty-icon"><IconEye /></div>
            <h3 className="empty-title">Cannot open this document</h3>
            <p className="muted">{error}</p>
            <Link className="btn primary" to="/">
              Back to documents
            </Link>
          </div>
        </main>
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="doc-shell">
        <div className="doc-loading" style={{ margin: "48px auto", maxWidth: 720 }}>
          <span className="skeleton sk-line w-40" />
          <span className="skeleton sk-line w-90" />
          <span className="skeleton sk-line w-75" />
          <span className="skeleton sk-line w-80" />
          <span className="skeleton sk-line w-60" />
        </div>
      </div>
    );
  }

  const readMinutes = Math.max(1, Math.ceil(stats.words / 200));

  return (
    <div className="doc-shell">
      <header className="doc-topbar">
        <div className="topbar-group">
          <Link to="/" className="btn ghost sm" aria-label="Back to documents">
            <span style={{ display: "inline-flex", transform: "rotate(180deg)" }}>
              <IconArrowRight />
            </span>
          </Link>
          <input
            className="doc-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={commitTitle}
            onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
            disabled={!detail.isOwner}
            aria-label="Document title"
            title={detail.isOwner ? "Click to rename" : "Only the owner can rename"}
          />
          <span className={`save-pill ${saveState}`} role="status">
            {SAVE_LABEL[saveState]}
          </span>
        </div>

        <div className="topbar-group">
          {detail.canShare && detail.shares.length > 0 && (
            <span className="avatar-stack" title={`${detail.shares.length} people have access`}>
              {detail.shares.slice(0, 3).map((s) => (
                <span
                  key={s.user.id}
                  className="avatar sm"
                  style={{ background: s.user.color }}
                  title={`${s.user.name} (${s.role})`}
                >
                  {initials(s.user.name)}
                </span>
              ))}
              {detail.shares.length > 3 && (
                <span className="avatar-more">+{detail.shares.length - 3}</span>
              )}
            </span>
          )}
          {!detail.isOwner && (
            <span className="badge">
              {detail.myRole === "editor" ? "You can edit" : "View-only"}
            </span>
          )}
          <button type="button" className="btn ghost sm" onClick={() => setHistoryOpen((v) => !v)} title="Version history">
            <IconClock /> History
          </button>
          <button
            type="button"
            className={`btn ghost sm${attOpen ? " active" : ""}`}
            onClick={() => setAttOpen((v) => !v)}
            aria-pressed={attOpen}
            title="Attachments"
          >
            <IconPaperclip /> {detail.attachments.length}
          </button>

          <div className="export-wrap">
            <button
              type="button"
              className={`btn ghost sm${exportOpen ? " active" : ""}`}
              onClick={() => setExportOpen((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={exportOpen}
              title="Export"
            >
              <IconDownload /> Export
            </button>
            {exportOpen && (
              <>
                <div className="menu-overlay" onClick={() => setExportOpen(false)} />
                <div className="export-menu" role="menu" aria-label="Export document">
                  <button type="button" role="menuitem" onClick={exportMd}>
                    <IconDownload /> Markdown (.md)
                  </button>
                  <button type="button" role="menuitem" onClick={exportPdf}>
                    <IconDownload /> PDF (print dialog)
                  </button>
                </div>
              </>
            )}
          </div>

          {(detail.isOwner || detail.canShare) && (
            <button type="button" className="btn primary sm" onClick={() => setShareOpen(true)}>
              <IconShare /> Share
            </button>
          )}
        </div>
      </header>

      {detail.myRole === "viewer" && (
        <div className="viewer-banner">
          <IconEye /> You have view-only access to this document.
        </div>
      )}

      <div className="toolbar-wrap">
        <Toolbar editor={editor} disabled={!canEdit} />
      </div>

      <main className="editor-area">
        <article className="sheet">
          <EditorContent editor={editor} />
        </article>
        {attOpen && (
          <Attachments
            docId={detail.document.id}
            attachments={detail.attachments}
            canEdit={canEdit}
            canDeleteAny={detail.isOwner}
            onChanged={() => reload().catch(() => {})}
          />
        )}
        {historyOpen && (
          <HistoryPanel
            docId={detail.document.id}
            canEdit={canEdit}
            onClose={() => setHistoryOpen(false)}
            onRestored={() => reload().catch(() => {})}
          />
        )}
      </main>

      <footer className="statusbar">
        <span className="status-item">
          {stats.words} {stats.words === 1 ? "word" : "words"} · {stats.chars}{" "}
          {stats.chars === 1 ? "character" : "characters"}
        </span>
        <span className="status-item">{readMinutes} min read</span>
        <span className="status-item">Edited {timeAgo(detail.document.updated_at)}</span>
        <span className="status-item">
          {detail.isOwner ? "You own this document" : `Shared by ${detail.document.owner_name}`}
        </span>
        <span className="status-item kbd">Ctrl+S to save now</span>
      </footer>

      {shareOpen && (
        <ShareModal
          docId={detail.document.id}
          shares={detail.shares}
          isOwner={detail.isOwner}
          canShare={detail.canShare ?? detail.isOwner}
          onClose={() => setShareOpen(false)}
          onChanged={() => reload().catch(() => {})}
        />
      )}
    </div>
  );
}
