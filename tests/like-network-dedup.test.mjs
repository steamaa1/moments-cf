import assert from 'node:assert/strict';
import worker from '../worker/src/index.js';

const JWT_SECRET = 'like-network-secret-at-least-32-characters';
const likes = [];
const memo = { id: 10, show_type: 1, created_at: '2026-08-01 00:00:00' };

class Statement {
  constructor(sql) { this.sql = sql; this.args = []; }
  bind(...args) { this.args = args; return this; }
  async first() {
    const sql = this.sql.toLowerCase();
    if (sql.includes('select content from sys_config')) return { content: JSON.stringify({ enableGoogleRecaptcha: false, enableTurnstile: false }) };
    if (sql.includes('select id, show_type, created_at from memos')) return memo;
    return null;
  }
  async run() {
    const sql = this.sql.toLowerCase();
    if (sql.startsWith('insert or ignore into memo_likes')) {
      const [memoId, identityHash, networkHash] = this.args;
      const duplicate = likes.some(item => item.memo_id === Number(memoId) && (item.identity_hash === identityHash || (networkHash && item.network_hash === networkHash)));
      if (duplicate) return { meta: { changes: 0 } };
      likes.push({ memo_id: Number(memoId), identity_hash: identityHash, network_hash: networkHash });
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

console.log('Anonymous like network deduplication tests: PASS');
