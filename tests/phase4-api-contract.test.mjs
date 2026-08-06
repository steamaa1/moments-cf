import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../worker/src/index.js', import.meta.url), 'utf8');
const expected = [
  '/api/user/reg', '/api/file/exist', '/api/file/clean', '/api/file/s3PreSigned',
  '/api/comment/add', '/api/comment/remove', '/api/friend/list', '/api/friend/add',
  '/api/friend/delete', '/api/memo/getFaviconAndTitle',
];
for (const route of expected) assert.ok(source.includes(`url.pathname === '${route}'`), `missing route ${route}`);
assert.match(source, /config\.enableS3 = false/);
assert.match(source, /评论过于频繁，请稍后再试/);
assert.match(source, /评论字数超过限制长度/);
assert.match(source, /await requireUser\(request, env, headers\)/);

const friendPage = await readFile(new URL('../front/pages/friend.vue', import.meta.url), 'utf8');
assert.doesNotMatch(friendPage, /\$\{message\}/);
assert.match(friendPage, /error instanceof Error \? error\.message/);
console.log('Phase 4 API compatibility contract tests: PASS');
