-- Privacy-preserving login failure rate limiting.
-- Both values are HMAC digests; raw IP addresses and usernames are not stored.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS login_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  network_hash TEXT NOT NULL,
  username_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_login_attempts_network_user_created
  ON login_attempts(network_hash, username_hash, created_at DESC);
