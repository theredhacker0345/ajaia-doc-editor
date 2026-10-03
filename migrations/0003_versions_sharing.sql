-- Migration 0003: document version history + advanced sharing permissions.
-- (SQLite cannot add IF NOT EXISTS to ALTER TABLE - run each migration once;
--  scripts/provision.mjs gates 0002/0003 via pragma checks so CI stays idempotent.)

-- Advanced sharing: invite-more privilege and optional grant expiry.
ALTER TABLE document_access ADD COLUMN can_share INTEGER NOT NULL DEFAULT 0;
ALTER TABLE document_access ADD COLUMN expires_at TEXT;

-- Version history: snapshots of document content (capped at 50 per document).
CREATE TABLE IF NOT EXISTS doc_versions (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  version_no INTEGER NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (document_id, version_no)
);

CREATE INDEX IF NOT EXISTS idx_versions_doc ON doc_versions(document_id, version_no);
