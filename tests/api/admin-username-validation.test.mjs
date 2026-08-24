import assert from 'node:assert/strict';
import worker, { signJwt } from '../../worker/src/index.js';

const JWT_SECRET = 'admin-username-secret-at-least-32-characters';
const admin = { id: 1, username: 'admin', nickname: 'Admin', token_version: 0, password_hash: 'x' };
const member = { id: 2, username: 'member', nickname: 'Member', token_version: 0, password_hash: 'x' };
const config = { adminUserName: 'admin' };

class Statement {
  constructor(sql) { this.sql = sql; this.args = []; }
  bind(...args) { this.args = args; return this; }
  async first() {
    const sql = this.sql.toLowerCase();
    if (sql.includes('select * from users where id')) return Number(this.args[0]) === 1 ? admin : null;
    if (sql.includes('select content from sys_config')) return { content: JSON.stringify(config) };
    if (sql.includes('select id from users where username') && sql.includes('id<>1')) return this.args[0].toLowerCase() === member.username ? { id: 2 } : null;
    if (sql.includes('select id from users limit')) return null;
    return null;
  }
  async run() { return { meta: { changes: 1 } }; }
}
const db = { prepare(sql) { return new Statement(sql); }, async batch() { return []; } };
const token = await signJwt({ sub: '1', tv: 0, exp: Math.floor(Date.now() / 1000) + 60 }, JWT_SECRET);
const authHeaders = { 'content-type': 'application/json', 'x-api-token': token };

const badInit = await worker.fetch(new Request('https://moments.example/api/admin/initialize', {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-init-secret': 'init-secret' },
  body: JSON.stringify({ username: 'bad name', password: 'password123' }),
}), { DB: db, INIT_SECRET: 'init-secret', JWT_SECRET });
assert.equal(badInit.status, 400);
assert.match((await badInit.json()).message, /用户名须为/);

const badSave = await worker.fetch(new Request('https://moments.example/api/sysConfig/save', {
  method: 'POST', headers: authHeaders,
  body: JSON.stringify({ adminUserName: '含中文', enableAbout: false }),
}), { DB: db, JWT_SECRET });
assert.equal(badSave.status, 400);
assert.match((await badSave.json()).message, /用户名须为/);

const duplicateSave = await worker.fetch(new Request('https://moments.example/api/sysConfig/save', {
  method: 'POST', headers: authHeaders,
  body: JSON.stringify({ adminUserName: 'member', enableAbout: false }),
}), { DB: db, JWT_SECRET });
assert.equal(duplicateSave.status, 409);
assert.match((await duplicateSave.json()).message, /用户名已存在/);

console.log('Admin username validation tests: PASS');
