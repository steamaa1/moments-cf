-- Prevent anonymous like duplication by rotating or dropping the browser cookie.
-- The network identity is an HMAC; the original client IP is never persisted.
PRAGMA foreign_keys = ON;

ALTER TABLE memo_likes ADD COLUMN network_hash TEXT NOT NULL DEFAULT '';
CREATE UNIQUE INDEX IF NOT EXISTS idx_memo_likes_network_unique
  ON memo_likes(memo_id, network_hash)
  WHERE network_hash <> '';
