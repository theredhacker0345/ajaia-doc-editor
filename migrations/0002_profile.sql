-- Migration 0002: user profile fields + ALTCHA replay ledger.
-- (SQLite cannot add IF NOT EXISTS to ALTER TABLE - run each migration once.)

ALTER TABLE users ADD COLUMN title TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN bio TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN location TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN website TEXT NOT NULL DEFAULT '';

-- Solved ALTCHA challenges (replay protection for sign-in).
CREATE TABLE IF NOT EXISTS altcha_seen (
  challenge TEXT PRIMARY KEY,
  seen_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_altcha_seen_at ON altcha_seen(seen_at);
