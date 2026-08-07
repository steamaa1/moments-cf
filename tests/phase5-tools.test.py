#!/usr/bin/env python3
"""Functional tests for SQL migrations through Phase 7 and read-only migration helpers."""
from __future__ import annotations

import hashlib
import json
import sqlite3
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MIGRATIONS = ROOT / "worker" / "migrations"


def run(*args: str, expect: int = 0) -> subprocess.CompletedProcess[str]:
    result = subprocess.run(
        [sys.executable, *args],
        cwd=ROOT,
        text=True,
        capture_output=True,
        check=False,
    )
    if result.returncode != expect:
        raise AssertionError(
            f"command returned {result.returncode}, expected {expect}: {args}\n"
            f"stdout:\n{result.stdout}\nstderr:\n{result.stderr}"
        )
    return result


def apply_sql(connection: sqlite3.Connection, name: str) -> None:
    connection.executescript((MIGRATIONS / name).read_text(encoding="utf-8"))


def prepare_database(database: Path) -> None:
    connection = sqlite3.connect(database)
    try:
        for name in ("0001_schema.sql", "0002_memos.sql", "0003_comments_friends.sql"):
            apply_sql(connection, name)
        connection.execute(
            "INSERT INTO users (username, nickname, password_hash) VALUES (?, ?, ?)",
            ("admin", "Admin", "test-only-hash"),
        )
        connection.execute("INSERT INTO memos (content, user_id, fav_count, comment_count) VALUES (?, 1, 9, 9)", ("memo",))
        connection.execute("INSERT INTO memo_likes (memo_id, identity_hash) VALUES (1, 'browser-a')")
        connection.execute("INSERT INTO comments (content, username, memo_id) VALUES ('legacy comment', 'guest', 1)")
        connection.execute("INSERT INTO media (owner_id, r2_key, original_filename, content_type, size_bytes) VALUES (1, 'media/test.webp', 'test.webp', 'image/webp', 10)")
        connection.commit()
    finally:
        connection.close()


def test_like_counter_triggers(database: Path) -> None:
    connection = sqlite3.connect(database)
    try:
        apply_sql(connection, "0004_like_counters.sql")
        count = connection.execute("SELECT fav_count FROM memos WHERE id=1").fetchone()[0]
        if count != 1:
            raise AssertionError(f"migration reconciliation expected fav_count=1, found {count}")
        connection.execute("INSERT OR IGNORE INTO memo_likes (memo_id, identity_hash) VALUES (1, 'browser-a')")
        count = connection.execute("SELECT fav_count FROM memos WHERE id=1").fetchone()[0]
        if count != 1:
            raise AssertionError(f"duplicate like changed fav_count to {count}")
        connection.execute("INSERT INTO memo_likes (memo_id, identity_hash) VALUES (1, 'browser-b')")
        count = connection.execute("SELECT fav_count FROM memos WHERE id=1").fetchone()[0]
        if count != 2:
            raise AssertionError(f"insert trigger expected fav_count=2, found {count}")
        connection.execute("DELETE FROM memo_likes WHERE memo_id=1 AND identity_hash='browser-a'")
        count = connection.execute("SELECT fav_count FROM memos WHERE id=1").fetchone()[0]
        if count != 1:
            raise AssertionError(f"delete trigger expected fav_count=1, found {count}")
        connection.commit()
    finally:
        connection.close()


def test_phase6_comment_triggers_and_trash(database: Path) -> None:
    connection = sqlite3.connect(database)
    try:
        apply_sql(connection, "0005_phase6_consistency_trash.sql")
        count = connection.execute("SELECT comment_count FROM memos WHERE id=1").fetchone()[0]
        if count != 1:
            raise AssertionError(f"comment reconciliation expected 1, found {count}")
        connection.execute("INSERT INTO comments (content, username, memo_id) VALUES ('new comment', 'guest', 1)")
        if connection.execute("SELECT comment_count FROM memos WHERE id=1").fetchone()[0] != 2:
            raise AssertionError("comment insert trigger did not increment counter")
        connection.execute("DELETE FROM comments WHERE content='new comment'")
        if connection.execute("SELECT comment_count FROM memos WHERE id=1").fetchone()[0] != 1:
            raise AssertionError("comment delete trigger did not decrement counter")
        columns = {row[1] for row in connection.execute("PRAGMA table_info(media)")}
        if "trashed_at" not in columns:
            raise AssertionError("media trash column was not created")
        connection.execute("UPDATE media SET trashed_at=CURRENT_TIMESTAMP WHERE id=1")
        if connection.execute("SELECT trashed_at FROM media WHERE id=1").fetchone()[0] is None:
            raise AssertionError("media trash timestamp was not stored")
        connection.commit()
    finally:
        connection.close()


