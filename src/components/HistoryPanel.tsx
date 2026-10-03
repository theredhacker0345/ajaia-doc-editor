import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import { useToast } from "../toast";
import type { DocVersion, DocVersionMeta } from "../types";
import { ConfirmDialog, type ConfirmState } from "../ui";
import { timeAgo } from "../lib/format";
import { docToHtml, type Node } from "../lib/exportDoc";
import { IconClock, IconEye, IconUndo, IconX } from "../icons";

/**
 * Version history slide-over: list snapshots, preview one, restore it.
 * Snapshots are created by the server (throttled to one per 2 minutes of
 * active editing) — this panel only reads and restores.
 */
export default function HistoryPanel({
  docId,
  canEdit,
  onClose,
  onRestored,
}: {
  docId: string;
  canEdit: boolean;
  onClose: () => void;
  onRestored: () => void;
}) {
  const [versions, setVersions] = useState<DocVersionMeta[] | null>(null);
  const [selected, setSelected] = useState<DocVersion | null>(null);
  const [loadingBody, setLoadingBody] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const toast = useToast();

  const load = useCallback(async () => {
    const d = await api<{ versions: DocVersionMeta[] }>(`/api/documents/${docId}/versions`);
    setVersions(d.versions);
  }, [docId]);

  useEffect(() => {
    load().catch((e) => {
      toast(e instanceof Error ? e.message : "Could not load version history.");
      setVersions([]);
    });
  }, [load, toast]);

  // Escape closes the panel.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const openVersion = async (no: number) => {
    setLoadingBody(true);
    setSelected(null);
    try {
      const d = await api<{ version: DocVersion }>(`/api/documents/${docId}/versions/${no}`);
      setSelected(d.version);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not load that version.");
    } finally {
      setLoadingBody(false);
    }
  };

  const askRestore = () => {
    if (!selected) return;
    const v = selected;
    setConfirm({
      title: `Restore version ${v.version_no}?`,
      body: `The document will roll back to “${v.title || "Untitled"}” as it was ${timeAgo(
        v.created_at
      )}. The current state is snapshotted first, so nothing is lost.`,
      confirmLabel: "Restore",
      onConfirm: async () => {
        await api(`/api/documents/${docId}/versions/${v.version_no}/restore`, { method: "POST" });
        toast(`Restored version ${v.version_no}.`, "ok");
        onRestored();
        await load();
        setSelected(null);
      },
    });
  };

  return (
    <aside className="history-panel" role="complementary" aria-label="Version history">
      <header className="history-head">
        <h3>
          <IconClock /> Version history
        </h3>
        <button type="button" className="btn-icon" onClick={onClose} aria-label="Close history">
          <IconX />
        </button>
      </header>

      <div className="history-body">
        <div className="ver-list">
          {versions === null && (
            <div className="history-loading">
              <span className="skeleton sk-line w-80" />
              <span className="skeleton sk-line w-60" />
              <span className="skeleton sk-line w-75" />
            </div>
          )}
          {versions?.length === 0 && (
            <p className="muted ver-empty">
              No snapshots yet. Versions are captured automatically as you edit (at most one
              every two minutes), plus on every restore.
            </p>
          )}
          {versions?.map((v, idx) => {
            const isCurrent = idx === 0; // list is sorted newest-first
            const isSelected = selected?.version_no === v.version_no;
            return (
              <button
                key={v.version_no}
                type="button"
                className={`ver-item${isSelected ? " selected" : ""}`}
                onClick={() => void openVersion(v.version_no)}
              >
                <span className="ver-no">v{v.version_no}</span>
                <span className="ver-text">
                  <strong>{v.title || "Untitled"}</strong>
                  <span className="muted">
                    {isCurrent ? "latest snapshot" : timeAgo(v.created_at)} · by{" "}
                    {v.created_by_name}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        <div className="ver-preview">
          {loadingBody && (
            <div className="history-loading">
              <span className="skeleton sk-line w-90" />
              <span className="skeleton sk-line w-75" />
              <span className="skeleton sk-line w-80" />
            </div>
          )}
          {!loadingBody && !selected && (
            <div className="ver-empty-state">
              <IconEye />
              <p className="muted">Pick a snapshot to preview it before restoring.</p>
            </div>
          )}
          {selected && (
            <>
              <div className="ver-preview-head">
                <div>
                  <strong>Version {selected.version_no}</strong>
                  <span className="muted">
                    {" "}
                    · {selected.title || "Untitled"} · {timeAgo(selected.created_at)} · by{" "}
                    {selected.created_by_name}
                  </span>
                </div>
                {canEdit && (
                  <button type="button" className="btn primary sm" onClick={askRestore}>
                    <IconUndo /> Restore
                  </button>
                )}
              </div>
              <div
                className="ver-preview-body"
                /* Content comes from our own stored TipTap JSON rendered through a
                   whitelisted renderer (no raw HTML from the document is trusted). */
                dangerouslySetInnerHTML={{ __html: docToHtml((selected.content ?? {}) as Node) }}
              />
            </>
          )}
        </div>
      </div>

      {confirm && <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />}
    </aside>
  );
}
