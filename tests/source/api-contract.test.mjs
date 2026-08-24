import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// 路由契约与关键行为断言（合并自 phase4-api-contract 与 compatibility-regression）
const source = await readFile(new URL('../../worker/src/index.js', import.meta.url), 'utf8');
const routes = [
  '/api/user/reg', '/api/file/exist', '/api/file/clean', '/api/file/s3PreSigned',
  '/api/comment/add', '/api/comment/remove', '/api/friend/list', '/api/friend/add',
  '/api/friend/delete', '/api/memo/getFaviconAndTitle', '/api/memo/getDoubanBookInfo',
  '/api/memo/getDoubanMovieInfo', '/api/file/trash/list', '/api/file/trash/restore', '/api/file/trash/purge',
  '/api/file/direct/init', '/api/file/direct/complete', '/api/admin/backup/list', '/api/admin/backup/create',
  '/api/admin/backup/download', '/api/admin/backup/restore',
];
for (const route of routes) assert.ok(source.includes(`url.pathname === '${route}'`), `missing ${route}`);
assert.match(source, /config\.enableS3 = false/);
assert.match(source, /评论过于频繁，请稍后再试/);
assert.match(source, /评论字数超过限制长度/);
assert.match(source, /await requireUser\(request, env, headers\)/);
assert.match(source, /backend\.delete\(media\.r2_key\)/);
assert.match(source, /no such table: comments|Comments are temporarily unavailable/);
assert.match(source, /service: 'moments-cf', phase: 7/);

// Worker 构建与部署脚本不应耦合具体资源 ID
const wrangler = await readFile(new URL('../../worker/wrangler.toml', import.meta.url), 'utf8');
assert.doesNotMatch(wrangler, /database_id/);
assert.doesNotMatch(wrangler, /\[\[d1_databases\]\]/);
assert.doesNotMatch(wrangler, /\[\[r2_buckets\]\]/);
const build = await readFile(new URL('../../worker/scripts/build-cf.mjs', import.meta.url), 'utf8');
assert.doesNotMatch(build, /D1_DATABASE_ID|render-build-config/);
const deploy = await readFile(new URL('../../worker/scripts/deploy-cf.mjs', import.meta.url), 'utf8');
assert.match(deploy, /d1', 'list', '--json/);
assert.match(deploy, /d1', 'migrations', 'apply/);
assert.match(deploy, /deploy', '--config', 'wrangler\.build\.toml/);

// 友情链接页：前端模板不得直接注入未转义的用户消息，错误应取服务端 message
const friend = await readFile(new URL('../../front/pages/friend.vue', import.meta.url), 'utf8');
assert.doesNotMatch(friend, /\$\{message\}/);
assert.match(friend, /error instanceof Error \? error\.message/);

console.log('Route & compatibility contract tests: PASS');
