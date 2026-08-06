-- Phase 7: content-addressed uploads and browser-generated thumbnails.
PRAGMA foreign_keys = ON;

ALTER TABLE media ADD COLUMN sha256 TEXT;
ALTER TABLE media ADD COLUMN thumbnail_key TEXT;
ALTER TABLE media ADD COLUMN upload_state TEXT NOT NULL DEFAULT 'ready';

CREATE INDEX IF NOT EXISTS idx_media_owner_sha256 ON media(owner_id, sha256);
CREATE INDEX IF NOT EXISTS idx_media_upload_state ON media(upload_state, created_at);
