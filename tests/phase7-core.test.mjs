import assert from 'node:assert/strict';
import {
  sanitizeSafeHtml, createR2PresignedPut, validateDirectUpload, buildCommentEmail,
  sendNotification, md5Hex, renderRssDescription, listBackups, purgeOldBackups,
  encryptConfigSecret, decryptConfigSecret,
} from '../worker/src/phase7.js';

const safe = sanitizeSafeHtml(`<a href="https://example.com" target="_blank" onclick="bad()">链接</a><script>alert(1)</script><img src="javascript:bad"><strong>粗体</strong>`);
assert.match(safe, /href="https:\/\/example\.com\/"/);
assert.match(safe, /rel="noopener noreferrer"/);
assert.doesNotMatch(safe, /onclick|script|javascript/i);
assert.match(safe, /<strong>粗体<\/strong>/);
assert.equal(sanitizeSafeHtml('<img src="http://insecure.example/a.png">'), '');

const presigned = await createR2PresignedPut({ accountId: 'abc123', bucket: 'media', key: 'media/a b.webp', accessKeyId: 'AKID', secretAccessKey: 'secret', contentType: 'image/webp', expires: 900, now: new Date('2026-08-06T12:00:00Z') });
assert.match(presigned, /^https:\/\/abc123\.r2\.cloudflarestorage\.com\/media\/media\/a%20b\.webp\?/);
assert.match(presigned, /X-Amz-Signature=/);
assert.doesNotMatch(presigned, /\+/);
assert.match(presigned, /a%20b\.webp/);
assert.match(presigned, /X-Amz-SignedHeaders=content-type%3Bhost/);
assert.equal(validateDirectUpload({ size: 10, sha256: 'a'.repeat(64), contentType: 'image/webp', filename: 'a.webp' }, new Set(['image/webp'])).size, 10);
assert.throws(() => validateDirectUpload({ size: 500 * 1024 * 1024 + 1, sha256: 'a'.repeat(64), contentType: 'image/webp' }, new Set(['image/webp'])), /500MB/);

const mail = buildCommentEmail({ title: '站点', host: 'https://x.example', poster: '<Admin>', commenter: '访客', content: '<script>', memoId: 7, createdAt: '2026-08-06' });
assert.match(mail.html, /&lt;Admin&gt;/); assert.doesNotMatch(mail.html, /<script>/); assert.match(mail.text, /memo\/7/);
let resendCalls = 0;
const result = await sendNotification({ RESEND_API_KEY: 'key' }, {}, { from: 'noreply@example.com', to: 'to@example.com', ...mail }, { fetch: async () => { resendCalls += 1; return new Response('{}', { status: 200 }); } });
assert.equal(result.provider, 'resend'); assert.equal(resendCalls, 1);
let configuredResendAuthorization = '';
const configuredResend = await sendNotification({}, { mailCredential: 're_from-admin' }, { from: 'noreply@example.com', to: 'to@example.com', ...mail }, { fetch: async (_url, init) => { configuredResendAuthorization = init.headers.authorization; return new Response('{}', { status: 200 }); } });
assert.equal(configuredResend.provider, 'resend');
assert.equal(configuredResendAuthorization, 'Bearer re_from-admin');
const encrypted = await encryptConfigSecret('re_secret-value', 'jwt-secret-at-least-sixteen-characters');
assert.match(encrypted, /^enc:v1:/);
assert.doesNotMatch(encrypted, /secret-value/);
assert.equal(await decryptConfigSecret(encrypted, 'jwt-secret-at-least-sixteen-characters'), 're_secret-value');
await assert.rejects(() => decryptConfigSecret(encrypted, 'wrong-secret-at-least-sixteen-chars'));

assert.equal(md5Hex(new TextEncoder().encode('').buffer), 'd41d8cd98f00b204e9800998ecf8427e');
assert.equal(md5Hex(new TextEncoder().encode('abc').buffer), '900150983cd24fb0d6963f7d28e17f72');

const rss = renderRssDescription({ content: '**粗体**\n\n[链接](https://example.com)', imgs: '/upload/media/a.webp', externalUrl: 'https://external.example', externalTitle: '外链', ext: JSON.stringify({ music: { server: 'netease', type: 'song', id: '1' }, video: { type: 'online', value: '/upload/media/a.mp4' }, doubanBook: { title: '书', url: 'https://book.douban.com/subject/1/' } }) }, 'https://x.example');
for (const needle of ['<strong>粗体</strong>', 'https://external.example', 'https://x.example/upload/media/a.webp', '在线音乐', '在线视频', 'https://book.douban.com']) assert.match(rss, new RegExp(needle));

const deleted = [];
const env = { MEDIA: {
  async list() { return { objects: [
    { key: 'backups/d1/new.sql', size: 1, uploaded: new Date('2026-08-01') },
    { key: 'backups/d1/old.sql', size: 2, uploaded: new Date('2026-01-01') },
  ] }; },
  async delete(key) { deleted.push(key); },
} };
assert.equal((await listBackups(env))[0].key, 'backups/d1/new.sql');
assert.equal(await purgeOldBackups(env, new Date('2026-08-06').getTime()), 1);
assert.deepEqual(deleted, ['backups/d1/old.sql']);
console.log('Phase 7 core tests: PASS');
