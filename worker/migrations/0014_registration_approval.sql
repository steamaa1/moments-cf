-- 注册审批：注册理由 + 审批状态（1=已批准 0=待审批 2=已拒绝）
-- 存量用户默认 1（已批准），不受影响。
ALTER TABLE users ADD COLUMN registration_reason TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN registration_state INTEGER NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS idx_users_registration_state ON users(registration_state, created_at);
