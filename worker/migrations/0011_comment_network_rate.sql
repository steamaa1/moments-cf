-- Add a privacy-preserving network identity for anonymous comment rate limiting.
-- Only an HMAC is stored; the original client IP is never persisted.
PRAGMA foreign_keys = ON;

ALTER TABLE comments ADD COLUMN network_hash TEXT NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS idx_comments_network_created ON comments(network_hash, created_at DESC);
