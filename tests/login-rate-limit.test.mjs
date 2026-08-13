import assert from 'node:assert/strict';
import worker, { passwordHash } from '../worker/src/index.js';

const JWT_SECRET = 'login-rate-secret-at-least-32-characters';
const attempts = [];
const user = {
  id: 1, username: 'admin', nickname: 'Admin', token_version: 0,
  password_hash: await passwordHash('correct-password', 10000),
};

class Statement {
  constructor(sql) { this.sql = sql; this.args = []; }
  bind(...args) { this.args = args; return this; }
  async first() {
    const sql = this.sql.toLowerCase();
    if (sql.includes('select count(*) as total from login_attempts')) {
      return { total: attempts.filter(item => item.network_hash === this.args[0] && item.username_hash === this.args[1]).length };
    }
    if (sql.includes('select * from users where username')) return this.args[0] === user.username ? user : null;
    return null;
  }
  async run() {
    const sql = this.sql.toLowerCase();
    if (sql.startsWith('insert into login_attempts')) {
      attempts.push({ network_hash: this.args[0], username_hash: this.args[1] });
      return { meta: { changes: 1 } };
    }
    if (sql.startsWith('delete from login_attempts')) {
      for (let index = attempts.length - 1; index >= 0; index -= 1) {
        if (attempts[index].network_hash === this.args[0] && attempts[index].username_hash === this.args[1]) attempts.splice(index, 1);
      }
      return { meta: { changes: 1 } };
    }
    throw new Error(`Unhandled SQL: ${this.sql}`);
  }
}
const env = { JWT_SECRET, DB: { prepare(sql) { return new Statement(sql); } } };
const request = (password, ip = '203.0.113.30') => worker.fetch(new Request('https://moments.example/api/user/login', {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'cf-connecting-ip': ip },
  body: JSON.stringify({ username: 'admin', password }),
}), env);

for (let index = 0; index < 10; index += 1) {
  const response = await request('wrong-password');
  assert.equal(response.status, 401, `第 ${index + 1} 次错误密码应返回 401`);
}
const blocked = await request('wrong-password');
const blockedBody = await blocked.json();
assert.equal(blocked.status, 429);
assert.match(blockedBody.message, /登录尝试过于频繁/);
assert.equal(attempts.length, 10);
assert.ok(attempts.every(item => !item.network_hash.includes('203.0.113.30') && !item.username_hash.includes('admin')), '不得存储原始 IP 或明文用户名');

const otherNetwork = await request('correct-password', '203.0.113.31');
assert.equal(otherNetwork.status, 200, '不同来源的正确登录不应被阻塞');
const seeded = attempts.length;
const wrongOther = await request('wrong-password', '203.0.113.31');
assert.equal(wrongOther.status, 401);
assert.equal(attempts.length, seeded + 1);
const successOther = await request('correct-password', '203.0.113.31');
assert.equal(successOther.status, 200);
assert.equal(attempts.length, seeded, '成功登录应清除该来源与用户名组合的失败记录');

console.log('Login failure rate limit tests: PASS');
