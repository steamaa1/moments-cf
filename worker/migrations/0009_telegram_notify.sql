-- Phase 9: Telegram notification chat id per user.
ALTER TABLE users ADD COLUMN telegram_chat_id TEXT NOT NULL DEFAULT '';
