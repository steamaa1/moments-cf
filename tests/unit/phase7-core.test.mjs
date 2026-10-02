import assert from 'node:assert/strict';
import { createHash, createHmac } from 'node:crypto';
import {
  sanitizeSafeHtml, createR2PresignedPut, validateDirectUpload, buildCommentEmail,
  sendNotification, sendSmtp, validateEmailAddress, md5Hex, renderRssDescription, listBackups, purgeOldBackups,
  encryptConfigSecret, decryptConfigSecret,
} from '../../worker/src/phase7.js';

const safe = sanitizeSafeHtml(`<a href="https://example.com" target="_blank" onclick="bad()">链接</a><script>alert(1)</script><img src="javascript:bad"><strong>粗体</strong>`);
assert.match(safe, /href="https:\/\/example\.com\/"/);
assert.match(safe, /rel="noopener noreferrer"/);
assert.doesNotMatch(safe, /onclick|script|javascript/i);
assert.match(safe, /<strong>粗体<\/strong>/);
assert.equal(sanitizeSafeHtml('<img src="http://insecure.example/a.png">'), '');
const aboutHtml = sanitizeSafeHtml('# 标题\n\n<p class="intro" onclick="bad()">关于 <em>内容</em></p><iframe src="https://evil.example"></iframe>');
assert.match(aboutHtml, /# 标题/);
assert.match(aboutHtml, /<p class="intro">关于 <em>内容<\/em><\/p>/);
assert.doesNotMatch(aboutHtml, /onclick|iframe|evil\.example/);

const presigned = await createR2PresignedPut({ accountId: 'abc123', bucket: 'media', key: 'media/a b.webp', accessKeyId: 'AKID', secretAccessKey: 'secret', contentType: 'image/webp', expires: 900, now: new Date('2026-08-06T12:00:00Z') });
assert.match(presigned, /^https:\/\/abc123\.r2\.cloudflarestorage\.com\/media\/media\/a%20b\.webp\?/);
assert.match(presigned, /X-Amz-Signature=/);
assert.doesNotMatch(presigned, /\+/);
assert.match(presigned, /a%20b\.webp/);
assert.match(presigned, /X-Amz-SignedHeaders=content-type%3Bhost/);

// 使用独立 SigV4 验签器重建 canonical request，不能只断言 URL 字符串。
const checksumHex = 'a'.repeat(64);
const checksumBase64 = Buffer.from(checksumHex, 'hex').toString('base64');
const checksumPresigned = await createR2PresignedPut({ accountId: 'abc123', bucket: 'media', key: 'media/checksum.webp', accessKeyId: 'AKID', secretAccessKey: 'secret', contentType: 'image/webp', checksumSha256: checksumHex, now: new Date('2026-08-06T12:00:00.123Z') });
const checksumUrl = new URL(checksumPresigned);
assert.equal(checksumUrl.searchParams.get('X-Amz-Date'), '20260806T120000Z');
assert.equal(checksumUrl.searchParams.get('X-Amz-SignedHeaders'), 'content-type;host;x-amz-checksum-sha256');
assert.equal(checksumUrl.searchParams.get('x-amz-checksum-sha256'), null, 'checksum 只作为 signed header，不应泄漏到 query');
const awsEncode = value => encodeURIComponent(value).replace(/[!'()*]/g, char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
const canonicalQuery = [...checksumUrl.searchParams.entries()].filter(([key]) => key !== 'X-Amz-Signature').sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `${awsEncode(key)}=${awsEncode(value)}`).join('&');
const canonicalHeaders = `content-type:image/webp\nhost:${checksumUrl.host}\nx-amz-checksum-sha256:${checksumBase64}\n`;
const canonicalRequest = `PUT\n${checksumUrl.pathname}\n${canonicalQuery}\n${canonicalHeaders}\ncontent-type;host;x-amz-checksum-sha256\nUNSIGNED-PAYLOAD`;
const hash = value => createHash('sha256').update(value).digest();
const signingKey = createHmac('sha256', createHmac('sha256', createHmac('sha256', createHmac('sha256', 'AWS4secret').update('20260806').digest()).update('auto').digest()).update('s3').digest()).update('aws4_request').digest();
const expectedSignature = createHmac('sha256', signingKey).update(`AWS4-HMAC-SHA256\n20260806T120000Z\n20260806/auto/s3/aws4_request\n${hash(canonicalRequest).toString('hex')}`).digest('hex');
assert.equal(checksumUrl.searchParams.get('X-Amz-Signature'), expectedSignature, '独立 SigV4 验签必须通过');
assert.equal(validateDirectUpload({ size: 10, sha256: 'a'.repeat(64), contentType: 'image/webp', filename: 'a.webp' }, new Set(['image/webp'])).size, 10);
assert.throws(() => validateDirectUpload({ size: 500 * 1024 * 1024 + 1, sha256: 'a'.repeat(64), contentType: 'image/webp' }, new Set(['image/webp'])), /500MB/);
assert.equal(validateEmailAddress('to@example.com'), 'to@example.com');
assert.throws(() => validateEmailAddress('victim@example.com\r\nRCPT TO:<attacker@example.com>'), /邮箱/);
const smtpWrites = [];
const smtpResponses = ['220 ready\r\n', '250 hello\r\n', '334 user\r\n', '334 pass\r\n', '235 auth\r\n', '250 mail\r\n', '250 rcpt\r\n', '354 data\r\n', '250 sent\r\n', '221 bye\r\n'];
const makeSocket = () => {
  let smtpIndex = 0;
  return {
    opened: Promise.resolve(),
    readable: { getReader() { return { async read() { return { value: new TextEncoder().encode(smtpResponses[smtpIndex++]), done: false }; }, releaseLock() {} }; } },
    writable: { getWriter() { return { async write(value) { smtpWrites.push(new TextDecoder().decode(value)); }, releaseLock() {} }; } },
    async close() {},
  };
};
await sendSmtp({ host: 'smtp.example.com', port: 465, username: 'u', password: 'p', encryption: 'ssl' }, { from: 'from@example.com', to: 'to@example.com', subject: '测试', html: '<p>ok</p>' }, () => makeSocket());
assert.ok(smtpWrites.some(value => value.includes('RCPT TO:<to@example.com>\r\n')));
assert.ok(smtpWrites.some(value => value.includes('To: to@example.com')));
await assert.rejects(() => sendSmtp({ host: 'smtp.example.com', port: 465, username: 'u', password: 'p', encryption: 'ssl' }, { from: 'from@example.com', to: 'victim@example.com\r\nRCPT TO:<attacker@example.com', subject: 'x', html: '<p>x</p>' }, () => makeSocket()), /收件邮箱/);

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
