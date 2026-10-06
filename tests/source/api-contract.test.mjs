import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';

// 路由契约与关键行为断言（合并自 phase4-api-contract 与 compatibility-regression）
const source = await readFile(new URL('../../worker/src/index.js', import.meta.url), 'utf8');
const routes = [
  '/api/user/reg', '/api/file/exist', '/api/file/clean', '/api/file/s3PreSigned',
  '/api/comment/add', '/api/comment/remove', '/api/friend/list', '/api/friend/add',
  '/api/friend/delete', '/api/memo/getFaviconAndTitle', '/api/memo/getDoubanBookInfo',
  '/api/memo/getDoubanMovieInfo', '/api/file/trash/list', '/api/file/trash/restore', '/api/file/trash/purge',
  '/api/file/direct/init', '/api/file/direct/complete', '/api/admin/backup/list', '/api/admin/backup/create',
  '/api/admin/backup/download', '/api/admin/backup/restore',
  // 自定义页面（migration 0018）：管理四接口 + 公开两接口
  '/api/admin/page/list', '/api/admin/page/get', '/api/admin/page/save', '/api/admin/page/remove',
  '/api/page/get', '/api/page/nav',
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

// ---- /api/memo/list 的 user 参数契约：主参数 username + 历史兼容别名 user ----
assert.match(source, /const usernameFilter = body\.username \|\| body\.user;/);
assert.match(source, /clauses\.push\('u\.username = \?'\); values\.push\(String\(usernameFilter\)\)/);

// ---- SMTP 端口与加密方式的交叉校验：一律按端口规范化（465→ssl，587→tls）----
assert.match(source, /function smtpEncryptionForPort\(port\) \{\s*return String\(port\) === '587' \? 'tls' : 'ssl';\s*\}/);
assert.equal((source.match(/smtpEncryptionForPort\(/g) || []).length, 3, '定义 1 处 + saveConfig/mail-test 各 1 处使用');
assert.doesNotMatch(source, /includes\(body\.smtpEncryption\)/, '不得再单独信任客户端提交的加密方式');
assert.doesNotMatch(source, /body\.smtpEncryption === 'tls'/, '不得再单独信任 mail/test 提交的加密方式');

// ---- API.md 契约：文档必须与实现同名同形 ----
const apiDoc = await readFile(new URL('../../API.md', import.meta.url), 'utf8');
const apiRows = apiDoc.split('\n');
const listRow = apiRows.find(line => line.startsWith('| `/api/memo/list`'));
assert.ok(listRow && listRow.includes('`username`'), 'API.md 的 memo/list 必须写实现真正读取的 username 参数');
assert.match(listRow, /别名 `user`/, 'API.md 必须标注 user 为兼容别名');
const existRow = apiRows.find(line => line.startsWith('| `/api/file/exist`'));
assert.ok(existRow && existRow.trimEnd().endsWith('|'), 'API.md 的 /api/file/exist 行必须以 | 收尾');
// 自定义页面（migration 0018）：文档必须覆盖管理保存与公开读取两条核心契约
const pageSaveRow = apiRows.find(line => line.startsWith('| `/api/admin/page/save`'));
assert.ok(pageSaveRow && pageSaveRow.includes('`slug`') && pageSaveRow.includes('409'), 'API.md 的 admin/page/save 必须写全字段参数并标注 slug 重复 409');
const pageGetRow = apiRows.find(line => line.startsWith('| `/api/page/get`'));
assert.ok(pageGetRow && pageGetRow.includes('`slug`'), 'API.md 的 page/get 必须写 slug 读参（POST body {slug}）');
// 表格格式：同一表格内每行单元格数必须与表头一致（注意：单元格内不要写裸 | ）
const brokenRows = [];
let table = [];
const flushTable = () => {
  if (table.length > 1) {
    const width = table[0].text.split('|').length;
    for (const row of table.slice(1)) {
      if (row.text.split('|').length !== width) brokenRows.push(`API.md:${row.no}（${title(row.text)}）`);
    }
  }
  table = [];
};
const title = text => text.split('|')[1].trim().slice(0, 40);
apiRows.forEach((text, index) => {
  if (text.trim().startsWith('|')) table.push({ no: index + 1, text });
  else flushTable();
});
flushTable();
assert.deepEqual(brokenRows, [], `API.md 存在列数与表头不一致的表格行：${brokenRows.join('、')}`);

// ---- 脚本 README 的迁移范围、worker README 的迁移清单与 cron 必须与仓库真值一致 ----
const migrations = (await readdir(new URL('../../worker/migrations', import.meta.url))).filter(name => name.endsWith('.sql')).sort();
const firstMigration = migrations[0].slice(0, 4);
const lastMigration = migrations[migrations.length - 1].slice(0, 4);
const releaseReadme = await readFile(new URL('../../scripts/release/README.md', import.meta.url), 'utf8');
assert.ok(releaseReadme.includes(`\`${firstMigration}\`–\`${lastMigration}\``), `scripts/release/README.md 的迁移范围必须写成 ${firstMigration}–${lastMigration}`);
const preflight = await readFile(new URL('../../scripts/release/preflight.mjs', import.meta.url), 'utf8');
const expectedMigrations = [...(preflight.match(/const expected = \[([^\]]*)\]/)?.[1] || '').matchAll(/'([0-9]{4}_[a-z0-9_]+\.sql)'/g)].map(match => match[1]);
assert.deepEqual(expectedMigrations, migrations, 'preflight 的迁移清单必须与 worker/migrations/ 完全一致（新增迁移后同步更新脚本与文档）');
const workerReadme = await readFile(new URL('../../worker/README.md', import.meta.url), 'utf8');
for (const name of migrations) assert.ok(workerReadme.includes(name), `worker/README.md 缺少迁移 ${name}`);
const cron = wrangler.match(/crons = \["([^"]+)"\]/)?.[1];
assert.ok(cron, 'worker/wrangler.toml 必须声明 crons');
assert.ok(workerReadme.includes(cron), 'worker/README.md 必须写出与 wrangler.toml 完全相同的 cron 表达式');
assert.match(workerReadme, /每周日/, 'worker/README.md 的 Cron 描述必须与 wrangler.toml 的星期触发一致');
assert.doesNotMatch(workerReadme, /计划任务每日/, 'worker/README.md 不得再写「计划任务每日」');

console.log('Route & compatibility contract tests: PASS');
