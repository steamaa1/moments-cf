#!/usr/bin/env python3
"""Functional tests for Phase 5 SQL migrations and read-only migration helpers."""
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
        connection.execute("INSERT INTO memos (content, user_id, fav_count) VALUES (?, 1, 9)", ("memo",))
        connection.execute("INSERT INTO memo_likes (memo_id, identity_hash) VALUES (1, 'browser-a')")
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
        test_export_helpers(database, temporary)
    print("Phase 5 migration and release tool functional tests: PASS")


if __name__ == "__main__":
    main()
