import assert from 'node:assert/strict';
import worker, { validHttpUrl, forbiddenHost } from '../worker/src/index.js';

assert.equal(validHttpUrl('https://example.com')?.hostname, 'example.com');
assert.equal(validHttpUrl('javascript:alert(1)'), null);
for (const host of ['localhost', 'api.localhost', '127.0.0.1', '10.0.0.1', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254', '::1']) {
  assert.equal(forbiddenHost(host), true, `${host} must be blocked`);
}
assert.equal(forbiddenHost('172.15.0.1'), false);
assert.equal(forbiddenHost('172.32.0.1'), false);
assert.equal(forbiddenHost('example.com'), false);

const assets = { fetch: async () => new Response('asset') };
const authUser = { id: 1, username: 'admin', nickname: '管理员', token_version: 0 };
const authDb = { prepare(sql) { return { bind() { return this; }, async first() { return sql.startsWith('SELECT * FROM users WHERE id') ? authUser : null; } }; } };
const now = Math.floor(Date.now() / 1000);
const signed = await (await import('../worker/src/index.js')).signJwt({ sub: '1', tv: 0, exp: now + 60 }, 'security-secret');
const authEnv = { ASSETS: assets, DB: authDb, JWT_SECRET: 'security-secret' };
const anonymous = await worker.fetch(new Request('https://moments.example/api/memo/getFaviconAndTitle?url=https%3A%2F%2Fexample.com', { method: 'POST' }), { ASSETS: assets, DB: authDb, JWT_SECRET: 'security-secret' });
assert.equal(anonymous.status, 401);

const privateAttempt = await worker.fetch(new Request('https://moments.example/api/memo/getFaviconAndTitle?url=http%3A%2F%2F127.0.0.1%2F', { method: 'POST', headers: { 'x-api-token': signed } }), authEnv);
assert.equal(privateAttempt.status, 400);

const originalFetch = globalThis.fetch;
try {
  globalThis.fetch = async () => new Response('<html><head><title>测试站点</title><link rel="icon" href="/icon.png"></head></html>', { headers: { 'content-type': 'text/html' } });
  const allowed = await worker.fetch(new Request('https://moments.example/api/memo/getFaviconAndTitle?url=https%3A%2F%2Fexample.com%2Farticle', { method: 'POST', headers: { 'x-api-token': signed } }), authEnv);
  const body = await allowed.json();
  assert.equal(allowed.status, 200);
  assert.equal(body.data.title, '测试站点');
  assert.equal(body.data.favicon, 'https://example.com/icon.png');

  globalThis.fetch = async () => new Response(null, { status: 302, headers: { location: 'https://127.0.0.1/' } });
  const redirect = await worker.fetch(new Request('https://moments.example/api/memo/getFaviconAndTitle?url=https%3A%2F%2Fexample.com', { method: 'POST', headers: { 'x-api-token': signed } }), authEnv);
  assert.equal(redirect.status, 400);
} finally { globalThis.fetch = originalFetch; }
console.log('Phase 4 SSRF and external metadata tests: PASS');
