-- Phase 8: track legacy migration packages and prevent duplicate imports.
CREATE TABLE IF NOT EXISTS migration_runs (
  package_id TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('importing', 'completed', 'failed')),
  summary TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS migration_items (
  package_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  source_id TEXT NOT NULL,
  target_id INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (package_id, kind, source_id),
  FOREIGN KEY (package_id) REFERENCES migration_runs(package_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_migration_items_package_kind ON migration_items(package_id, kind);
