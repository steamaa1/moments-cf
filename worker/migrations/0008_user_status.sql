-- Phase 8: WeChat-style user status (one active status per user, expires after duration).
CREATE TABLE IF NOT EXISTS user_status (
  user_id INTEGER PRIMARY KEY,
  icon TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL,
  remark TEXT NOT NULL DEFAULT '',
  duration_hours REAL NOT NULL DEFAULT 24,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_user_status_expires ON user_status(expires_at);
