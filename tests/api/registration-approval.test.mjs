import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import worker, { signJwt, passwordHash } from '../../worker/src/index.js';
import { encryptConfigSecret } from '../../worker/src/phase7.js';

/**
 * 注册审批功能回归：
 * - 开关开启时注册需填理由，注册后待审批，通知管理员（邮件/Telegram）
 * - 待审批/已拒绝用户无法登录
 * - 管理员审批列表、批准（通知用户）、拒绝（不通知）
 */
const JWT_SECRET = 'test-jwt-secret-at-least-32-characters-long!!';
const RESEND = 'https://api.resend.com/emails';
const TG = 'https://api.telegram.org/bot';
const adminToken = await signJwt({ sub: 1, tv: 0, exp: Math.floor(Date.now() / 1000) + 3600 }, JWT_SECRET);

const baseConfig = {
  enableRegister: true,
  enableRegisterApproval: false,
  enableEmail: true,
  smtpUsername: 'noreply@example.com',
  smtpHost: '',
  smtpPasswordEncrypted: '',
  enableTelegram: true,
  telegramBotUsername: 'testbot',
  telegramBotTokenEncrypted: '',
  title: '测试站',
};

function makeDb(config, users = {}) {
  return {
    prepare(sql) {
      const stmt = {
        args: [],
        bind(...args) { stmt.args = args; return stmt; },
        async first() {
          if (sql.includes('FROM sys_config')) return { content: JSON.stringify(config) };
          if (sql.includes('SELECT id FROM users WHERE username')) return null; // 用户名查重
          if (sql.includes('SELECT email, telegram_chat_id FROM users WHERE id=1')) return { email: 'admin@example.com', telegram_chat_id: '10001' };
          if (sql.includes('registration_state FROM users WHERE id')) return users[Number(stmt.args[0])] || null;
          if (sql.includes('SELECT * FROM users WHERE id')) return users[Number(stmt.args[0])] || null;
          if (sql.includes('SELECT * FROM users WHERE username')) return users[String(stmt.args[0])] || null;
          return null;
        },
        async all() { return { results: users.pendingList || [] }; },
        async run() { return { meta: { changes: 1 }, results: [] }; },
      };
      return stmt;
    },
  };
}

