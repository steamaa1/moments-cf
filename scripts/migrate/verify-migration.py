#!/usr/bin/env python3
"""Verify legacy export JSON and media-manifest integrity without changing data."""
import argparse
import hashlib
import json
from pathlib import Path


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--export-dir", type=Path, default=Path("export"))
    parser.add_argument("--media-manifest", type=Path)
    args = parser.parse_args()
    errors: list[str] = []
    manifest_path = args.export_dir / "manifest.json"
    if not manifest_path.is_file():
        errors.append(f"missing {manifest_path}")
    else:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        for table, expected in manifest.get("tables", {}).items():
            path = args.export_dir / f"{table}.json"
            if not path.is_file():
                errors.append(f"missing {path}")
                continue
            actual = len(json.loads(path.read_text(encoding="utf-8")))
            if actual != expected:
                errors.append(f"{table}: expected {expected}, found {actual}")
    if args.media_manifest:
        media = json.loads(args.media_manifest.read_text(encoding="utf-8"))
        root = Path(media["uploadDir"])
        for item in media.get("files", []):
            path = root / item["path"]
            if not path.is_file():
                errors.append(f"media missing: {path}")
            elif path.stat().st_size != item["size"] or sha256(path) != item["sha256"]:
                errors.append(f"media mismatch: {path}")
    if errors:
        print("\n".join(errors))
        raise SystemExit(1)
    print("Migration export verification: PASS")


if __name__ == "__main__":
    main()
