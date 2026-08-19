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

console.log('Photo wall visibility and URL tests: PASS');
