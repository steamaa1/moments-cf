import assert from 'node:assert/strict';
import worker, { signJwt } from '../worker/src/index.js';
import { encryptConfigSecret } from '../worker/src/phase7.js';

/**
 * 评论通知的“自己评论不打扰自己”规则：
 * - 评论者是动态作者本人（登录）时，不向作者自己发送邮件/Telegram 通知；
 * - 作者回复他人评论时，仍通知被回复人（replyEmail）；
 * - 游客或其他登录用户评论时，通知照常发送。
 */
const JWT_SECRET = 'test-jwt-secret-at-least-32-characters-long!!';
const RESEND_ENDPOINT = 'https://api.resend.com/emails';
const TELEGRAM_PREFIX = 'https://api.telegram.org/bot';

const baseConfig = {
  enableComment: true,
  enableGoogleRecaptcha: false,
  googleSecretKey: '',
  enableTurnstile: false,
  turnstileSecretKey: '',
  maxCommentLength: 300,
  enableEmail: true,
  smtpUsername: 'noreply@example.com',
  smtpHost: '',
  smtpPasswordEncrypted: '',
  enableTelegram: true,
  telegramBotTokenEncrypted: '',
  telegramBotUsername: 'testbot',
};

const author = {
  id: 1, username: 'admin', nickname: '站长', email: 'author@example.com',
  telegram_chat_id: '10001', token_version: 0, password_hash: 'x',
  avatar_url: '', slogan: '', cover_url: '', created_at: '', updated_at: '',
};
const friend = {
  id: 2, username: 'friend', nickname: '朋友', email: 'friend@example.com',
  telegram_chat_id: '', token_version: 0, password_hash: 'x',
  avatar_url: '', slogan: '', cover_url: '', created_at: '', updated_at: '',
};
const memo = { id: 10, user_id: 1, content: '动态正文', imgs: '', show_type: 1, created_at: '2026-08-01 00:00:00' };

function makeDb(config, users, owner, memoRow, comments = {}) {
  return {
    prepare(sql) {
      const stmt = {
        args: [],
        bind(...args) { stmt.args = args; return stmt; },
        async first() {
          if (sql.includes('FROM sys_config')) return { content: JSON.stringify(config) };
          if (sql.includes('SELECT * FROM memos')) return memoRow;
          if (sql.includes('SELECT * FROM users WHERE id')) return users[Number(stmt.args[0])] || null;
          if (sql.includes('SELECT COUNT(*) AS total FROM comments')) return { total: 0 };
          if (sql.includes('SELECT id, username, email FROM comments')) {
            const comment = comments[Number(stmt.args[0])] || null;
            return comment && Number(comment.memo_id) === Number(stmt.args[1]) ? comment : null;
          }
          if (sql.includes('nickname,email,telegram_chat_id')) return owner;
          return null;
        },
        async run() { return { meta: { changes: 1 }, results: [] }; },
        async all() { return { results: [] }; },
      };
      return stmt;
    },
  };
}

async function postComment({ config, users, owner, memoRow = memo, comments = {}, payload, authToken = null }) {
  const fetchCalls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    fetchCalls.push({ url: String(url), init });
    return new Response('{}', { status: 200 });
  };
  try {
    const env = {
      DB: makeDb(config, users, owner, memoRow, comments),
      JWT_SECRET,
      LIKE_SALT: JWT_SECRET,
      RESEND_API_KEY: 're_test_key',
    };
    const headers = { 'content-type': 'application/json' };
    if (authToken) headers['x-api-token'] = authToken;
    const request = new Request('https://moments.example/api/comment/add', {
      method: 'POST', headers, body: JSON.stringify(payload),
    });
    const response = await worker.fetch(request, env);
    return { status: response.status, body: await response.json(), fetchCalls };
  } finally {
    globalThis.fetch = originalFetch;
  }
}

function resendCalls(calls) { return calls.filter(call => call.url === RESEND_ENDPOINT); }
function telegramCalls(calls) { return calls.filter(call => call.url.startsWith(TELEGRAM_PREFIX)); }
function resendTo(call) { return JSON.parse(call.init.body).to[0]; }

const botToken = await encryptConfigSecret('123456789:test-token', JWT_SECRET);
const selfToken = await signJwt({ sub: 1, tv: 0, exp: Math.floor(Date.now() / 1000) + 3600 }, JWT_SECRET);
const friendToken = await signJwt({ sub: 2, tv: 0, exp: Math.floor(Date.now() / 1000) + 3600 }, JWT_SECRET);
const telegramConfig = { ...baseConfig, telegramBotTokenEncrypted: botToken };

