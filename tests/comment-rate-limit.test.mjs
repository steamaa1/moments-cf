import assert from 'node:assert/strict';
import worker from '../worker/src/index.js';

const JWT_SECRET = 'comment-rate-secret-at-least-32-characters';
const comments = [];
const memo = { id: 10, user_id: 1, show_type: 1, created_at: '2026-08-01 00:00:00' };
const owner = { id: 1, nickname: 'Admin', email: '', telegram_chat_id: '', token_version: 0, password_hash: 'x' };

class Statement {
  constructor(sql) { this.sql = sql; this.args = []; }
  bind(...args) { this.args = args; return this; }
  async first() {
    const sql = this.sql.toLowerCase();
    if (sql.includes('select content from sys_config')) return { content: JSON.stringify({ enableComment: true, enableEmail: false, enableTelegram: false, maxCommentLength: 300 }) };
    if (sql.includes('select * from memos')) return memo;
    if (sql.includes('select * from users where id')) return null;
    if (sql.includes('select count(*) as total from comments')) {
      if (sql.includes('network_hash')) {
        return { total: comments.filter(item => item.identity_hash === this.args[0] || item.network_hash === this.args[1]).length };
      }
      return { total: comments.filter(item => item.identity_hash === this.args[0]).length };
    }
    if (sql.includes('nickname,email,telegram_chat_id')) return owner;
    return null;
  }
  async run() {
    const sql = this.sql.toLowerCase();
    if (sql.startsWith('insert into comments')) {
      comments.push({ identity_hash: this.args[8], network_hash: this.args[9] });
      return { meta: { changes: 1 } };
    }
    throw new Error(`Unhandled SQL: ${this.sql}`);
  }
}
const env = { JWT_SECRET, LIKE_SALT: JWT_SECRET, DB: { prepare(sql) { return new Statement(sql); } } };

for (let index = 0; index < 6; index += 1) {
  const response = await worker.fetch(new Request('https://moments.example/api/comment/add', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'cf-connecting-ip': '203.0.113.10' },
    body: JSON.stringify({ memoId: 10, content: `评论 ${index + 1}`, username: '游客' }),
  }), env);
  const body = await response.json();
  if (index < 5) assert.equal(response.status, 200, body.message);
  else {
    assert.equal(response.status, 429, '同一网络来源更换或丢弃 Cookie 后，第 6 条评论仍应被限流');
    assert.match(body.message, /评论过于频繁/);
  }
}
assert.equal(comments.length, 5);
assert.ok(comments.every(item => item.network_hash), '匿名评论必须保存网络身份摘要');
assert.equal(new Set(comments.map(item => item.identity_hash)).size, 5, '测试应确认每次无 Cookie 都生成了不同浏览器身份');
assert.equal(new Set(comments.map(item => item.network_hash)).size, 1, '同一来源应得到稳定网络摘要');

console.log('Anonymous comment network rate limit tests: PASS');