def test_phase7_media_schema(database: Path) -> None:
    connection = sqlite3.connect(database)
    try:
        apply_sql(connection, "0006_phase7_media.sql")
        columns = {row[1] for row in connection.execute("PRAGMA table_info(media)")}
        required = {"sha256", "thumbnail_key", "upload_state"}
        if not required.issubset(columns):
            raise AssertionError(f"Phase 7 media columns missing: {required - columns}")
        connection.execute("UPDATE media SET sha256=?, thumbnail_key=?, upload_state='ready' WHERE id=1", ("a" * 64, "thumbs/a.webp"))
        row = connection.execute("SELECT sha256, thumbnail_key, upload_state FROM media WHERE id=1").fetchone()
        if row != ("a" * 64, "thumbs/a.webp", "ready"):
            raise AssertionError(f"Phase 7 media metadata mismatch: {row}")
        connection.commit()
    finally:
        connection.close()


def test_phase8_migration_runs(database: Path) -> None:
    connection = sqlite3.connect(database)
    try:
        apply_sql(connection, "0007_migration_runs.sql")
        columns = {row[1] for row in connection.execute("PRAGMA table_info(migration_runs)")}
        item_columns = {row[1] for row in connection.execute("PRAGMA table_info(migration_items)")}
        if not {"package_id", "status", "summary"}.issubset(columns):
            raise AssertionError("migration_runs columns missing")
        if not {"package_id", "kind", "source_id", "target_id"}.issubset(item_columns):
            raise AssertionError("migration_items columns missing")
        connection.execute("INSERT INTO migration_runs (package_id, status) VALUES (?, 'importing')", ("a" * 64,))
        connection.execute("UPDATE migration_runs SET status='completed', summary=? WHERE package_id=?", ('{"ok":true}', "a" * 64))
        row = connection.execute("SELECT status, summary FROM migration_runs WHERE package_id=?", ("a" * 64,)).fetchone()
        if row != ("completed", '{"ok":true}'):
            raise AssertionError(f"migration run state mismatch: {row}")
        connection.commit()
    finally:
        connection.close()


def test_phase9_user_status(database: Path) -> None:
    connection = sqlite3.connect(database)
    try:
        apply_sql(connection, "0008_user_status.sql")
        columns = {row[1] for row in connection.execute("PRAGMA table_info(user_status)")}
        if not {"user_id", "icon", "content", "remark", "duration_hours", "expires_at"}.issubset(columns):
            raise AssertionError("user_status columns missing")
        connection.execute("INSERT INTO user_status (user_id, icon, content, duration_hours, expires_at) VALUES (1, '😄', '美滋滋', 24, datetime('now', '+1 day'))")
        row = connection.execute("SELECT content FROM user_status WHERE user_id=1 AND expires_at > datetime('now')").fetchone()
        if row != ("美滋滋",):
            raise AssertionError("user_status query failed")
        connection.execute("UPDATE user_status SET content='忙' WHERE user_id=1")
        row = connection.execute("SELECT content FROM user_status WHERE user_id=1").fetchone()
        if row != ("忙",):
            raise AssertionError("user_status upsert failed")
        connection.commit()
    finally:
        connection.close()


def test_export_helpers(database: Path, temporary: Path) -> None:
    export_dir = temporary / "export"
    run("scripts/migrate/export-sqlite.py", str(database), "--output", str(export_dir))
    manifest = json.loads((export_dir / "manifest.json").read_text(encoding="utf-8"))
    if manifest["tables"].get("users") != 1 or manifest["tables"].get("memos") != 1:
        raise AssertionError(f"unexpected export counts: {manifest['tables']}")

    upload_dir = temporary / "upload"
    nested = upload_dir / "2026" / "08"
    nested.mkdir(parents=True)
    media_path = nested / "sample.webp"
    media_path.write_bytes(b"phase-5-media")
    media_manifest = temporary / "media-manifest.json"
    run("scripts/migrate/build-media-manifest.py", str(upload_dir), "--output", str(media_manifest))
    media = json.loads(media_manifest.read_text(encoding="utf-8"))
    expected_hash = hashlib.sha256(media_path.read_bytes()).hexdigest()
    if media["files"][0]["sha256"] != expected_hash:
        raise AssertionError("media manifest SHA-256 mismatch")

    run(
        "scripts/migrate/verify-migration.py",
        "--export-dir", str(export_dir),
        "--media-manifest", str(media_manifest),
    )
    media_path.write_bytes(b"phase-5-tamper")
    failed = run(
        "scripts/migrate/verify-migration.py",
        "--export-dir", str(export_dir),
        "--media-manifest", str(media_manifest),
        expect=1,
    )
    if "media mismatch" not in failed.stdout:
        raise AssertionError("tampered media was not reported")


def main() -> None:
    with tempfile.TemporaryDirectory(prefix="moments-phase5-") as directory:
        temporary = Path(directory)
        database = temporary / "legacy.sqlite"
        prepare_database(database)
        test_like_counter_triggers(database)
        test_phase6_comment_triggers_and_trash(database)
        test_phase7_media_schema(database)
        test_phase8_migration_runs(database)
        test_phase9_user_status(database)
        test_export_helpers(database, temporary)
    print("Phase 7 migration and release tool functional tests: PASS")


if __name__ == "__main__":
    main()
