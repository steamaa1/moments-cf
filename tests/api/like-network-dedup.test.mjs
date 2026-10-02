import assert from 'node:assert/strict';
import worker from '../../worker/src/index.js';

const JWT_SECRET = 'like-network-secret-at-least-32-characters';
const likes = [];
const memo = { id: 10, show_type: 1, created_at: '2026-08-01 00:00:00' };
const users = new Map([
  [1, { id: 1, token_version: 0, registration_state: 1 }],
  [2, { id: 2, token_version: 0, registration_state: 1 }],
]);

class Statement {
  constructor(sql) { this.sql = sql; this.args = []; }
  bind(...args) { this.args = args; return this; }
  async first() {
    const sql = this.sql.toLowerCase();
    if (sql.includes('select content from sys_config')) return { content: JSON.stringify({ enableGoogleRecaptcha: false, enableTurnstile: false }) };
    if (sql.includes('select id, show_type, created_at from memos')) return memo;
    if (sql.includes('select * from users where id')) return users.get(Number(this.args[0])) || null;
    return null;
  }
  async run() {
    const sql = this.sql.toLowerCase();
    if (sql.startsWith('insert or ignore into memo_likes')) {
      const [memoId, identityHash, networkHash, userId] = this.args;
      const duplicate = likes.some(item => item.memo_id === Number(memoId) && (
        (userId != null && item.user_id === Number(userId))
        || (userId == null && ((networkHash && item.network_hash === networkHash) || item.identity_hash === identityHash))
      ));
      if (duplicate) return { meta: { changes: 0 } };
      likes.push({ memo_id: Number(memoId), identity_hash: identityHash, network_hash: networkHash, user_id: userId == null ? null : Number(userId) });
      return { meta: { changes: 1 } };
    }
    throw new Error(`Unhandled SQL: ${this.sql}`);
  }
}
const env = { JWT_SECRET, LIKE_SALT: JWT_SECRET, DB: { prepare(sql) { return new Statement(sql); } } };

for (let index = 0; index < 2; index += 1) {
  const response = await worker.fetch(new Request('https://moments.example/api/memo/like?id=10', {
    method: 'POST',
    headers: { 'cf-connecting-ip': '203.0.113.20' },
  }), env);
  const body = await response.json();
  if (index === 0) assert.equal(response.status, 200, body.message);
  else {
    assert.equal(response.status, 409, '同一来源丢弃 Cookie 后重复点赞仍应拒绝');
    assert.match(body.message, /已经点赞/);
  }
}
assert.equal(likes.length, 1);
assert.ok(likes[0].network_hash);

// 同一出口 IP 下两个已登录账号可分别点赞；同一账号重复点赞仍被拒绝。
const authHeaders = async (userId) => ({
  'cf-connecting-ip': '203.0.113.20',
  'x-api-token': await (async () => {
    const payload = { sub: String(userId), tv: 0, exp: Math.floor(Date.now() / 1000) + 3600 };
    const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
    const body = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode(payload)}`;
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(JWT_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const signature = Buffer.from(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body))).toString('base64url');
    return `${body}.${signature}`;
  })(),
});
for (const [index, userId] of [1, 2, 1].entries()) {
  const response = await worker.fetch(new Request('https://moments.example/api/memo/like?id=10', { method: 'POST', headers: await authHeaders(userId) }), env);
  if (index === 2) assert.equal(response.status, 409);
  else assert.equal(response.status, 200);
}
assert.equal(likes.filter(item => item.user_id === 1).length, 1);
assert.equal(likes.filter(item => item.user_id === 2).length, 1);

console.log('Anonymous and authenticated like deduplication tests: PASS');
