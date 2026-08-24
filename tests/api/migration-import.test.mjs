import assert from 'node:assert/strict';
import { migrationFinish, migrationImport, migrationPreflight, migrationPrepare, passwordHash, previewUnfurl, signJwt } from '../../worker/src/index.js';
import worker from '../../worker/src/index.js';

const secret = 'migration-test-secret-at-least-sixteen-characters';
const packageId = 'a'.repeat(64);
const state = {
  users: [{ id: 1, username: 'admin', nickname: 'Admin', password_hash: 'unused', token_version: 0 }],
  memos: [], comments: [], friends: [],
  config: { title: 'Current', turnstileSecretKey: 'keep-secret', smtpPasswordEncrypted: 'keep-encrypted' },
  runs: new Map(),
  mappings: new Map(),
};
let nextUser = 2, nextMemo = 1, nextComment = 1, nextFriend = 1;
class Statement {
  constructor(sql) { this.sql = sql; this.args = []; }
  bind(...args) { this.args = args; return this; }
  async first() {
    const sql = this.sql.toLowerCase();
    if (sql.includes('select * from users where id')) return state.users.find(user => user.id === Number(this.args[0])) || null;
    if (sql.includes('select count(*) as count from users')) return { count: state.users.length };
    if (sql.includes('select count(*) as count from memos')) return { count: state.memos.length };
    if (sql.includes('select status, summary from migration_runs')) return state.runs.get(this.args[0]) || null;
    if (sql.includes('select status from migration_runs')) return state.runs.get(this.args[0]) || null;
    if (sql.includes('select target_id from migration_items')) return state.mappings.has(`${this.args[0]}:${this.args[1]}:${this.args[2]}`) ? { target_id: state.mappings.get(`${this.args[0]}:${this.args[1]}:${this.args[2]}`) } : null;
    if (sql.includes('select count(*) as count from migration_items')) return { count: [...state.mappings.keys()].filter(key => key.startsWith(`${this.args[0]}:${this.args[1]}:`)).length };
    if (sql.includes('select id from users where username')) return state.users.find(user => user.username === this.args[0]) || null;
    if (sql.includes('select content from sys_config')) return { content: JSON.stringify(state.config) };
    if (sql.includes('from memos m join users u on u.id=m.user_id where m.id')) {
      const memo = state.memos.find(m => m.id === Number(this.args[0]));
      if (!memo) return null;
      const user = state.users.find(u => u.id === memo.user_id) || state.users[0];
      return { ...memo, show_type: memo.show_type ?? 1, imgs: '', created_at: '2026-08-01 00:00:00', nickname: user.nickname, avatar_url: user.avatar_url, username: user.username };
    }
    return null;
  }
  async run() {
    const sql = this.sql.toLowerCase();
    if (sql.startsWith('update users set nickname')) {
      Object.assign(state.users[0], { nickname: this.args[0], avatar_url: this.args[1], slogan: this.args[2], cover_url: this.args[3], email: this.args[4] });
      return { meta: {} };
    }
    if (sql.startsWith('insert into users')) {
      const id = nextUser++;
      state.users.push({ id, username: this.args[0], nickname: this.args[1], password_hash: this.args[2], token_version: 0 });
      return { meta: { last_row_id: id } };
    }
    if (sql.startsWith("insert into migration_runs")) {
      state.runs.set(this.args[0], { status: 'importing', summary: this.args[1] });
      return { meta: {} };
    }
    if (sql.startsWith('insert or ignore into migration_items')) {
      state.mappings.set(`${this.args[0]}:${this.args[1]}:${this.args[2]}`, this.args[3]);
      return { meta: {} };
    }
    if (sql.startsWith('insert into memos') && sql.includes('fav_count')) { const id = nextMemo++; state.memos.push({ id, content: this.args[0], user_id: this.args[4] }); return { meta: { last_row_id: id } }; }
    if (sql.startsWith('insert into memos') && !sql.includes('fav_count')) { const id = nextMemo++; state.memos.push({ id, content: this.args[0], ext: this.args[6], show_type: this.args[7], user_id: this.args[9] }); return { meta: { last_row_id: id } }; }
    if (sql.startsWith('insert into comments')) { const id = nextComment++; state.comments.push({ id, memo_id: this.args[8] }); return { meta: { last_row_id: id } }; }
    if (sql.startsWith('insert into friends')) { const id = nextFriend++; state.friends.push({ id, name: this.args[0] }); return { meta: { last_row_id: id } }; }
    if (sql.startsWith('insert into media')) return { meta: { last_row_id: 1 } };
    if (sql.startsWith('update sys_config set content')) { state.config = JSON.parse(this.args[0]); return { meta: {} }; }
    if (sql.startsWith('update migration_runs set status=')) { state.runs.set(this.args[1], { status: sql.includes("status='completed'") ? 'completed' : 'failed' }); return { meta: {} }; }
    throw new Error(`Unhandled SQL: ${this.sql}`);
  }
}
const env = { DB: { prepare(sql) { return new Statement(sql); } }, JWT_SECRET: secret, CLOUDFLARE_ACCOUNT_ID: 'account', D1_DATABASE_ID: 'database', D1_BACKUP_API_TOKEN: 'token', MEDIA: { async put() {}, async get() { return null; }, async list() { return { objects: [] }; }, async delete() {} } };
state.users[0].password_hash = await passwordHash('password123');
const token = await signJwt({ sub: '1', tv: 0, exp: Math.floor(Date.now() / 1000) + 60 }, secret);
const hashRow = async row => {
  const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
  const bytes = new TextEncoder().encode(JSON.stringify(canonical(row)));
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(value => value.toString(16).padStart(2, '0')).join('');
};
const users = [{ id: 1, username: 'oldadmin', nickname: '旧管理员' }, { id: 2, username: 'member', nickname: '成员' }];
const memoRows = [{ id: 9, content: '旧动态', imgs: '', favCount: 3, userId: 2, ext: '{}', showType: 1 }];
const commentRows = [{ id: 5, memoId: 9, content: '评论', username: '访客' }];
const friendRows = [{ id: 3, name: '友链', url: 'https://example.com', icon: 'https://example.com/icon.png' }];
const configRows = [{ content: JSON.stringify({ title: 'Legacy', enableS3: true, turnstileSecretKey: 'overwrite' }) }];
const manifest = { format: 'moments-cf-migration', version: 1, packageId, tables: { 'users.json': 2, 'memos.json': 1, 'comments.json': 1, 'friends.json': 1, 'sys_config.json': 1 }, rowHashes: { 'users.json': await Promise.all(users.map(hashRow)), 'memos.json': await Promise.all(memoRows.map(hashRow)), 'comments.json': await Promise.all(commentRows.map(hashRow)), 'friends.json': await Promise.all(friendRows.map(hashRow)), 'sys_config.json': await Promise.all(configRows.map(hashRow)) }, mediaCount: 0, mediaBytes: 0 };
const preflightRequest = new Request('https://moments.example/api/admin/migration/preflight', { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-token': token }, body: JSON.stringify({ manifest }) });
const preflightResponse = await migrationPreflight(preflightRequest, env, {});
const preflightBody = await preflightResponse.json();
assert.equal(preflightResponse.status, 200);
assert.equal(preflightBody.data.packageId, packageId);
assert.equal(preflightBody.data.backupAvailable, true);
assert.equal(preflightBody.data.existingRun, null);
const originalPreviewFetch = globalThis.fetch;
globalThis.fetch = async (url) => {
  const text = String(url);
  if (text.includes('/repos/steamaa1/moments-cf/issues/42')) return Response.json({ title: '预览中的 Bug', state: 'open', user: { login: 'steamaa1', avatar_url: 'https://avatars.githubusercontent.com/u/1' }, created_at: '2026-08-01T00:00:00Z' });
  if (text.includes('/repos/steamaa1/moments-cf')) return Response.json({ full_name: 'steamaa1/moments-cf', description: '预览仓库', language: 'JavaScript', stargazers_count: 1, forks_count: 0, owner: { login: 'steamaa1' } });
  throw new Error('unexpected ' + text);
};
try {
  const previewRequest = new Request('https://moments.example/api/memo/preview', { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-token': token }, body: JSON.stringify({ kind: 'git', url: 'https://github.com/steamaa1/moments-cf/issues/42' }) });
  const previewResponse = await previewUnfurl(previewRequest, env, {});
  const previewBody = await previewResponse.json();
  assert.equal(previewResponse.status, 200);
  assert.equal(previewBody.data.itemTitle, '预览中的 Bug');
  assert.equal(previewBody.data.itemState, 'open');
  assert.equal(previewBody.data.stars, 1);
} finally { globalThis.fetch = originalPreviewFetch; }
const anonPreview = await previewUnfurl(new Request('https://moments.example/api/memo/preview', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'git', url: 'https://github.com/a/b' }) }), env, {});
assert.equal(anonPreview.status, 401, '预览接口必须登录');
const badPreview = await previewUnfurl(new Request('https://moments.example/api/memo/preview', { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-token': token }, body: JSON.stringify({ kind: 'evil', url: 'https://github.com/a/b' }) }), env, {});
assert.equal(badPreview.status, 400, '非法预览类型应拒绝');
state.runs.set(packageId, { status: 'importing', summary: JSON.stringify({ manifest, backupReady: true, backup: { key: 'backups/d1/ready.sql' } }) });
const prepareRequest = new Request('https://moments.example/api/admin/migration/prepare', { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-token': token }, body: JSON.stringify({ packageId, password: 'password123' }) });
const prepareResponse = await migrationPrepare(prepareRequest, env, {});
const prepareBody = await prepareResponse.json();
const prematureFinishRequest = new Request('https://moments.example/api/admin/migration/finish', { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-token': token }, body: JSON.stringify({ packageId, imported: { media: 0 } }) });
const prematureFinishResponse = await migrationFinish(prematureFinishRequest, env, {});
assert.equal(prematureFinishResponse.status, 409, 'incomplete migration must not be marked completed');
assert.equal(prepareResponse.status, 200);
assert.equal(prepareBody.data.resumed, true);
async function call(body) {
  const request = new Request('https://moments.example/api/admin/migration/import', { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-token': token }, body: JSON.stringify({ packageId, ...body }) });
  const response = await migrationImport(request, env, {});
  const value = await response.json();
  assert.equal(response.status, 200, value.message);
  return value.data;
}
const firstUsers = await call({ kind: 'users', offset: 0, rows: users });
assert.deepEqual(firstUsers.userMap, { 1: 1, 2: 2 });
assert.equal(state.users.length, 2);
const retryUsers = await call({ kind: 'users', offset: 0, rows: users });
assert.deepEqual(retryUsers.userMap, { 1: 1, 2: 2 });
assert.equal(state.users.length, 2, 'retry duplicated users');

const firstMemos = await call({ kind: 'memos', offset: 0, rows: memoRows, userMap: firstUsers.userMap });
assert.deepEqual(firstMemos.memoMap, { 9: 1 });
await call({ kind: 'memos', offset: 0, rows: memoRows, userMap: firstUsers.userMap });
assert.equal(state.memos.length, 1, 'retry duplicated memos');
await call({ kind: 'comments', offset: 0, rows: commentRows, memoMap: firstMemos.memoMap });
await call({ kind: 'comments', offset: 0, rows: commentRows, memoMap: firstMemos.memoMap });
assert.equal(state.comments.length, 1, 'retry duplicated comments');
const unsafeFriendRows = [{ id: 3, name: '危险友链', url: 'javascript:alert(1)', icon: 'https://example.com/icon.png' }];
const safeSummary = state.runs.get(packageId).summary;
state.runs.get(packageId).summary = JSON.stringify({ ...JSON.parse(safeSummary), manifest: { ...manifest, rowHashes: { ...manifest.rowHashes, 'friends.json': await Promise.all(unsafeFriendRows.map(hashRow)) } } });
const unsafeFriendRequest = new Request('https://moments.example/api/admin/migration/import', { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-token': token }, body: JSON.stringify({ packageId, kind: 'friends', offset: 0, rows: unsafeFriendRows }) });
assert.equal((await migrationImport(unsafeFriendRequest, env, {})).status, 400, '迁移友链必须拒绝非 HTTP(S) URL');
state.runs.get(packageId).summary = safeSummary;
await call({ kind: 'friends', offset: 0, rows: friendRows });
await call({ kind: 'friends', offset: 0, rows: friendRows });
assert.equal(state.friends.length, 1, 'retry duplicated friends');
await call({ kind: 'config', offset: 0, rows: configRows });
assert.equal(state.config.title, 'Legacy');
assert.equal(state.config.enableS3, false);
assert.equal(state.config.turnstileSecretKey, 'keep-secret');
assert.equal(state.config.smtpPasswordEncrypted, 'keep-encrypted');
const tamperedRequest = new Request('https://moments.example/api/admin/migration/import', { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-token': token }, body: JSON.stringify({ packageId, kind: 'friends', offset: 0, rows: [{ id: 3, name: '被篡改', url: 'https://example.com' }] }) });
const tamperedResponse = await migrationImport(tamperedRequest, env, {});
assert.equal(tamperedResponse.status, 409, '与预检摘要不一致的迁移批次必须拒绝');
const finishRequest = new Request('https://moments.example/api/admin/migration/finish', { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-token': token }, body: JSON.stringify({ packageId, imported: { media: 0 } }) });
const finishResponse = await migrationFinish(finishRequest, env, {});
assert.equal(finishResponse.status, 200);
assert.equal(state.runs.get(packageId).status, 'completed');

// 站内动态引用预览（此时 state.memos 已导入动态 id=1）
const memoRefPreview = await previewUnfurl(new Request('https://moments.example/api/memo/preview', { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-token': token }, body: JSON.stringify({ kind: 'memo', url: '/memo/1' }) }), env, {});
const memoRefBody = await memoRefPreview.json();
assert.equal(memoRefPreview.status, 200, memoRefBody.message);
assert.equal(memoRefBody.data.id, 1);
assert.equal(memoRefBody.data.url, '/memo/1');
assert.equal(memoRefBody.data.content, '旧动态');
const memoRefBad = await previewUnfurl(new Request('https://moments.example/api/memo/preview', { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-token': token }, body: JSON.stringify({ kind: 'memo', url: '/memo/999' }) }), env, {});
assert.equal(memoRefBad.status, 400, '不存在的动态应拒绝');
const privateMemoSave = await worker.fetch(new Request('https://moments.example/api/memo/save', { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-token': token }, body: JSON.stringify({ content: '私密动态', showType: 0 }) }), env);
assert.equal(privateMemoSave.status, 200);
const privateId = state.memos[state.memos.length - 1].id;
const privatePreview = await previewUnfurl(new Request('https://moments.example/api/memo/preview', { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-token': token }, body: JSON.stringify({ kind: 'memo', url: `/memo/${privateId}` }) }), env, {});
assert.equal(privatePreview.status, 400, '私密动态不可被引用');
// BUG-10：upload 服务端验证 SHA-256 与文件内容一致
const goodFile = new File(['hello-upload'], 'a.png', { type: 'image/png' });
const goodDigest = new Uint8Array(await crypto.subtle.digest('SHA-256', await goodFile.arrayBuffer()));
const goodSha = [...goodDigest].map(value => value.toString(16).padStart(2, '0')).join('');
const goodForm = new FormData();
goodForm.append('files', goodFile);
goodForm.append('sha256', goodSha);
const goodUpload = await worker.fetch(new Request('https://moments.example/api/file/upload', { method: 'POST', headers: { 'x-api-token': token }, body: goodForm }), env);
assert.equal(goodUpload.status, 200, 'SHA 一致应通过');
const badForm = new FormData();
badForm.append('files', new File(['hello-upload'], 'a.png', { type: 'image/png' }));
badForm.append('sha256', '0'.repeat(64));
const badUpload = await worker.fetch(new Request('https://moments.example/api/file/upload', { method: 'POST', headers: { 'x-api-token': token }, body: badForm }), env);
assert.equal(badUpload.status, 400, 'SHA 与内容不一致应拒绝');
// RISK-11：X 快照重抓失败时保留旧文本快照，不阻塞保存
const originalXFetch = globalThis.fetch;
globalThis.fetch = async () => new Response('', { status: 500 });
try {
  const xSave = await worker.fetch(new Request('https://moments.example/api/memo/save', { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-token': token }, body: JSON.stringify({ content: 'X 正文', ext: { x: { url: 'https://x.com/a/status/1234567890123456789', id: '1234567890123456789', text: '旧快照文本', avatar: '', likes: 0, replies: 0, reposts: 0 } } }) }), env);
  const xSaveBody = await xSave.json();
  assert.equal(xSave.status, 200, xSaveBody.message);
  const lastXExt = JSON.parse(state.memos[state.memos.length - 1].ext || '{}');
  assert.equal(lastXExt.x.text, '旧快照文本', '抓取失败应保留旧快照');
} finally { globalThis.fetch = originalXFetch; }

// BUG-06 回归：纯音乐/纯豆瓣嵌入动态不应被判为「内容为空」
const musicSave = await worker.fetch(new Request('https://moments.example/api/memo/save', { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-token': token }, body: JSON.stringify({ content: '', ext: { music: { mode: 'direct', url: 'https://media.example/a.mp3', name: '测试歌曲' } } }) }), env);
const musicSaveBody = await musicSave.json();
assert.equal(musicSave.status, 200, musicSaveBody.message);
const doubanSave = await worker.fetch(new Request('https://moments.example/api/memo/save', { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-token': token }, body: JSON.stringify({ content: '', ext: { doubanBooks: [{ title: '测试书', url: 'https://book.douban.com/subject/1' }] } }) }), env);
const doubanSaveBody = await doubanSave.json();
assert.equal(doubanSave.status, 200, doubanSaveBody.message);
const emptySave = await worker.fetch(new Request('https://moments.example/api/memo/save', { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-token': token }, body: JSON.stringify({ content: '' }) }), env);
assert.equal(emptySave.status, 400, '真正空内容仍应拒绝');
const memoRefSave = await worker.fetch(new Request('https://moments.example/api/memo/save', { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-token': token }, body: JSON.stringify({ content: '正文仍在', ext: { memoRef: { id: 999, authorName: '伪造', content: '伪造' } } }) }), env);
const memoRefSaveBody = await memoRefSave.json();
assert.equal(memoRefSave.status, 200, memoRefSaveBody.message);
const lastMemoExt = JSON.parse(state.memos[state.memos.length - 1].ext || '{}');
assert.ok(!lastMemoExt.memoRef, '失效的站内引用应被移除而非阻塞保存');
assert.ok(state.memos[state.memos.length - 1].content.includes('正文仍在'), '正文应保留');
const memoRefOnlySave = await worker.fetch(new Request('https://moments.example/api/memo/save', { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-token': token }, body: JSON.stringify({ content: '', ext: { memoRef: { id: 999 } } }) }), env);
assert.equal(memoRefOnlySave.status, 400, '引用失效且无其他内容时应拒绝');
console.log('Migration import idempotency tests: PASS');
