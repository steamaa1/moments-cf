import worker, { passwordHash, passwordMatches, signJwt, verifyJwt } from '../src/index.js';

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

const assets = { async fetch(request) { return new Response(`asset:${new URL(request.url).pathname}`); } };
const baseEnv = { ASSETS: assets, CORS_ORIGIN: 'https://moments.example.com' };

const health = await worker.fetch(new Request('https://moments.example.com/api/health', {
  headers: { Origin: 'https://moments.example.com' },
}), baseEnv);
expect(health.status === 200, 'health endpoint must return 200');
const healthData = await health.json();
expect(healthData.code === 0 && healthData.data.phase === 4, 'health must report Phase 4');
expect(health.headers.get('access-control-allow-origin') === 'https://moments.example.com', 'health CORS origin mismatch');

const options = await worker.fetch(new Request('https://moments.example.com/api/health', { method: 'OPTIONS' }), baseEnv);
expect(options.status === 204, 'CORS preflight must return 204');

const noDb = await worker.fetch(new Request('https://moments.example.com/api/user/login', {
  method: 'POST', body: JSON.stringify({ username: 'admin', password: 'password123' }),
}), baseEnv);
expect(noDb.status === 503, 'unbound D1 login must return 503');

const initNoSecret = await worker.fetch(new Request('https://moments.example.com/api/admin/initialize', {
  method: 'POST', body: JSON.stringify({ username: 'admin', password: 'password123' }),
}), baseEnv);
expect(initNoSecret.status === 503, 'initialization without secret must return 503');

const hash = await passwordHash('password123', 10000);
expect(hash.startsWith('pbkdf2-sha256$10000$'), 'password hash scheme mismatch');
const cappedHash = await passwordHash('password123', 100001);
expect(cappedHash.startsWith('pbkdf2-sha256$100000$'), 'iteration count above Worker limit must be capped');
expect(await passwordMatches('password123', hash), 'correct password must match');
expect(!(await passwordMatches('wrong-password', hash)), 'wrong password must not match');

const now = Math.floor(Date.now() / 1000);
const token = await signJwt({ sub: '1', tv: 0, exp: now + 60 }, 'test-secret');
const payload = await verifyJwt(token, 'test-secret');
expect(payload?.sub === '1', 'signed JWT must verify');
expect((await verifyJwt(token, 'wrong-secret')) === null, 'wrong JWT secret must fail');

const appAsset = await worker.fetch(new Request('https://moments.example.com/memo/123'), baseEnv);
expect(appAsset.status === 200 && (await appAsset.text()) === 'asset:/memo/123', 'SPA fallback failed');
const missingR2 = await worker.fetch(new Request('https://moments.example.com/upload/2026/cover.webp'), baseEnv);
expect(missingR2.status === 503, 'unbound R2 must return 503');
const rss = await worker.fetch(new Request('https://moments.example.com/rss'), baseEnv);
expect(rss.status === 503, 'RSS without D1 must return 503');

// In-memory D1/R2 doubles: exercise initialize → login → profile → config → upload.
const state = { users: [], config: null, media: [] };
function makeStatement(sql, values = []) {
  return {
    sql,
    values,
    bind(...next) { return makeStatement(sql, next); },
    async first() {
      if (sql.startsWith('SELECT id FROM users LIMIT')) return state.users[0] ? { id: state.users[0].id } : null;
      if (sql.startsWith('SELECT * FROM users WHERE username')) return state.users.find(user => user.username === values[0]) || null;
      if (sql.startsWith('SELECT * FROM users WHERE id')) return state.users.find(user => user.id === Number(values[0])) || null;
      if (sql.startsWith('SELECT content FROM sys_config')) return state.config ? { content: state.config } : null;
      return null;
    },
    async run() {
      if (sql.startsWith('UPDATE users SET nickname=')) {
        const user = state.users.find(item => item.id === Number(values[7]));
        Object.assign(user, { nickname: values[0], avatar_url: values[1], slogan: values[2], cover_url: values[3], email: values[4], password_hash: values[5], token_version: values[6] });
      } else if (sql.startsWith('INSERT INTO media')) {
        state.media.push({ owner_id: values[0], r2_key: values[1], original_filename: values[2], content_type: values[3], size_bytes: values[4] });
      }
      return { success: true };
    },
  };
}
const memoryDb = {
  prepare(sql) { return makeStatement(sql); },
  async batch(statements) {
    for (const item of statements) {
      if (item.sql.startsWith('INSERT INTO users')) {
        state.users.push({ id: 1, username: item.values[0], nickname: item.values[1], password_hash: item.values[2], slogan: item.values[3], avatar_url: '/avatar.webp', cover_url: '/cover.webp', email: '', token_version: 0 });
      } else if (item.sql.startsWith('INSERT INTO sys_config')) {
        state.config = item.values[0];
      } else if (item.sql.startsWith('INSERT INTO sys_config (id, content, updated_at)')) {
        state.config = item.values[0];
      } else if (item.sql.startsWith('UPDATE users SET username=')) {
        state.users[0].username = item.values[0];
      } else {
        await item.run();
      }
    }
    return [];
  },
};
const uploaded = [];
const integrationEnv = {
  ASSETS: assets,
  DB: memoryDb,
  MEDIA: { async put(key, body, options) { uploaded.push({ key, body, options }); } },
  JWT_SECRET: 'integration-jwt-secret',
  INIT_SECRET: 'integration-init-secret',
  PBKDF2_ITERATIONS: '10000',
  CORS_ORIGIN: '*',
};

