import assert from 'node:assert/strict';
import worker from '../worker/src/index.js';

const JWT_SECRET = 'init-siteurl-secret-at-least-32-characters';
const base = {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-init-secret': 'init-secret' },
  body: JSON.stringify({ username: 'admin', password: 'password123' }),
};

class Statement {
  constructor(sql) { this.sql = sql; this.args = []; }
  bind(...args) { this.args = args; return this; }
  async first() { return null; } // 无既有用户，允许初始化
  async run() { return { meta: { changes: 1 } }; }
}
const makeDb = (captured) => ({
  prepare(sql) { return new Statement(sql); },
  async batch(stmts) { for (const s of stmts) if (s.args.length) captured.push(s); },
});

// 1) 用真实域名发起初始化 → siteUrl 自动取请求 origin
const captured1 = [];
await worker.fetch(new Request('https://moments.example/api/admin/initialize', base), { DB: makeDb(captured1), INIT_SECRET: 'init-secret', JWT_SECRET });
const config1 = JSON.parse(captured1[1].args[0]);
assert.equal(config1.siteUrl, 'https://moments.example', '初始化时应把站点规范域名自动设为请求域名');

// 2) 本地回环地址（如 wrangler dev）→ 不写成 localhost，保持默认值
const captured2 = [];
await worker.fetch(new Request('http://localhost:8787/api/admin/initialize', base), { DB: makeDb(captured2), INIT_SECRET: 'init-secret', JWT_SECRET });
const config2 = JSON.parse(captured2[1].args[0]);
assert.equal(config2.siteUrl, 'https://wb.me-i.top', '本地调试地址不应覆盖站点规范域名');

console.log('Init siteUrl defaults tests: PASS');