// 1. 作者本人登录评论自己的动态（非回复）→ 邮件、Telegram 均不发送
{
  const result = await postComment({
    config: telegramConfig,
    users: { 1: author },
    owner: author,
    payload: { memoId: 10, content: '自己顶一下' },
    authToken: selfToken,
  });
  assert.equal(result.status, 200);
  assert.equal(result.fetchCalls.length, 0, '作者自评不应触发任何通知');
}

// 2. 作者本人回复真实评论 → 服务端按 replyCommentId 查询邮箱并通知，不信任客户端邮箱
{
  const result = await postComment({
    config: telegramConfig,
    users: { 1: author },
    owner: author,
    comments: { 88: { id: 88, memo_id: 10, username: '访客A', email: 'guest@example.com' } },
    payload: { memoId: 10, content: '回复你', replyCommentId: 88, replyTo: '伪造名称', replyEmail: 'attacker@example.com' },
    authToken: selfToken,
  });
  assert.equal(result.status, 200);
  assert.equal(resendCalls(result.fetchCalls).length, 1, '作者回复他人评论应通知被回复人');
  assert.equal(resendTo(resendCalls(result.fetchCalls)[0]), 'guest@example.com');
  assert.equal(telegramCalls(result.fetchCalls).length, 0, '作者回复时不应给自己发 Telegram');
}

// 3. 伪造 replyEmail 但没有有效 replyCommentId → 不得向伪造邮箱发信
{
  const result = await postComment({
    config: telegramConfig,
    users: { 1: author },
    owner: author,
    payload: { memoId: 10, content: '伪造回复', replyTo: '任意人', replyEmail: 'attacker@example.com' },
    authToken: null,
  });
  assert.equal(result.status, 200);
  assert.equal(resendCalls(result.fetchCalls).length, 1);
  assert.equal(resendTo(resendCalls(result.fetchCalls)[0]), 'author@example.com', '无有效回复 ID 时只能通知动态作者');
}

// 4. 不属于当前动态的 replyCommentId → 拒绝请求
{
  const result = await postComment({
    config: telegramConfig,
    users: { 1: author },
    owner: author,
    comments: { 99: { id: 99, memo_id: 11, username: '其他动态访客', email: 'other@example.com' } },
    payload: { memoId: 10, content: '跨动态回复', replyCommentId: 99 },
    authToken: null,
  });
  assert.equal(result.status, 400);
  assert.match(result.body.message, /回复的评论不存在/);
  assert.equal(result.fetchCalls.length, 0);
}

// 5. 游客评论 → 邮件通知作者 + Telegram 通知作者
{
  const result = await postComment({
    config: telegramConfig,
    users: { 1: author },
    owner: author,
    payload: { memoId: 10, content: '游客评论', username: '游客', email: 'guest@example.com' },
    authToken: null,
  });
  assert.equal(result.status, 200);
  assert.equal(resendCalls(result.fetchCalls).length, 1);
  assert.equal(resendTo(resendCalls(result.fetchCalls)[0]), 'author@example.com');
  assert.equal(telegramCalls(result.fetchCalls).length, 1);
}

// 4. 其他登录用户评论作者动态 → 邮件 + Telegram 照常通知作者
{
  const result = await postComment({
    config: telegramConfig,
    users: { 1: author, 2: friend },
    owner: author,
    payload: { memoId: 10, content: '朋友评论' },
    authToken: friendToken,
  });
  assert.equal(result.status, 200);
  assert.equal(resendCalls(result.fetchCalls).length, 1);
  assert.equal(resendTo(resendCalls(result.fetchCalls)[0]), 'author@example.com');
  assert.equal(telegramCalls(result.fetchCalls).length, 1);
}

// 5. 作者自评且邮件/Telegram 均关闭时，接口仍正常
{
  const result = await postComment({
    config: { ...baseConfig, enableEmail: false, enableTelegram: false },
    users: { 1: author },
    owner: author,
    payload: { memoId: 10, content: '关闭通知后自评' },
    authToken: selfToken,
  });
  assert.equal(result.status, 200);
  assert.equal(result.fetchCalls.length, 0);
}

console.log('Comment self-notification suppression tests: PASS');
