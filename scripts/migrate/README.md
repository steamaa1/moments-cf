# Legacy Moments migration helpers

All commands are read-only against the legacy source. They never delete or modify `db.sqlite` or `upload/`.

```bash
python3 scripts/migrate/export-sqlite.py /path/to/db.sqlite --output export
python3 scripts/migrate/build-media-manifest.py /path/to/upload --output media-manifest.json
python3 scripts/migrate/verify-migration.py --export-dir export --media-manifest media-manifest.json
```

`export-sqlite.py` produces reviewable JSON, not direct production writes. `verify-migration.py` checks exported row counts and verifies each media file with both byte size and SHA-256. Importing into D1/R2 should be a separately confirmed operation after checking IDs, counts and media references.

Functional test (uses only a temporary SQLite database and temporary media files):

```bash
python3 tests/phase5-tools.test.py
```
