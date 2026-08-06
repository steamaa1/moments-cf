#!/usr/bin/env python3
import json
import sqlite3
import subprocess
import tarfile
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / 'scripts/migrate/build-package.py'

with tempfile.TemporaryDirectory() as temp:
    root = Path(temp)
    source = root / 'legacy'
    upload = source / 'upload'
    upload.mkdir(parents=True)
    (upload / 'photo.webp').write_bytes(b'photo-data')
    (upload / 'nested').mkdir()
    (upload / 'nested' / 'clip.mp4').write_bytes(b'video-data')
    (upload / 'removed').mkdir()
    (upload / 'removed' / 'deleted.webp').write_bytes(b'deleted')
    db = sqlite3.connect(source / 'db.sqlite')
    db.executescript('''
      CREATE TABLE User (id INTEGER PRIMARY KEY, username TEXT, nickname TEXT, password TEXT, avatarUrl TEXT, slogan TEXT, coverUrl TEXT, email TEXT, createdAt TEXT, updatedAt TEXT);
      CREATE TABLE Memo (id INTEGER PRIMARY KEY, content TEXT, imgs TEXT, favCount INTEGER, commentCount INTEGER, userId INTEGER, createdAt TEXT, updatedAt TEXT, location TEXT, externalUrl TEXT, externalTitle TEXT, externalFavicon TEXT, pinned INTEGER, ext TEXT, showType INTEGER);
      CREATE TABLE Comment (id INTEGER PRIMARY KEY, content TEXT, replyTo TEXT, replyEmail TEXT, username TEXT, email TEXT, website TEXT, createdAt TEXT, updatedAt TEXT, memoId INTEGER, author TEXT);
      CREATE TABLE Friend (id INTEGER PRIMARY KEY, name TEXT, icon TEXT, url TEXT, desc TEXT, createdAt TEXT, updatedAt TEXT);
      CREATE TABLE SysConfig (id INTEGER PRIMARY KEY, content TEXT);
      INSERT INTO User VALUES (1,'admin','管理员','$2a$10$secret','/upload/photo.webp','','','a@example.com','2026-08-06','2026-08-06');
      INSERT INTO Memo VALUES (1,'hello','/upload/photo.webp',2,0,1,'2026-08-06','2026-08-06','','','','',0,'{}',1);
      INSERT INTO Comment VALUES (1,'ok','','','guest','','','2026-08-06','2026-08-06',1,'');
      INSERT INTO Friend VALUES (1,'site','/upload/photo.webp','https://example.com','desc','2026-08-06','2026-08-06');
      INSERT INTO SysConfig VALUES (1,'{"title":"旧站"}');
    ''')
    db.commit(); db.close()
    package = root / 'package'
    archive = root / 'package.tar.gz'
    result = subprocess.run(['python3', str(SCRIPT), str(source), '--output', str(package), '--archive', str(archive)], capture_output=True, text=True)
    assert result.returncode == 0, result.stderr
    manifest = json.loads((package / 'manifest.json').read_text())
    assert manifest['format'] == 'moments-cf-migration'
    assert len(manifest['packageId']) == 64
    int(manifest['packageId'], 16)
    assert manifest['tables']['users.json'] == 1
    assert manifest['mediaCount'] == 2
    user = json.loads((package / 'tables/users.json').read_text())[0]
    assert 'password' not in {key.lower() for key in user}
    assert (package / 'media/photo.webp').read_bytes() == b'photo-data'
    with tarfile.open(archive, 'r:gz') as tar:
        names = tar.getnames()
        assert any(name.endswith('manifest.json') for name in names)
    legacy_archive = root / 'legacy-backup.tar.gz'
    with tarfile.open(legacy_archive, 'w:gz') as tar:
        tar.add(source, arcname='backup/var/moments')
    package_from_archive = root / 'package-from-archive'
    archived_result = subprocess.run(['python3', str(SCRIPT), str(legacy_archive), '--output', str(package_from_archive)], capture_output=True, text=True)
    assert archived_result.returncode == 0, archived_result.stderr
    archived_manifest = json.loads((package_from_archive / 'manifest.json').read_text())
    assert archived_manifest['packageId'] == manifest['packageId']
    assert (package_from_archive / 'media/nested/clip.mp4').read_bytes() == b'video-data'
print('Migration package tests: PASS')
