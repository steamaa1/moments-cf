-- Photo wall albums and administrator-curated photos.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS photo_albums (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  cover_url TEXT NOT NULL DEFAULT '',
  is_default INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0, 1)),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_photo_albums_default ON photo_albums(is_default) WHERE is_default=1;
CREATE INDEX IF NOT EXISTS idx_photo_albums_order ON photo_albums(sort_order, updated_at DESC);

CREATE TABLE IF NOT EXISTS photo_album_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  album_id INTEGER NOT NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('memo', 'upload')),
  source_ref TEXT NOT NULL,
  source_index INTEGER NOT NULL DEFAULT 0,
  image_url TEXT NOT NULL DEFAULT '',
  caption TEXT NOT NULL DEFAULT '',
  featured INTEGER NOT NULL DEFAULT 0 CHECK (featured IN (0, 1)),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (album_id) REFERENCES photo_albums(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE (album_id, source_type, source_ref, source_index)
);
CREATE INDEX IF NOT EXISTS idx_photo_album_items_order ON photo_album_items(album_id, sort_order, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_photo_album_items_featured ON photo_album_items(featured, sort_order, created_at DESC);

INSERT OR IGNORE INTO photo_albums (id, name, description, is_default, sort_order)
VALUES (1, '全部照片', '聚合所有公开动态中的照片', 1, 0);
