-- Phase 3: Moments, tags and anonymous like deduplication.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS memos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  content TEXT NOT NULL DEFAULT '',
  imgs TEXT NOT NULL DEFAULT '',
  fav_count INTEGER NOT NULL DEFAULT 0,
  comment_count INTEGER NOT NULL DEFAULT 0,
  user_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  location TEXT NOT NULL DEFAULT '',
  external_url TEXT NOT NULL DEFAULT '',
  external_title TEXT NOT NULL DEFAULT '',
  external_favicon TEXT NOT NULL DEFAULT '/favicon.png',
  pinned INTEGER NOT NULL DEFAULT 0,
  ext TEXT NOT NULL DEFAULT '{}',
  show_type INTEGER NOT NULL DEFAULT 1 CHECK (show_type IN (0, 1)),
  tags TEXT NOT NULL DEFAULT '',
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS memo_likes (
  memo_id INTEGER NOT NULL,
  identity_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (memo_id, identity_hash),
  FOREIGN KEY (memo_id) REFERENCES memos(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_memos_visibility_created ON memos(show_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_memos_user_created ON memos(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_memos_pinned_created ON memos(pinned DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_memo_likes_memo ON memo_likes(memo_id);
