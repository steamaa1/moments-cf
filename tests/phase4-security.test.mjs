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
const privateAttempt = await worker.fetch(new Request('https://moments.example/api/memo/getFaviconAndTitle?url=http%3A%2F%2F127.0.0.1%2F', { method: 'POST' }), { ASSETS: assets });
assert.equal(privateAttempt.status, 400);

const originalFetch = globalThis.fetch;
try {
  globalThis.fetch = async () => new Response('<html><head><title>测试站点</title><link rel="icon" href="/icon.png"></head></html>', { headers: { 'content-type': 'text/html' } });
  const allowed = await worker.fetch(new Request('https://moments.example/api/memo/getFaviconAndTitle?url=https%3A%2F%2Fexample.com%2Farticle', { method: 'POST' }), { ASSETS: assets });
  const body = await allowed.json();
  assert.equal(allowed.status, 200);
  assert.equal(body.data.title, '测试站点');
  assert.equal(body.data.favicon, 'https://example.com/icon.png');

  globalThis.fetch = async () => new Response(null, { status: 302, headers: { location: 'https://127.0.0.1/' } });
  const redirect = await worker.fetch(new Request('https://moments.example/api/memo/getFaviconAndTitle?url=https%3A%2F%2Fexample.com', { method: 'POST' }), { ASSETS: assets });
  assert.equal(redirect.status, 400);
} finally { globalThis.fetch = originalFetch; }
console.log('Phase 4 SSRF and external metadata tests: PASS');
