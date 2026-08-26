import assert from 'node:assert/strict';
import worker, { validHttpUrl, forbiddenHost } from '../../worker/src/index.js';

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
const signed = await (await import('../../worker/src/index.js')).signJwt({ sub: '1', tv: 0, exp: now + 60 }, 'security-secret');
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

  // 302 跳转到公网地址：安全跟随并抓取目标页面
  const seenHrefs = [];
  globalThis.fetch = async (input) => {
    seenHrefs.push(String(input));
    if (seenHrefs.length === 1) return new Response(null, { status: 301, headers: { location: 'https://new.example.com/final' } });
    return new Response('<html><head><meta property="og:title" content="重定向后的标题"><title>fallback</title></head></html>', { headers: { 'content-type': 'text/html; charset=utf-8' } });
  };
  const followed = await worker.fetch(new Request('https://moments.example/api/memo/getFaviconAndTitle?url=https%3A%2F%2Fexample.com%2Fold', { method: 'POST', headers: { 'x-api-token': signed } }), authEnv);
  const followedBody = await followed.json();
  assert.equal(followed.status, 200);
  assert.deepEqual(seenHrefs, ['https://example.com/old', 'https://new.example.com/final']);
  assert.equal(followedBody.data.title, '重定向后的标题');

  // 302 跳转到内网地址必须被拒绝（SSRF）
  globalThis.fetch = async () => new Response(null, { status: 302, headers: { location: 'https://127.0.0.1/' } });
  const redirect = await worker.fetch(new Request('https://moments.example/api/memo/getFaviconAndTitle?url=https%3A%2F%2Fexample.com', { method: 'POST', headers: { 'x-api-token': signed } }), authEnv);
  assert.equal(redirect.status, 400);

  // og:title 存在时优先于 <title>，且 HTML 实体被解码
  globalThis.fetch = async () => new Response('<html><head><meta property="og:title" content="OG &amp; 标题&#x4E2D;"><title>旧标签</title></head></html>', { headers: { 'content-type': 'text/html' } });
  const ogPage = await worker.fetch(new Request('https://moments.example/api/memo/getFaviconAndTitle?url=https%3A%2F%2Fexample.com%2Fog', { method: 'POST', headers: { 'x-api-token': signed } }), authEnv);
  assert.equal((await ogPage.json()).data.title, 'OG & 标题中');

  // 无 og/meta 时退化到 <title>
  globalThis.fetch = async () => new Response('<html><head><title>普通标题</title></head></html>', { headers: { 'content-type': 'text/html' } });
  const plainPage = await worker.fetch(new Request('https://moments.example/api/memo/getFaviconAndTitle?url=https%3A%2F%2Fexample.com%2Fplain', { method: 'POST', headers: { 'x-api-token': signed } }), authEnv);
  assert.equal((await plainPage.json()).data.title, '普通标题');

  // GBK 编码页面（"中文标题"的 GBK 字节）按 meta charset 解码，不乱码
  const gbkBytes = new Uint8Array([...new TextEncoder().encode('<html><head><meta charset="gbk"><title>'), 0xD6, 0xD0, 0xCE, 0xC4, 0xB1, 0xEA, 0xCC, 0xE2, ...new TextEncoder().encode('</title></head></html>')]);
  globalThis.fetch = async () => new Response(gbkBytes, { headers: { 'content-type': 'text/html' } });
  const gbkPage = await worker.fetch(new Request('https://moments.example/api/memo/getFaviconAndTitle?url=https%3A%2F%2Fexample.com%2Fgbk', { method: 'POST', headers: { 'x-api-token': signed } }), authEnv);
  assert.equal((await gbkPage.json()).data.title, '中文标题');
} finally { globalThis.fetch = originalFetch; }
console.log('Phase 4 SSRF and external metadata tests: PASS');
