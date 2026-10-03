import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Placeholder from "@tiptap/extension-placeholder";

import { api } from "../api";
import { useAuth } from "../auth";
import { useToast } from "../toast";
import type { DocDetail } from "../types";
import Toolbar from "../components/Toolbar";
import ShareModal from "../components/ShareModal";
import Attachments from "../components/Attachments";
import { initials } from "../lib/format";

const SAVE_LABEL: Record<string, string> = {
  saved: "Saved",
  dirty: "Unsaved changes",
  saving: "Saving…",
  error: "Save failed",
};

export default function DocPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const toast = useToast();

  const [detail, setDetail] = useState<DocDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [saveState, setSaveState] = useState<"saved" | "dirty" | "saving" | "error">("saved");
  const [shareOpen, setShareOpen] = useState(false);
  const [attOpen, setAttOpen] = useState(false);

  const saveTimer = useRef<number | null>(null);
  const latestContent = useRef<object | null>(null);

  const reload = useCallback(async () => {
    if (!id) return;
    const d = await api<DocDetail>(`/api/documents/${id}`);
    setDetail(d);
    setTitle(d.document.title);
  }, [id]);

  useEffect(() => {
    reload().catch((e) => setError(e instanceof Error ? e.message : "Could not load document."));
  }, [reload]);

  const doSave = useCallback(
    async (content: object) => {
      if (!id) return;
      setSaveState("saving");
      try {
        await api(`/api/documents/${id}`, { method: "PATCH", body: JSON.stringify({ content }) });
        setSaveState("saved");
      } catch (e) {
        setSaveState("error");
        toast(e instanceof Error ? e.message : "Autosave failed.");
      }
    },
    [id, toast]
  );

  const scheduleSave = useCallback(
    (content: object) => {
      latestContent.current = content;
      setSaveState("dirty");
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(() => doSave(latestContent.current as object), 900);
    },
    [doSave]
  );

  // Best-effort flush when the tab is hidden.
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "hidden" && saveTimer.current && latestContent.current) {
        window.clearTimeout(saveTimer.current);
        void doSave(latestContent.current);
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [doSave]);

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
      onUpdate: ({ editor: e }) => scheduleSave(e.getJSON()),
    },
    // Recreate once the document loads so the initial content is correct.
    [detail !== null]
  );

  // Keep editable state in sync if role changes after a reload.
  useEffect(() => {
    if (editor) editor.setEditable(canEdit);
  }, [editor, canEdit]);

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

  if (error) {
    return (
      <div className="shell">
        <header className="app-header">
          <Link className="brand" to="/">
            <span className="brand-mark">A</span> Ajaia Docs
          </Link>
        </header>
        <main className="container">
          <div className="empty-state">
            <h2>Cannot open this document</h2>
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
    return <div className="page-loading">Loading document…</div>;
  }

  return (
    <div className="shell doc-shell">
      <header className="app-header doc-header">
        <Link className="brand" to="/">
          <span className="brand-mark">A</span> Ajaia Docs
        </Link>

        <div className="doc-title-wrap">
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
          <span className={`save-state ${saveState}`}>{SAVE_LABEL[saveState]}</span>
        </div>

        <div className="header-actions">
          {detail.isOwner && detail.shares.length > 0 && (
            <span className="user-chip">
              {detail.shares.slice(0, 3).map((s) => (
                <span key={s.user.id} className="avatar tiny" style={{ background: s.user.color }} title={`${s.user.name} (${s.role})`}>
                  {initials(s.user.name)}
                </span>
              ))}
              {detail.shares.length > 3 && <span className="muted">+{detail.shares.length - 3}</span>}
            </span>
          )}
          {!detail.isOwner && (
            <span className="badge">
              {detail.myRole === "editor" ? "Shared with you · editor" : "Shared with you · viewer"}
            </span>
          )}
          <button type="button" className="btn" onClick={() => setAttOpen((v) => !v)}>
            Attachments ({detail.attachments.length})
          </button>
          {detail.isOwner && (
            <button type="button" className="btn primary" onClick={() => setShareOpen(true)}>
              Share
            </button>
          )}
        </div>
      </header>

      {detail.myRole === "viewer" && (
        <div className="viewer-banner">You have view-only access to this document.</div>
      )}

      <Toolbar editor={editor} disabled={!canEdit} />

      <main className="editor-area">
        <div className="sheet">
          <EditorContent editor={editor} />
        </div>
        {attOpen && (
          <Attachments
            docId={detail.document.id}
            attachments={detail.attachments}
            canEdit={canEdit}
            canDeleteAny={detail.isOwner}
            onChanged={() => reload().catch(() => {})}
          />
        )}
      </main>

      {shareOpen && (
        <ShareModal
          docId={detail.document.id}
          shares={detail.shares}
          onClose={() => setShareOpen(false)}
          onChanged={() => reload().catch(() => {})}
        />
      )}
    </div>
  );
}
