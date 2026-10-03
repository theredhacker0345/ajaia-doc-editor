/** Small shared UI primitives: modal shell, confirm dialog, error boundary. */

import { Component, useEffect, useRef, useState, type ReactNode } from "react";
import { IconAlert, IconX } from "./icons";

/* ---------- modal shell (Escape + click-outside + scroll lock) ---------- */

export function Modal({
  onClose,
  labelledBy,
  children,
  maxWidth,
}: {
  onClose: () => void;
  labelledBy?: string;
  children: ReactNode;
  maxWidth?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div
      className="modal-overlay"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        style={maxWidth ? { maxWidth } : undefined}
        ref={ref}
      >
        {children}
      </div>
    </div>
  );
}

export function ModalX({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="btn-icon modal-x" onClick={onClick} aria-label="Close dialog">
      <IconX />
    </button>
  );
}

/* ---------- confirm dialog (replaces window.confirm) ---------- */

export interface ConfirmState {
  title: string;
  body: string;
  confirmLabel: string;
  onConfirm: () => void | Promise<void>;
}

export function ConfirmDialog({ state, onClose }: { state: ConfirmState; onClose: () => void }) {
  const [busy, setBusy] = useState(false);

  return (
    <Modal onClose={onClose} labelledBy="confirm-title" maxWidth={440}>
      <div className="confirm-title-icon">
        <IconAlert />
      </div>
      <div className="modal-head">
        <h3 className="modal-title" id="confirm-title">{state.title}</h3>
      </div>
      <p className="modal-body">{state.body}</p>
      <div className="modal-foot">
        <button type="button" className="btn" onClick={onClose} disabled={busy}>
          Cancel
        </button>
        <button
          type="button"
          className="btn outline-danger"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await state.onConfirm();
              onClose();
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Working…" : state.confirmLabel}
        </button>
      </div>
    </Modal>
  );
}

/* ---------- error boundary ---------- */

interface EBState {
  error: Error | null;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, EBState> {
  state: EBState = { error: null };

  static getDerivedStateFromError(error: Error): EBState {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error("Unhandled UI error:", error);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="error-boundary">
          <div className="error-card">
            <div className="confirm-title-icon">
              <IconAlert />
            </div>
            <h2>Something went wrong</h2>
            <p>
              The interface hit an unexpected error. Your documents are safe — reloading the page
              usually resolves this.
            </p>
            <p className="mono" style={{ fontSize: 11, color: "var(--text-3)", overflowWrap: "anywhere" }}>
              {this.state.error.message}
            </p>
            <button type="button" className="btn primary" onClick={() => window.location.reload()}>
              Reload the app
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
