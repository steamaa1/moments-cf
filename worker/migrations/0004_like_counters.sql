-- Phase 5: keep memo favorite counters consistent with memo_likes atomically.
PRAGMA foreign_keys = ON;

UPDATE memos
SET fav_count = (SELECT COUNT(*) FROM memo_likes WHERE memo_likes.memo_id = memos.id);

CREATE TRIGGER IF NOT EXISTS trg_memo_likes_insert
AFTER INSERT ON memo_likes
BEGIN
  UPDATE memos
  SET fav_count = fav_count + 1,
      updated_at = CURRENT_TIMESTAMP
  WHERE id = NEW.memo_id;
END;

CREATE TRIGGER IF NOT EXISTS trg_memo_likes_delete
AFTER DELETE ON memo_likes
BEGIN
  UPDATE memos
  SET fav_count = MAX(0, fav_count - 1),
      updated_at = CURRENT_TIMESTAMP
  WHERE id = OLD.memo_id;
END;
