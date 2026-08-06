-- Phase 4: comments and friend links.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  content TEXT NOT NULL,
  reply_to TEXT NOT NULL DEFAULT '',
  reply_email TEXT NOT NULL DEFAULT '',
  username TEXT NOT NULL,
  email TEXT NOT NULL DEFAULT '',
  website TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  memo_id INTEGER NOT NULL,
  author TEXT NOT NULL DEFAULT '',
  identity_hash TEXT NOT NULL DEFAULT '',
  FOREIGN KEY (memo_id) REFERENCES memos(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_comments_memo_created ON comments(memo_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_comments_identity_created ON comments(identity_hash, created_at DESC);

CREATE TABLE IF NOT EXISTS friends (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  icon TEXT NOT NULL,
  url TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
