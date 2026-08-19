#!/usr/bin/env python3
"""Build a portable Moments migration package from a legacy Docker data directory or tar.gz."""
from __future__ import annotations

import argparse
import hashlib
import json
import mimetypes
import shutil
import sqlite3
import sys
import tarfile
import tempfile
from pathlib import Path
from typing import Any

PACKAGE_VERSION = 1
TABLE_FILES = {
    "User": "users.json",
    "Memo": "memos.json",
    "Comment": "comments.json",
    "Friend": "friends.json",
    "SysConfig": "sys_config.json",
}

def json_default(value: Any) -> str:
    return value.isoformat(sep=" ") if hasattr(value, "isoformat") else str(value)

def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()

def safe_extract_tar(archive: Path, target: Path) -> None:
    with tarfile.open(archive, "r:gz") as tar:
        root = target.resolve()
        for member in tar.getmembers():
            destination = (target / member.name).resolve()
            if destination != root and root not in destination.parents:
                raise ValueError(f"unsafe archive path: {member.name}")
            if member.issym() or member.islnk():
                raise ValueError(f"links are not allowed in migration archive: {member.name}")
        tar.extractall(target)

def locate_source(root: Path) -> tuple[Path, Path]:
    candidates = [root, *[p.parent for p in root.rglob("db.sqlite") if p.is_file()]]
    seen: set[Path] = set()
    for candidate in candidates:
        candidate = candidate.resolve()
        if candidate in seen:
            continue
        seen.add(candidate)
        database = candidate / "db.sqlite"
        upload = candidate / "upload"
        if database.is_file() and upload.is_dir():
            return database, upload
    raise FileNotFoundError("source must contain db.sqlite and upload/")

def table_rows(database: Path, table: str) -> list[dict[str, Any]]:
    connection = sqlite3.connect(f"file:{database}?mode=ro", uri=True)
    connection.row_factory = sqlite3.Row
    try:
        names = {row[0].lower(): row[0] for row in connection.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
        )}
        actual = names.get(table.lower())
        if not actual:
            return []
        escaped = actual.replace('"', '""')
        return [dict(row) for row in connection.execute(f'SELECT * FROM "{escaped}"')]
    finally:
        connection.close()

def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2, default=json_default) + "\n", encoding="utf-8")

def build_package(source: Path, output: Path, archive: Path | None = None) -> dict[str, Any]:
    temporary: tempfile.TemporaryDirectory[str] | None = None
    if source.is_file() and source.name.endswith((".tar.gz", ".tgz")):
        temporary = tempfile.TemporaryDirectory(prefix="moments-migration-")
        extracted = Path(temporary.name)
        safe_extract_tar(source, extracted)
        root = extracted
    elif source.is_dir():
        root = source
    else:
        raise FileNotFoundError(f"source not found or unsupported: {source}")

    database, upload = locate_source(root)
    if output.exists():
        raise FileExistsError(f"output already exists: {output}; choose another path")
    output.mkdir(parents=True)
    counts: dict[str, int] = {}
    row_hashes: dict[str, list[str]] = {}
    for legacy_table, filename in TABLE_FILES.items():
        rows = table_rows(database, legacy_table)
        if legacy_table == "User":
            for row in rows:
                row.pop("Password", None)
                row.pop("password", None)
        write_json(output / "tables" / filename, rows)
        counts[filename] = len(rows)
        row_hashes[filename] = [hashlib.sha256(json.dumps(row, ensure_ascii=False, sort_keys=True, separators=(",", ":"), default=json_default).encode("utf-8")).hexdigest() for row in rows]

    media_items: list[dict[str, Any]] = []
    media_root = output / "media"
    for path in sorted(upload.rglob("*")):
        if not path.is_file():
            continue
        relative = path.relative_to(upload).as_posix()
        if relative == "removed" or relative.startswith("removed/"):
            continue
        destination = media_root / relative
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(path, destination)
        media_items.append({
            "path": relative,
            "size": path.stat().st_size,
            "sha256": sha256(path),
            "contentType": mimetypes.guess_type(path.name)[0] or "application/octet-stream",
        })
    package_fingerprint = hashlib.sha256()
    package_fingerprint.update(sha256(database).encode("ascii"))
    for item in media_items:
        package_fingerprint.update(item["path"].encode("utf-8"))
        package_fingerprint.update(item["sha256"].encode("ascii"))
    manifest = {
        "format": "moments-cf-migration",
        "version": PACKAGE_VERSION,
        "packageId": package_fingerprint.hexdigest(),
        "source": "legacy-moments-docker",
        "tables": counts,
        "mediaCount": len(media_items),
        "mediaBytes": sum(item["size"] for item in media_items),
        "media": media_items,
        "rowHashes": row_hashes,
        "notes": [
            "Passwords are intentionally omitted; the destination administrator password is retained.",
            "Legacy user passwords cannot be used by the Cloudflare PBKDF2 authentication scheme.",
        ],
    }
    write_json(output / "manifest.json", manifest)
    if archive:
        archive.parent.mkdir(parents=True, exist_ok=True)
        with tarfile.open(archive, "w:gz") as tar:
            tar.add(output, arcname="migration")
    if temporary:
        temporary.cleanup()
    return manifest

def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path, help="legacy directory containing db.sqlite/upload or a .tar.gz backup")
    parser.add_argument("--output", type=Path, required=True, help="new migration package directory; must not already exist")
    parser.add_argument("--archive", type=Path, help="optional .tar.gz archive created from the package")
    args = parser.parse_args()
    try:
        manifest = build_package(args.source, args.output, args.archive)
    except Exception as error:
        print(f"error: {error}", file=sys.stderr)
        raise SystemExit(1)
    print(json.dumps({k: manifest[k] for k in ("format", "version", "packageId", "tables", "mediaCount", "mediaBytes")}, ensure_ascii=False, indent=2))

if __name__ == "__main__":
    main()
