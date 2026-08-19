-- Atomically enforce anonymous comment quotas per network and UTC minute bucket.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS comment_rate_buckets (
  network_hash TEXT NOT NULL,
  window_start TEXT NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 0 CHECK (request_count >= 0),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (network_hash, window_start)
);

CREATE INDEX IF NOT EXISTS idx_comment_rate_buckets_updated
  ON comment_rate_buckets(updated_at);
