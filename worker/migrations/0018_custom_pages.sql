-- Custom pages: admin-authored standalone pages served at root-level /<slug>.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS custom_pages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  show_in_nav INTEGER NOT NULL DEFAULT 0 CHECK (show_in_nav IN (0, 1)),
  sort_order INTEGER NOT NULL DEFAULT 0,
  seo_description TEXT NOT NULL DEFAULT '',
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_custom_pages_slug ON custom_pages(slug);
CREATE INDEX IF NOT EXISTS idx_custom_pages_nav ON custom_pages(enabled, show_in_nav, sort_order);
