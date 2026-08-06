-- Phase 6: keep comment counters consistent and add a recoverable media trash state.
PRAGMA foreign_keys = ON;

UPDATE memos
SET comment_count = (SELECT COUNT(*) FROM comments WHERE comments.memo_id = memos.id);

CREATE TRIGGER IF NOT EXISTS trg_comments_insert
AFTER INSERT ON comments
BEGIN
  UPDATE memos
  SET comment_count = comment_count + 1,
      updated_at = CURRENT_TIMESTAMP
  WHERE id = NEW.memo_id;
END;

CREATE TRIGGER IF NOT EXISTS trg_comments_delete
AFTER DELETE ON comments
BEGIN
  UPDATE memos
  SET comment_count = MAX(0, comment_count - 1),
      updated_at = CURRENT_TIMESTAMP
  WHERE id = OLD.memo_id;
END;

ALTER TABLE media ADD COLUMN trashed_at TEXT;
CREATE INDEX IF NOT EXISTS idx_media_owner_trash ON media(owner_id, trashed_at, created_at DESC);
