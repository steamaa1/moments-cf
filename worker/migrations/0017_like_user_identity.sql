-- 登录用户点赞使用 user_id 去重；匿名用户继续使用不可逆网络指纹去重。
-- user_id 保留为 NULL，兼容已有匿名点赞记录与旧版 identity_hash 主键。
ALTER TABLE memo_likes ADD COLUMN user_id INTEGER;

CREATE UNIQUE INDEX IF NOT EXISTS idx_memo_likes_user_unique
  ON memo_likes(memo_id, user_id)
  WHERE user_id IS NOT NULL;
