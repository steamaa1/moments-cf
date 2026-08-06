#!/usr/bin/env python3
"""Read-only export of a legacy Moments SQLite database to reviewable JSON files."""
import argparse
import json
import sqlite3
from pathlib import Path


def export_database(database: Path, output: Path) -> dict[str, int]:
    if not database.is_file():
        raise FileNotFoundError(f"SQLite database not found: {database}")
    output.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(f"file:{database}?mode=ro", uri=True)
    connection.row_factory = sqlite3.Row
    try:
        names = [row[0] for row in connection.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
        )]
        counts: dict[str, int] = {}
        for name in names:
            escaped = name.replace('"', '""')
            rows = [dict(row) for row in connection.execute(f'SELECT * FROM "{escaped}"')]
            (output / f"{name}.json").write_text(
                json.dumps(rows, ensure_ascii=False, indent=2, default=str) + "\n",
                encoding="utf-8",
            )
            counts[name] = len(rows)
        (output / "manifest.json").write_text(
            json.dumps({"source": str(database), "tables": counts}, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        return counts
    finally:
        connection.close()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("database", type=Path, help="legacy db.sqlite path")
    parser.add_argument("--output", type=Path, default=Path("export"))
    args = parser.parse_args()
    counts = export_database(args.database, args.output)
    print(json.dumps(counts, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
