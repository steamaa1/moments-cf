import assert from 'node:assert/strict';
import { migrationImport, migrationPreflight, migrationPrepare, passwordHash, signJwt } from '../worker/src/index.js';

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
    if (sql.includes('select id from users where username')) return state.users.find(user => user.username === this.args[0]) || null;
    if (sql.includes('select content from sys_config')) return { content: JSON.stringify(state.config) };
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
    if (sql.startsWith('insert or ignore into migration_items')) {
      state.mappings.set(`${this.args[0]}:${this.args[1]}:${this.args[2]}`, this.args[3]);
      return { meta: {} };
    }
    if (sql.startsWith('insert into memos')) { const id = nextMemo++; state.memos.push({ id, content: this.args[0], user_id: this.args[4] }); return { meta: { last_row_id: id } }; }
    if (sql.startsWith('insert into comments')) { const id = nextComment++; state.comments.push({ id, memo_id: this.args[8] }); return { meta: { last_row_id: id } }; }
    if (sql.startsWith('insert into friends')) { const id = nextFriend++; state.friends.push({ id, name: this.args[0] }); return { meta: { last_row_id: id } }; }
    if (sql.startsWith('update sys_config set content')) { state.config = JSON.parse(this.args[0]); return { meta: {} }; }
    if (sql.startsWith('update migration_runs set status=')) { state.runs.set(this.args[1], { status: sql.includes("status='completed'") ? 'completed' : 'failed' }); return { meta: {} }; }
    throw new Error(`Unhandled SQL: ${this.sql}`);
  }
}
const env = { DB: { prepare(sql) { return new Statement(sql); } }, JWT_SECRET: secret, CLOUDFLARE_ACCOUNT_ID: 'account', D1_DATABASE_ID: 'database', D1_BACKUP_API_TOKEN: 'token' };
state.users[0].password_hash = await passwordHash('password123');
const token = await signJwt({ sub: '1', tv: 0, exp: Math.floor(Date.now() / 1000) + 60 }, secret);
const preflightRequest = new Request('https://moments.example/api/admin/migration/preflight', { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-token': token }, body: JSON.stringify({ manifest: { format: 'moments-cf-migration', version: 1, packageId, tables: { 'users.json': 2 }, mediaCount: 0, mediaBytes: 0 } }) });
const preflightResponse = await migrationPreflight(preflightRequest, env, {});
const preflightBody = await preflightResponse.json();
assert.equal(preflightResponse.status, 200);
assert.equal(preflightBody.data.packageId, packageId);
assert.equal(preflightBody.data.backupAvailable, true);
assert.equal(preflightBody.data.existingRun, null);
state.runs.set(packageId, { status: 'importing', summary: JSON.stringify({ backupReady: true, backup: { key: 'backups/d1/ready.sql' } }) });
const prepareRequest = new Request('https://moments.example/api/admin/migration/prepare', { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-token': token }, body: JSON.stringify({ packageId, password: 'password123' }) });
const prepareResponse = await migrationPrepare(prepareRequest, env, {});
const prepareBody = await prepareResponse.json();
assert.equal(prepareResponse.status, 200);
assert.equal(prepareBody.data.resumed, true);
async function call(body) {
  const request = new Request('https://moments.example/api/admin/migration/import', { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-token': token }, body: JSON.stringify({ packageId, ...body }) });
  const response = await migrationImport(request, env, {});
  const value = await response.json();
  assert.equal(response.status, 200, value.message);
  return value.data;
}
const users = [{ id: 1, username: 'oldadmin', nickname: '旧管理员' }, { id: 2, username: 'member', nickname: '成员' }];
const firstUsers = await call({ kind: 'users', rows: users });
assert.deepEqual(firstUsers.userMap, { 1: 1, 2: 2 });
assert.equal(state.users.length, 2);
const retryUsers = await call({ kind: 'users', rows: users });
assert.deepEqual(retryUsers.userMap, { 1: 1, 2: 2 });
assert.equal(state.users.length, 2, 'retry duplicated users');

const memoRows = [{ id: 9, content: '旧动态', imgs: '', favCount: 3, userId: 2, ext: '{}', showType: 1 }];
const firstMemos = await call({ kind: 'memos', rows: memoRows, userMap: firstUsers.userMap });
assert.deepEqual(firstMemos.memoMap, { 9: 1 });
await call({ kind: 'memos', rows: memoRows, userMap: firstUsers.userMap });
assert.equal(state.memos.length, 1, 'retry duplicated memos');
await call({ kind: 'comments', rows: [{ id: 5, memoId: 9, content: '评论', username: '访客' }], memoMap: firstMemos.memoMap });
await call({ kind: 'comments', rows: [{ id: 5, memoId: 9, content: '评论', username: '访客' }], memoMap: firstMemos.memoMap });
assert.equal(state.comments.length, 1, 'retry duplicated comments');
await call({ kind: 'friends', rows: [{ id: 3, name: '友链', url: 'https://example.com' }] });
await call({ kind: 'friends', rows: [{ id: 3, name: '友链', url: 'https://example.com' }] });
assert.equal(state.friends.length, 1, 'retry duplicated friends');
await call({ kind: 'config', rows: [{ content: JSON.stringify({ title: 'Legacy', enableS3: true, turnstileSecretKey: 'overwrite' }) }] });
assert.equal(state.config.title, 'Legacy');
assert.equal(state.config.enableS3, false);
assert.equal(state.config.turnstileSecretKey, 'keep-secret');
assert.equal(state.config.smtpPasswordEncrypted, 'keep-encrypted');
console.log('Migration import idempotency tests: PASS');
