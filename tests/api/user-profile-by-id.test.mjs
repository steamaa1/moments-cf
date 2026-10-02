import assert from 'node:assert/strict';
import worker from '../../worker/src/index.js';

const user = {
  id: 2,
  username: 'empty_user',
  nickname: '空动态用户',
  avatar_url: '/avatar.webp',
  slogan: '暂无公开动态',
  cover_url: '/cover.webp',
  email: 'private@example.com',
  telegram_chat_id: '123456',
  registration_state: 1,
};
const queries = [];
const hiddenUsers = new Map([
  [3, { ...user, id: 3, registration_state: 0 }],
  [4, { ...user, id: 4, registration_state: 2 }],
]);
const env = {
  DB: {
    prepare(sql) {
      queries.push(sql);
      return {
        args: [],
        bind(...args) { this.args = args; return this; },
        async first() {
          if (sql.includes('SELECT * FROM users WHERE id')) {
            const id = Number(this.args[0]);
            if (id === user.id) return user;
            if (hiddenUsers.has(id) && sql.includes('registration_state = 1')) return null;
            return hiddenUsers.get(id) || null;
          }
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
for (const id of [3, 4]) {
  const hidden = await worker.fetch(new Request(`https://moments.example/api/user/profileById?id=${id}`, { method: 'POST' }), env);
  assert.equal(hidden.status, 404, `registration_state=${id === 3 ? 0 : 2} 用户不得通过公开 profileById`);
}
assert.ok(queries.some(sql => sql.includes('registration_state = 1')), '公开 profile 查询必须过滤 registration_state');

// 非法 percent 编码只应得到不存在结果，不能触发 Worker 503。
const malformed = await worker.fetch(new Request('https://moments.example/api/user/profile/%E0%A4%A', { method: 'POST' }), env);
assert.notEqual(malformed.status, 503);

console.log('User profile by id tests: PASS');
