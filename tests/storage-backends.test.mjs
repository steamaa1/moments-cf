import assert from 'node:assert/strict';
import { s3Backend, webdavBackend, r2Backend } from '../worker/src/storage.js';

const requests = [];
const fakeFetch = async (url, init = {}) => {
  requests.push({ url: String(url), method: init.method || 'GET', headers: init.headers || {}, body: init.body });
  const text = () => '';
  if (String(url).includes('list-type=2')) {
    return new Response('<ListBucketResult><Contents><Key>media/a.webp</Key><LastModified>2026-08-06T00:00:00Z</LastModified><ETag>\"abc\"</ETag><Size>10</Size><StorageClass>STANDARD</StorageClass></Contents></ListBucketResult>', { status: 200 });
  }
  if (String(url).includes('PROPFIND') || (init.headers && init.headers.depth)) {
    return new Response('<D:multistatus xmlns:D="DAV:"><D:response><D:href>https://dav.example.com/remote.php/dav/files/user/media/b.webp</D:href><D:propstat><D:prop><D:getcontentlength>20</D:getcontentlength><D:getlastmodified>Thu, 06 Aug 2026 00:00:00 GMT</D:getlastmodified></D:prop></D:propstat></D:response></D:multistatus>', { status: 207 });
  }
  return new Response(null, { status: 200 });
};
const originalFetch = globalThis.fetch;
globalThis.fetch = fakeFetch;

// S3
const s3 = s3Backend({ endpoint: 'https://s3.example.com', region: 'us-east-1', bucket: 'bucket', accessKeyId: 'AK', secretAccessKey: 'SK' });
await s3.put('media/a.webp', new Uint8Array([1, 2, 3]), { httpMetadata: { contentType: 'image/webp' } });
const streamBody = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array([7, 8])); controller.close(); } });
await s3.put('media/stream.webp', streamBody, { httpMetadata: { contentType: 'image/webp' } });
const streamReq = requests.find(r => r.method === 'PUT' && r.url.includes('media/stream.webp'));
assert.ok(streamReq, 'S3 stream PUT not issued');
assert.equal(streamReq.headers['x-amz-content-sha256'], 'UNSIGNED-PAYLOAD');
const putReq = requests.find(r => r.method === 'PUT' && r.url.includes('media/a.webp'));
assert.ok(putReq, 'S3 PUT not issued');
assert.match(putReq.headers.authorization, /AWS4-HMAC-SHA256 Credential=AK\//);
assert.match(putReq.headers['content-type'], /image\/webp/);
assert.ok(putReq.headers['x-amz-content-sha256'], 'S3 payload hash header missing');

const list = await s3.list('media/');
assert.equal(list[0].key, 'media/a.webp');
assert.equal(list[0].size, 10);
const got = await s3.get('media/a.webp');
assert.equal(got.size, 0); // HEAD/GET 走 fakeFetch 返回 200 空 body
const metadataHeaders = new Headers();
got.writeHttpMetadata(metadataHeaders);
assert.ok(metadataHeaders.get('content-type'), 'S3 get should set content-type');

const presigned = await s3.presignPut({ key: 'media/c.webp', contentType: 'image/webp', now: new Date('2026-08-06T00:00:00Z') });
assert.match(presigned, /X-Amz-Signature=/);
assert.match(presigned, /X-Amz-Credential=AK\//);

// WebDAV
const dav = webdavBackend({ url: 'https://dav.example.com/remote.php/dav/files/user', username: 'u', password: 'p' });
await dav.put('media/d.mp4', new Uint8Array([4, 5]), { httpMetadata: { contentType: 'video/mp4' } });
const davPut = requests.find(r => r.method === 'PUT' && r.url.includes('media/d.mp4'));
assert.ok(davPut, 'WebDAV PUT not issued');
assert.match(davPut.headers.authorization, /^Basic /);
const davHead = await dav.head('media/d.mp4');
assert.ok(davHead, 'WebDAV HEAD should succeed');
await dav.delete('media/d.mp4');
for (const method of ['HEAD', 'DELETE']) {
  const request = requests.find(item => item.method === method && item.url.includes('media/d.mp4'));
  assert.ok(request, `WebDAV ${method} not issued`);
  assert.match(new Headers(request.headers).get('authorization') || '', /^Basic /, `WebDAV ${method} must include Basic auth`);
}
const davList = await dav.list('media/');
assert.equal(davList[0].key, 'media/b.webp');
assert.equal(davList[0].size, 20);

// R2 binding
const stored = new Map();
const r2 = r2Backend({ MEDIA: {
  async put(key, body) { stored.set(key, body); },
  async get(key) { return stored.has(key) ? { body: stored.get(key) } : null; },
  async head(key) { return stored.has(key) ? { size: 1 } : null; },
  async delete(key) { stored.delete(key); },
  async list({ prefix }) { return { objects: [...stored.keys()].filter(k => k.startsWith(prefix)).map(k => ({ key: k })) }; },
}, R2_BUCKET_NAME: 'moments-media' });
await r2.put('media/r.webp', 'data');
assert.equal((await r2.list('media/')).length, 1);

globalThis.fetch = originalFetch;
console.log('Storage backends tests: PASS');
