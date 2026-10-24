-- Custom pages: per-page navigation icon (Iconify name or emoji).
-- Empty string means the frontend falls back to the default document icon.
ALTER TABLE custom_pages ADD COLUMN nav_icon TEXT NOT NULL DEFAULT '';
