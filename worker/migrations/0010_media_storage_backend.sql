-- Record the physical storage backend for each media object.
-- Existing media predates pluggable storage and was stored in Cloudflare R2.
PRAGMA foreign_keys = ON;

ALTER TABLE media ADD COLUMN storage_backend TEXT NOT NULL DEFAULT 'r2'
  CHECK (storage_backend IN ('r2', 's3', 'webdav'));

CREATE INDEX IF NOT EXISTS idx_media_storage_backend ON media(storage_backend, r2_key);
