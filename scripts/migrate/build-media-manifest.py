#!/usr/bin/env python3
"""Read-only scan of a legacy upload directory with size and SHA-256 metadata."""
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
    parser.add_argument("upload_dir", type=Path)
    parser.add_argument("--output", type=Path, default=Path("media-manifest.json"))
    args = parser.parse_args()
    root = args.upload_dir.resolve()
    if not root.is_dir():
        raise SystemExit(f"upload directory not found: {root}")
    files = []
    for path in sorted(root.rglob("*")):
        if path.is_file():
            files.append({
                "path": path.relative_to(root).as_posix(),
                "size": path.stat().st_size,
                "sha256": sha256(path),
            })
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        json.dumps({"uploadDir": str(root), "files": files}, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"{len(files)} files -> {args.output}")


if __name__ == "__main__":
    main()