const init = await worker.fetch(new Request('https://moments.example.com/api/admin/initialize', {
  method: 'POST', headers: { 'content-type': 'application/json', 'x-init-secret': 'integration-init-secret' },
  body: JSON.stringify({ username: 'admin', nickname: '管理员', password: 'password123' }),
}), integrationEnv);
expect(init.status === 201 && (await init.json()).code === 0, 'initialization must succeed once');
expect(state.users.length === 1 && state.config, 'initialization must create user and config');

const repeatInit = await worker.fetch(new Request('https://moments.example.com/api/admin/initialize', {
  method: 'POST', headers: { 'content-type': 'application/json', 'x-init-secret': 'integration-init-secret' },
  body: JSON.stringify({ username: 'admin', password: 'password123' }),
}), integrationEnv);
expect(repeatInit.status === 409, 'initialization must be one-time');

const login = await worker.fetch(new Request('https://moments.example.com/api/user/login', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: 'password123' }),
}), integrationEnv);
const loginBody = await login.json();
expect(login.status === 200 && loginBody.code === 0 && loginBody.data.token, 'login must return compatible token');
const tokenHeader = { 'content-type': 'application/json', 'x-api-token': loginBody.data.token };

const profileSave = await worker.fetch(new Request('https://moments.example.com/api/user/saveProfile', {
  method: 'POST', headers: tokenHeader, body: JSON.stringify({ nickname: '云梦川', slogan: '测试签名', avatarUrl: '/upload/avatar.webp', coverUrl: '/upload/cover.webp', email: 'test@example.com' }),
}), integrationEnv);
expect(profileSave.status === 200 && (await profileSave.json()).code === 0, 'profile save must succeed');
expect(state.users[0].nickname === '云梦川', 'profile save must update nickname');

const fullConfig = await worker.fetch(new Request('https://moments.example.com/api/sysConfig/getFull', { method: 'POST', headers: tokenHeader }), integrationEnv);
expect(fullConfig.status === 200 && (await fullConfig.json()).code === 0, 'admin must read full config');

const configSave = await worker.fetch(new Request('https://moments.example.com/api/sysConfig/save', {
  method: 'POST', headers: tokenHeader, body: JSON.stringify({ title: '云梦川的朋友圈', css: '.demo{}', enableRegister: false }),
}), integrationEnv);
expect(configSave.status === 200 && (await configSave.json()).code === 0, 'config save must succeed');
const publicConfig = await worker.fetch(new Request('https://moments.example.com/api/sysConfig/get', { method: 'POST' }), integrationEnv);
const publicConfigBody = await publicConfig.json();
expect(publicConfigBody.data.title === '云梦川的朋友圈', 'public config must return saved title');

const form = new FormData();
form.append('files', new File(['image-bytes'], 'avatar.webp', { type: 'image/webp' }));
const upload = await worker.fetch(new Request('https://moments.example.com/api/file/upload', { method: 'POST', headers: { 'x-api-token': loginBody.data.token }, body: form }), integrationEnv);
const uploadBody = await upload.json();
expect(upload.status === 200 && uploadBody.data.length === 1, 'authenticated upload must succeed');
expect(uploaded.length === 1 && state.media.length === 1, 'upload must write R2 and media record');

console.log('Phase 2 integration API tests: PASS');

const memoRow = {
  id: 7, content: '第一条动态', imgs: '/upload/media/demo.webp', fav_count: 2, comment_count: 0,
  user_id: 1, created_at: '2026-08-06 06:00:00', updated_at: '2026-08-06 06:00:00',
  location: '郴州', external_url: '', external_title: '', external_favicon: '/favicon.png',
  pinned: 1, ext: '{}', show_type: 1, tags: '日常,测试,', username: 'admin', nickname: '云梦川',
  avatar_url: '/avatar.webp', slogan: '测试签名', cover_url: '/cover.webp',
};
const DEFAULT_CONFIG_FOR_TEST = { rss: '', title: '测试朋友圈' };
const memoReadDb = {
  prepare(sql) {
    return {
      bind() { return this; },
      async first() {
        if (sql.includes('COUNT(*) AS total')) return { total: 1 };
        if (sql.startsWith('SELECT content FROM sys_config')) return { content: JSON.stringify({ ...DEFAULT_CONFIG_FOR_TEST, title: '测试朋友圈' }) };
        if (sql.startsWith('SELECT * FROM users WHERE id=1')) return { ...memoRow };
        if (sql.includes('WHERE m.id =')) return memoRow;
        return null;
      },
      async all() {
        if (sql.startsWith('SELECT * FROM comments')) throw new Error('no such table: comments');
        if (sql.includes('FROM memos')) return { results: [memoRow] };
        return { results: [] };
      },
    };
  },
};
const listResponse = await worker.fetch(new Request('https://moments.example.com/api/memo/list', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ page: 1, size: 10, tag: '日常' }),
}), { ASSETS: assets, DB: memoReadDb, CORS_ORIGIN: '*' });
const listBody = await listResponse.json();
expect(listResponse.status === 200 && listBody.data.list.length === 1, 'public memo list must return visible memo');
expect(listBody.data.list[0].imgConfigs[0].url === '/upload/media/demo.webp', 'memo list must build image configs');
expect(listBody.data.list[0].comments.length === 0, 'memo list must survive an unavailable comments table');

const rssResponse = await worker.fetch(new Request('https://moments.example.com/rss'), { ASSETS: assets, DB: memoReadDb });
const rssText = await rssResponse.text();
expect(rssResponse.status === 200 && rssText.includes('<rss version="2.0">') && rssText.includes('第一条动态'), 'RSS must render public memos');

console.log('Phase 3 memo list and RSS tests: PASS');
