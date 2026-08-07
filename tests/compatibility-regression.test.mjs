import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const worker = await readFile(new URL('../worker/src/index.js', import.meta.url), 'utf8');
const routes = [
  '/api/user/reg', '/api/file/exist', '/api/file/clean', '/api/file/s3PreSigned',
  '/api/comment/add', '/api/comment/remove', '/api/friend/list', '/api/friend/add',
  '/api/friend/delete', '/api/memo/getFaviconAndTitle', '/api/memo/getDoubanBookInfo',
  '/api/memo/getDoubanMovieInfo', '/api/file/trash/list', '/api/file/trash/restore', '/api/file/trash/purge',
  '/api/file/direct/init', '/api/file/direct/complete', '/api/admin/backup/list', '/api/admin/backup/create',
  '/api/admin/backup/download', '/api/admin/backup/restore',
];
for (const route of routes) assert.ok(worker.includes(`url.pathname === '${route}'`), `missing ${route}`);
assert.match(worker, /config\.enableS3 = false/);
assert.match(worker, /评论过于频繁，请稍后再试/);
assert.match(worker, /评论字数超过限制长度/);
assert.match(worker, /backend\.delete\(media\.r2_key\)/);
assert.match(worker, /no such table: comments|Comments are temporarily unavailable/);
assert.match(worker, /service: 'moments-cf', phase: 7/);

const config = await readFile(new URL('../worker/wrangler.toml', import.meta.url), 'utf8');
assert.doesNotMatch(config, /database_id/);
assert.doesNotMatch(config, /\[\[d1_databases\]\]/);
assert.doesNotMatch(config, /\[\[r2_buckets\]\]/);

const build = await readFile(new URL('../worker/scripts/build-cf.mjs', import.meta.url), 'utf8');
assert.doesNotMatch(build, /D1_DATABASE_ID|render-build-config/);
const deploy = await readFile(new URL('../worker/scripts/deploy-cf.mjs', import.meta.url), 'utf8');
assert.match(deploy, /d1', 'list', '--json/);
assert.match(deploy, /d1', 'migrations', 'apply/);
assert.match(deploy, /deploy', '--config', 'wrangler\.build\.toml/);

const friend = await readFile(new URL('../front/pages/friend.vue', import.meta.url), 'utf8');
assert.doesNotMatch(friend, /\$\{message\}/);
console.log('Frontend/Worker compatibility regression tests: PASS');
