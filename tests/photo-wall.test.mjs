import assert from 'node:assert/strict';
import { photoMemoVisible, photoUrl } from '../worker/src/index.js';
import { readFile } from 'node:fs/promises';

assert.equal(photoUrl('/upload/media/2026/08/test.webp'), '/upload/media/2026/08/test.webp');
assert.equal(photoUrl('https://images.example/photo.jpg'), 'https://images.example/photo.jpg');
assert.equal(photoUrl('javascript:alert(1)'), '');
assert.equal(photoUrl('data:image/svg+xml,<svg/>'), '');
assert.equal(photoUrl('/upload/../secret'), '');

const publicMemo = { show_type: 1, created_at: '2020-01-01 00:00:00', user_id: 2 };
const privateMemo = { show_type: 0, created_at: '2020-01-01 00:00:00', user_id: 2 };
const futureMemo = { show_type: 1, created_at: '2999-01-01 00:00:00', user_id: 2 };
assert.equal(photoMemoVisible(publicMemo, null), true);
assert.equal(photoMemoVisible(privateMemo, null), false);
assert.equal(photoMemoVisible(privateMemo, { id: 2 }), true, '作者本人应看到自己的私有动态照片');
assert.equal(photoMemoVisible(privateMemo, { id: 3 }), false, '其他用户不得看到私有动态照片');
assert.equal(photoMemoVisible(futureMemo, null), false);
assert.equal(photoMemoVisible(futureMemo, { id: 2 }), true, '作者本人应看到自己的未来动态照片');

const workerSource = await readFile(new URL('../worker/src/index.js', import.meta.url), 'utf8');
assert.match(workerSource, /Math\.min\(1000, Math\.max\(1, intParam\(body\.size, 60\)\)\)/, '精选手动加载必须支持单请求获取较大图片集合');
assert.match(workerSource, /UPDATE photo_albums SET name=\?,description=\?,updated_at=CURRENT_TIMESTAMP WHERE id=\?'/, '管理员必须能修改包括默认图集在内的图集名称');
assert.doesNotMatch(workerSource, /UPDATE photo_albums SET name=\?,description=\?,updated_at=CURRENT_TIMESTAMP WHERE id=\? AND is_default=0/, '图集改名不得排除默认图集');

assert.match(workerSource, /row\.source_type === 'memo' \? \{ \.\.\.row, id: Number\(row\.source_ref\) \} : row/, 'photoAll 自定义图集项必须使用动态 ID 作为照片标识，避免重复与精选状态丢失');
assert.match(workerSource, /album: \{ id: Number\(album\.id\)/, '默认图集详情必须返回真实图集 ID');

console.log('Photo wall visibility and URL tests: PASS');
