import assert from 'node:assert/strict';
import worker from '../worker/src/index.js';

const user = {
  id: 2,
  username: 'empty_user',
  nickname: '空动态用户',
  avatar_url: '/avatar.webp',
  slogan: '暂无公开动态',
  cover_url: '/cover.webp',
  email: 'private@example.com',
  telegram_chat_id: '123456',
};
const env = {
  DB: {
    prepare(sql) {
      return {
        args: [],
        bind(...args) { this.args = args; return this; },
        async first() {
          if (sql.includes('SELECT * FROM users WHERE id')) return Number(this.args[0]) === user.id ? user : null;
          if (sql.includes('FROM user_status')) return null;
          return null;
        },
      };
    },
  },
};

const response = await worker.fetch(new Request('https://moments.example/api/user/profileById?id=2', { method: 'POST' }), env);
const body = await response.json();
assert.equal(response.status, 200, body.message);
assert.equal(body.data.id, 2);
assert.equal(body.data.nickname, '空动态用户');
assert.equal(body.data.email, undefined, '公开用户资料不得返回邮箱');
assert.equal(body.data.telegramChatId, undefined, '公开用户资料不得返回 Telegram ID');

const missing = await worker.fetch(new Request('https://moments.example/api/user/profileById?id=999', { method: 'POST' }), env);
assert.equal(missing.status, 404);
const invalid = await worker.fetch(new Request('https://moments.example/api/user/profileById?id=0', { method: 'POST' }), env);
assert.equal(invalid.status, 400);

console.log('User profile by id tests: PASS');
