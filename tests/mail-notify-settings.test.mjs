import assert from 'node:assert/strict';
import worker, { signJwt } from '../worker/src/index.js';

const JWT_SECRET = 'mail-notify-settings-secret-at-least-32-characters';
const admin = { id: 1, username: 'admin', nickname: 'Admin', token_version: 0, password_hash: 'x' };
const savedConfig = { smtpHost: '', smtpUsername: '', smtpPort: '465' };

class Statement {
  constructor(sql) { this.sql = sql; this.args = []; }
  bind(...args) { this.args = args; return this; }
  async first() {
    const sql = this.sql.toLowerCase();
    if (sql.includes('select * from users where id')) return Number(this.args[0]) === 1 ? admin : null;
    if (sql.includes('select content from sys_config')) return { content: JSON.stringify(savedConfig) };
    return null;
  }
  async run() { return { meta: { changes: 1 } }; }
}
const db = { prepare(sql) { return new Statement(sql); } };
const token = await signJwt({ sub: '1', tv: 0, exp: Math.floor(Date.now() / 1000) + 60 }, JWT_SECRET);
const auth = { 'content-type': 'application/json', 'x-api-token': token };
const env = { DB: db, JWT_SECRET };

// 模拟 socket：连接后立即 done（readSmtpResponse 会抛「SMTP 连接提前关闭」），
// 但 connect 的 secureTransport 参数已被捕获，足以验证加密方式映射。
const captured = [];
const fakeSocket = () => ({
  opened: Promise.resolve(),
  readable: { getReader() { return { async read() { return { done: true }; } }; } },
  writable: { getWriter() { return { write: async () => {}, releaseLock() {} }; } },
  startTls() { return fakeSocket(); },
  async close() {},
});
const connectImpl = (target, extra) => { captured.push({ target, extra }); return fakeSocket(); };

const post = (path, body, extraEnv = {}) => worker.fetch(new Request('https://moments.example' + path, { method: 'POST', headers: auth, body: JSON.stringify(body) }), { ...env, ...extraEnv });

// 1) 收件邮箱校验
let res = await post('/api/admin/mail/test', { to: 'not-an-email' });
assert.equal(res.status, 400); assert.match((await res.json()).message, /收件邮箱/);

// 2) 缺少发件邮箱
res = await post('/api/admin/mail/test', { to: 'a@b.com' });
assert.equal(res.status, 400); assert.match((await res.json()).message, /发件邮箱/);

// 3) 缺少密码
res = await post('/api/admin/mail/test', { to: 'a@b.com', smtpUsername: 'noreply@example.com' });
assert.equal(res.status, 400); assert.match((await res.json()).message, /密码/);

// 4) SSL（端口 465）→ secureTransport 'use'
res = await post('/api/admin/mail/test', { to: 'a@b.com', smtpHost: 'smtp.example.com', smtpPort: '465', smtpEncryption: 'ssl', smtpUsername: 'noreply@example.com', smtpPassword: 'secret' }, { connectSockets: connectImpl });
assert.equal(captured[captured.length - 1].extra.secureTransport, 'use', 'SSL 应使用隐式 TLS');

// 5) TLS（端口 587）→ secureTransport 'starttls'
res = await post('/api/admin/mail/test', { to: 'a@b.com', smtpHost: 'smtp.example.com', smtpPort: '587', smtpEncryption: 'tls', smtpUsername: 'noreply@example.com', smtpPassword: 'secret' }, { connectSockets: connectImpl });
assert.equal(captured[captured.length - 1].extra.secureTransport, 'starttls', 'TLS 应使用 STARTTLS');

// 6) 未显式传加密方式时按端口推导（端口 587 → TLS）
res = await post('/api/admin/mail/test', { to: 'a@b.com', smtpHost: 'smtp.example.com', smtpPort: '587', smtpUsername: 'noreply@example.com', smtpPassword: 'secret' }, { connectSockets: connectImpl });
assert.equal(captured[captured.length - 1].extra.secureTransport, 'starttls', '端口 587 缺省应按 TLS（STARTTLS）');

// 7) SMTP 连接失败时返回明确错误信息
res = await post('/api/admin/mail/test', { to: 'a@b.com', smtpHost: 'smtp.example.com', smtpPort: '465', smtpEncryption: 'ssl', smtpUsername: 'noreply@example.com', smtpPassword: 'secret' }, { connectSockets: connectImpl });
assert.equal(res.status, 400); assert.match((await res.json()).message, /邮件测试发送失败/);

// 8) Resend 直发成功：re_ 开头凭据走 sendResend
const calls = [];
const prevFetch = globalThis.fetch;
globalThis.fetch = async (url, init = {}) => { calls.push({ url: String(url), init }); return new Response('{}', { status: 200 }); };
try {
  res = await post('/api/admin/mail/test', { to: 'a@b.com', smtpUsername: 'noreply@example.com', smtpPassword: 're_testkey' });
  const body = await res.json();
  assert.equal(res.status, 200); assert.equal(body.data.provider, 'resend');
  assert.ok(calls.some(c => c.url.startsWith('https://api.resend.com/')));
} finally {
  globalThis.fetch = prevFetch;
}

console.log('Mail notify settings tests: PASS');