async function post(env, path, body, token = null) {
  const headers = { 'content-type': 'application/json' };
  if (token) headers['x-api-token'] = token;
  const request = new Request(`https://moments.example${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
  const response = await worker.fetch(request, env);
  return { status: response.status, body: await response.json() };
}

function withFetch(calls) {
  return async (url, init) => {
    calls.push({ url: String(url), init });
    return new Response('{}', { status: 200 });
  };
}

const botToken = await encryptConfigSecret('123456789:test', JWT_SECRET);

// 1. 开关开启：注册需理由；有理由 → 待审批 + 通知管理员；无理由 → 400
{
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = withFetch(calls);
  try {
    const cfg = { ...baseConfig, enableRegisterApproval: true, telegramBotTokenEncrypted: botToken };
    const env = { DB: makeDb(cfg), JWT_SECRET, LIKE_SALT: JWT_SECRET, RESEND_API_KEY: 're_key' };
    const noReason = await post(env, '/api/user/reg', { username: 'alice', password: 'password123', repeatPassword: 'password123', email: 'alice@example.com' });
    assert.equal(noReason.status, 400);
    assert.match(noReason.body.message, /注册理由/);

    const ok = await post(env, '/api/user/reg', { username: 'alice', password: 'password123', repeatPassword: 'password123', email: 'alice@example.com', reason: '想在这里记录生活' });
    assert.equal(ok.status, 202);
    assert.equal(ok.body.data.awaitingApproval, true);
    const mail = calls.filter(c => c.url === RESEND);
    const tg = calls.filter(c => c.url.startsWith(TG));
    assert.ok(mail.length + tg.length >= 1, '待审批应通知管理员');
    assert.ok(calls.some(c => JSON.stringify(c.init).includes('待审批')), '通知应包含审批文案');
  } finally { globalThis.fetch = original; }
}

// 2. 开关关闭：注册即通过，无通知
{
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = withFetch(calls);
  try {
    const env = { DB: makeDb(baseConfig), JWT_SECRET, LIKE_SALT: JWT_SECRET, RESEND_API_KEY: 're_key' };
    const ok = await post(env, '/api/user/reg', { username: 'bob', password: 'password123', repeatPassword: 'password123' });
    assert.equal(ok.status, 201);
    assert.equal(ok.body.data.awaitingApproval, false);
    assert.equal(calls.length, 0, '审批关闭时不应发通知');
  } finally { globalThis.fetch = original; }
}

// 3. 待审批 / 已拒绝用户无法登录
{
  const original = globalThis.fetch;
  globalThis.fetch = withFetch([]);
  try {
    const hash = await passwordHash('password123', 10000);
    const pending = { id: 10, username: 'pending', password_hash: hash, token_version: 0, registration_state: 0 };
    const rejected = { id: 11, username: 'rejected', password_hash: hash, token_version: 0, registration_state: 2 };
    const approved = { id: 12, username: 'approved', password_hash: hash, token_version: 0, registration_state: 1 };
    const env = { DB: makeDb(baseConfig, { pending, rejected, approved }), JWT_SECRET, LIKE_SALT: JWT_SECRET, RESEND_API_KEY: 're_key' };
    const p = await post(env, '/api/user/login', { username: 'pending', password: 'password123' });
    assert.equal(p.status, 403);
    assert.match(p.body.message, /待管理员审批/);
    const r = await post(env, '/api/user/login', { username: 'rejected', password: 'password123' });
    assert.equal(r.status, 403);
    assert.match(r.body.message, /未通过/);
    const a = await post(env, '/api/user/login', { username: 'approved', password: 'password123' });
    assert.equal(a.status, 200);
    assert.ok(a.body.data.token);
  } finally { globalThis.fetch = original; }
}

// 4. 审批 API：列表 / 批准（通知用户）/ 拒绝（不通知）
{
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = withFetch(calls);
  try {
    const cfg = { ...baseConfig, enableRegisterApproval: true, telegramBotTokenEncrypted: botToken };
    const env = {
      DB: makeDb(cfg, {
        pendingList: [{ id: 20, username: 'carol', nickname: 'carol', email: 'carol@example.com', registration_reason: '想看看', created_at: '2026-08-15 10:00:00' }],
        20: { id: 20, username: 'carol', email: 'carol@example.com', registration_state: 0 },
        21: { id: 21, username: 'dave', email: '', registration_state: 0 },
        1: { id: 1, username: 'admin', token_version: 0 },
        2: { id: 2, username: 'user2', token_version: 0 },
      }),
      JWT_SECRET, LIKE_SALT: JWT_SECRET, RESEND_API_KEY: 're_key',
    };
    const list = await post(env, '/api/admin/registration/requests', {}, adminToken);
    assert.equal(list.status, 200);
    assert.equal(list.body.data.length, 1);
    assert.equal(list.body.data[0].reason, '想看看');
    assert.equal(list.body.data[0].username, 'carol');

    // 非管理员访问 → 403
    const userToken = await signJwt({ sub: 2, tv: 0, exp: Math.floor(Date.now() / 1000) + 3600 }, JWT_SECRET);
    const forbidden = await post(env, '/api/admin/registration/requests', {}, userToken);
    assert.equal(forbidden.status, 403);

    const approve = await post(env, '/api/admin/registration/approve', { id: 20 }, adminToken);
    assert.equal(approve.status, 200);
    const mail = calls.filter(c => c.url === RESEND);
    assert.ok(mail.length >= 1, '批准后应邮件通知用户');
    assert.ok(calls.some(c => JSON.stringify(c.init).includes('注册申请已通过')), '通知应为通过文案');

    const before = calls.length;
    const reject = await post(env, '/api/admin/registration/reject', { id: 21 }, adminToken);
    assert.equal(reject.status, 200);
    assert.equal(calls.length, before, '拒绝时不应通知');
  } finally { globalThis.fetch = original; }
}

// 5. 静态断言：设置开关、注册理由表单、审批页 API 与守卫、migration
{
  const settings = await readFile(new URL('../../front/pages/sys/settings.vue', import.meta.url), 'utf8');
  assert.match(settings, /enableRegisterApproval/, '设置页应有审批开关');
  assert.match(settings, /to="\/sys\/approve"/, '设置页应有审批入口');
  assert.match(settings, /userinfo\.id !== 1/, '系统设置页应限管理员访问');
  const reg = await readFile(new URL('../../front/pages/user/reg.vue', import.meta.url), 'utf8');
  assert.match(reg, /state\.reason/, '注册页应有理由字段');
  assert.match(reg, /请填写注册理由/, '理由必填校验');
  const approve = await readFile(new URL('../../front/pages/sys/approve.vue', import.meta.url), 'utf8');
  assert.match(approve, /admin\/registration\/requests/, '审批页应调用列表 API');
  assert.match(approve, /admin\/registration\/approve/, '审批页应调用批准 API');
  assert.match(approve, /admin\/registration\/reject/, '审批页应调用拒绝 API');
  assert.match(approve, /userinfo\.id !== 1/, '审批页应限管理员');
  assert.match(approve, /\$dayjs\.utc/, '审批时间应按 UTC 解析');
  const migration = await readFile(new URL('../../worker/migrations/0014_registration_approval.sql', import.meta.url), 'utf8');
  assert.match(migration, /registration_reason/, 'migration 应有注册理由字段');
  assert.match(migration, /registration_state/, 'migration 应有审批状态字段');
}

console.log('Registration approval tests: PASS');
