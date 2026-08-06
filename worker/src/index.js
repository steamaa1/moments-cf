/**
 * Moments Cloudflare Worker.
 * Phase 2: D1-backed bootstrap/auth/profile/config and authenticated R2 upload.
 * Existing Moments frontend remains compatible through POST /api routes and x-api-token.
 */

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const DEFAULT_CONFIG = {
  adminUserName: 'admin',
  enableS3: false,
  enableAutoLoadNextPage: true,
  favicon: '/favicon.png',
  title: '极简朋友圈',
  beiAnNo: '',
  css: '',
  js: '',
  rss: '',
  enableGoogleRecaptcha: false,
  googleSiteKey: '',
  enableComment: true,
  maxCommentLength: 300,
  memoMaxHeight: 0,
  commentOrder: 'desc',
  timeFormat: 'timeAgo',
  enableRegister: false,
  enableEmail: false,
  smtpHost: '',
  smtpPort: '',
  smtpUsername: '',
  smtpPassword: '',
  s3: { thumbnailSuffix: '' },
};
const ALLOWED_MEDIA_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
  'video/mp4', 'video/webm', 'video/quicktime',
]);
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=UTF-8', ...extraHeaders },
  });
}
function ok(data = {}) { return { code: 0, data }; }
function fail(message, code = 1) { return { code, message }; }
function base64url(bytes) {
  const array = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let text = '';
  for (const byte of array) text += String.fromCharCode(byte);
  return btoa(text).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}
function decodeBase64url(value) {
  const padded = value.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - value.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}
function randomToken(bytes = 24) {
  const value = new Uint8Array(bytes);
  crypto.getRandomValues(value);
  return base64url(value);
}
function corsHeaders(request, env) {
  const origin = request.headers.get('Origin');
  const allowed = (env.CORS_ORIGIN || '').split(',').map(value => value.trim()).filter(Boolean);
  const allowOrigin = env.CORS_ORIGIN === '*' ? (origin || '*') : (origin && allowed.includes(origin) ? origin : (allowed[0] || '*'));
  return {
    'access-control-allow-origin': allowOrigin,
    'access-control-allow-credentials': 'true',
    'access-control-allow-headers': 'content-type, x-api-token, authorization, x-init-secret',
    'access-control-allow-methods': 'GET,HEAD,POST,PUT,DELETE,OPTIONS',
    vary: 'Origin',
  };
}
function requireBinding(env, name) {
  if (!env[name]) throw new Error(`${name} binding is not configured`);
  return env[name];
}
async function readJson(request) {
  try { return await request.json(); } catch { return null; }
}
function publicUser(user) {
  if (!user) return null;
  return {
    id: Number(user.id), username: user.username, nickname: user.nickname,
    avatarUrl: user.avatar_url, slogan: user.slogan, coverUrl: user.cover_url, email: user.email,
  };
}
function parseConfig(value) {
  try { return { ...DEFAULT_CONFIG, ...(value ? JSON.parse(value) : {}) }; } catch { return { ...DEFAULT_CONFIG }; }
}
async function hmac(secret, value) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(value)));
}
async function signJwt(payload, secret) {
  const header = base64url(encoder.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const body = base64url(encoder.encode(JSON.stringify(payload)));
  return `${header}.${body}.${base64url(await hmac(secret, `${header}.${body}`))}`;
}
async function verifyJwt(token, secret) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) return null;
  const expected = base64url(await hmac(secret, `${parts[0]}.${parts[1]}`));
  if (expected.length !== parts[2].length) return null;
  let mismatch = 0;
  for (let i = 0; i < expected.length; i += 1) mismatch |= expected.charCodeAt(i) ^ parts[2].charCodeAt(i);
  if (mismatch !== 0) return null;
  try {
    const payload = JSON.parse(decoder.decode(decodeBase64url(parts[1])));
    return payload.exp && payload.exp > Math.floor(Date.now() / 1000) ? payload : null;
  } catch { return null; }
}
async function passwordHash(password, iterations = 210000) {
  const salt = randomToken(16);
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: encoder.encode(salt), iterations }, key, 256);
  return `pbkdf2-sha256$${iterations}$${salt}$${base64url(bits)}`;
}
async function passwordMatches(password, stored) {
  const [scheme, iterations, salt, expected] = String(stored || '').split('$');
  if (scheme !== 'pbkdf2-sha256' || !iterations || !salt || !expected) return false;
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: encoder.encode(salt), iterations: Number(iterations) }, key, 256);
  const actual = base64url(bits);
  if (actual.length !== expected.length) return false;
  let mismatch = 0;
  for (let i = 0; i < actual.length; i += 1) mismatch |= actual.charCodeAt(i) ^ expected.charCodeAt(i);
  return mismatch === 0;
}
function tokenFrom(request) {
  const auth = request.headers.get('authorization');
  return request.headers.get('x-api-token') || (auth?.startsWith('Bearer ') ? auth.slice(7) : '');
}
async function currentUser(request, env) {
  if (!env.JWT_SECRET || !env.DB) return null;
  const payload = await verifyJwt(tokenFrom(request), env.JWT_SECRET);
  if (!payload?.sub) return null;
  const user = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(Number(payload.sub)).first();
  if (!user || Number(user.token_version) !== Number(payload.tv || 0)) return null;
  return user;
}
async function requireUser(request, env, headers, adminOnly = false) {
  const user = await currentUser(request, env);
  if (!user) return { response: json(fail('需要先登录', 3), 401, headers) };
  if (adminOnly && Number(user.id) !== 1) return { response: json(fail('无权限', 4), 403, headers) };
  return { user };
}
function cleanProfile(input, existing) {
  return {
    nickname: String(input.nickname ?? existing.nickname ?? '').trim().slice(0, 80),
    avatarUrl: String(input.avatarUrl ?? existing.avatar_url ?? '').trim().slice(0, 1024),
    slogan: String(input.slogan ?? existing.slogan ?? '').trim().slice(0, 300),
    coverUrl: String(input.coverUrl ?? existing.cover_url ?? '').trim().slice(0, 1024),
    email: String(input.email ?? existing.email ?? '').trim().slice(0, 254),
  };
}

async function initialize(request, env, headers) {
  const body = await readJson(request);
  if (!env.INIT_SECRET) return json(fail('服务端未配置 INIT_SECRET'), 503, headers);
  if (request.headers.get('x-init-secret') !== env.INIT_SECRET) return json(fail('初始化密钥错误'), 403, headers);
  if (!body?.username || !body?.password || String(body.username).length < 3 || String(body.password).length < 8) {
    return json(fail('用户名至少 3 位，密码至少 8 位'), 400, headers);
  }
  const db = requireBinding(env, 'DB');
  const exists = await db.prepare('SELECT id FROM users LIMIT 1').first();
  if (exists) return json(fail('站点已初始化'), 409, headers);
  const username = String(body.username).trim();
  const hash = await passwordHash(String(body.password), Number(env.PBKDF2_ITERATIONS || 210000));
  const config = { ...DEFAULT_CONFIG, adminUserName: username };
  await db.batch([
    db.prepare('INSERT INTO users (id, username, nickname, password_hash, slogan) VALUES (1, ?, ?, ?, ?)').bind(username, String(body.nickname || username).slice(0, 80), hash, '记录生活的每一个瞬间。'),
    db.prepare('INSERT INTO sys_config (id, content) VALUES (1, ?)').bind(JSON.stringify(config)),
  ]);
  return json(ok({ initialized: true }), 201, headers);
}
async function login(request, env, headers) {
  const body = await readJson(request);
  if (!body?.username || !body?.password) return json(fail('用户名或密码不能为空'), 400, headers);
  if (!env.JWT_SECRET) return json(fail('服务端未配置 JWT_SECRET'), 503, headers);
  const db = requireBinding(env, 'DB');
  const user = await db.prepare('SELECT * FROM users WHERE username = ?').bind(String(body.username).trim()).first();
  if (!user || !(await passwordMatches(String(body.password), user.password_hash))) {
    return json(fail('用户不存在或密码不正确'), 401, headers);
  }
  const now = Math.floor(Date.now() / 1000);
  const token = await signJwt({ sub: String(user.id), username: user.username, tv: Number(user.token_version), iat: now, exp: now + 60 * 60 * 24 * 14 }, env.JWT_SECRET);
  return json(ok({ token, username: user.username, id: Number(user.id) }), 200, headers);
}
async function getProfile(request, env, headers, username = null) {
  const db = requireBinding(env, 'DB');
  const user = username
    ? await db.prepare('SELECT * FROM users WHERE username = ?').bind(decodeURIComponent(username)).first()
    : (await currentUser(request, env)) || await db.prepare('SELECT * FROM users WHERE id = 1').first();
  return json(ok(publicUser(user)), 200, headers);
}
async function saveProfile(request, env, headers) {
  const access = await requireUser(request, env, headers);
  if (access.response) return access.response;
  const body = await readJson(request);
  if (!body) return json(fail('参数错误'), 400, headers);
  const profile = cleanProfile(body, access.user);
  if (!profile.nickname) return json(fail('昵称不能为空'), 400, headers);
  let password = access.user.password_hash;
  let tokenVersion = Number(access.user.token_version);
  if (body.password) {
    if (String(body.password).length < 8) return json(fail('密码至少 8 位'), 400, headers);
    password = await passwordHash(String(body.password), Number(env.PBKDF2_ITERATIONS || 210000));
    tokenVersion += 1;
  }
  await env.DB.prepare('UPDATE users SET nickname=?, avatar_url=?, slogan=?, cover_url=?, email=?, password_hash=?, token_version=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')
    .bind(profile.nickname, profile.avatarUrl, profile.slogan, profile.coverUrl, profile.email, password, tokenVersion, access.user.id).run();
  return json(ok({}), 200, headers);
}
async function getConfig(request, env, headers, full = false) {
  if (full) {
    const access = await requireUser(request, env, headers, true);
    if (access.response) return access.response;
  }
  const row = await requireBinding(env, 'DB').prepare('SELECT content FROM sys_config WHERE id = 1').first();
  const config = parseConfig(row?.content);
  if (!full) {
    delete config.googleSecretKey;
    delete config.smtpPassword;
    delete config.s3?.accessKey;
    delete config.s3?.secretKey;
  }
  return json(ok(config), 200, headers);
}
async function saveConfig(request, env, headers) {
  const access = await requireUser(request, env, headers, true);
  if (access.response) return access.response;
  const body = await readJson(request);
  if (!body || typeof body !== 'object') return json(fail('参数错误'), 400, headers);
  const old = await env.DB.prepare('SELECT content FROM sys_config WHERE id = 1').first();
  const config = { ...parseConfig(old?.content), ...body, adminUserName: String(body.adminUserName || access.user.username).trim() };
  delete config.version;
  delete config.commitId;
  await env.DB.batch([
    env.DB.prepare('INSERT INTO sys_config (id, content, updated_at) VALUES (1, ?, CURRENT_TIMESTAMP) ON CONFLICT(id) DO UPDATE SET content=excluded.content, updated_at=CURRENT_TIMESTAMP').bind(JSON.stringify(config)),
    env.DB.prepare('UPDATE users SET username=?, updated_at=CURRENT_TIMESTAMP WHERE id=1').bind(config.adminUserName),
  ]);
  return json(ok({}), 200, headers);
}
async function upload(request, env, headers) {
  const access = await requireUser(request, env, headers);
  if (access.response) return access.response;
  if (!env.MEDIA) return json(fail('R2 存储未配置'), 503, headers);
  const length = Number(request.headers.get('content-length') || 0);
  if (length > MAX_UPLOAD_BYTES) return json(fail('文件不能超过 25MB'), 413, headers);
  let form;
  try { form = await request.formData(); } catch { return json(fail('文件表单错误'), 400, headers); }
  const files = form.getAll('files').filter(value => value instanceof File);
  if (!files.length) return json(fail('没有选择文件'), 400, headers);
  const urls = [];
  for (const file of files) {
    if (!ALLOWED_MEDIA_TYPES.has(file.type)) return json(fail(`不支持的文件类型：${file.type || '未知'}`), 415, headers);
    if (file.size > MAX_UPLOAD_BYTES) return json(fail('文件不能超过 25MB'), 413, headers);
    const extension = file.name.includes('.') ? file.name.split('.').pop().toLowerCase().replace(/[^a-z0-9]/g, '') : '';
    const key = `media/${new Date().toISOString().slice(0, 10).replaceAll('-', '/')}/${randomToken(18)}${extension ? `.${extension}` : ''}`;
    await env.MEDIA.put(key, file.stream(), { httpMetadata: { contentType: file.type }, customMetadata: { ownerId: String(access.user.id), originalFilename: file.name.slice(0, 255) } });
    await env.DB.prepare('INSERT INTO media (owner_id, r2_key, original_filename, content_type, size_bytes) VALUES (?, ?, ?, ?, ?)')
      .bind(access.user.id, key, file.name.slice(0, 255), file.type, file.size).run();
    urls.push(`/upload/${key}`);
  }
  return json(ok(urls), 200, headers);
}

async function handleApi(request, env) {
  const url = new URL(request.url);
  const headers = corsHeaders(request, env);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  try {
    if (url.pathname === '/api/health') return json(ok({ ok: true, service: 'moments-cf', phase: 2, database: Boolean(env.DB), media: Boolean(env.MEDIA) }), 200, headers);
    if (request.method !== 'POST') return json(fail('仅支持 POST'), 405, headers);
    if (url.pathname === '/api/admin/initialize') return initialize(request, env, headers);
    if (url.pathname === '/api/user/login') return login(request, env, headers);
    if (url.pathname === '/api/user/profile') return getProfile(request, env, headers);
    if (url.pathname.startsWith('/api/user/profile/')) return getProfile(request, env, headers, url.pathname.slice('/api/user/profile/'.length));
    if (url.pathname === '/api/user/saveProfile') return saveProfile(request, env, headers);
    if (url.pathname === '/api/sysConfig/get') return getConfig(request, env, headers);
    if (url.pathname === '/api/sysConfig/getFull') return getConfig(request, env, headers, true);
    if (url.pathname === '/api/sysConfig/save') return saveConfig(request, env, headers);
    if (url.pathname === '/api/file/upload') return upload(request, env, headers);
    return json(fail('Cloudflare API migration endpoint not implemented yet', 404), 404, headers);
  } catch (error) {
    console.error('API error', error);
    return json(fail(error instanceof Error ? error.message : '服务异常'), 503, headers);
  }
}

export { passwordHash, passwordMatches, signJwt, verifyJwt };
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) return handleApi(request, env);
    if (url.pathname.startsWith('/upload/')) {
      if (!env.MEDIA) return new Response('R2 binding is not configured', { status: 503 });
      const key = url.pathname.slice('/upload/'.length);
      const object = await env.MEDIA.get(key);
      if (!object) return new Response('Not Found', { status: 404 });
      const headers = new Headers();
      object.writeHttpMetadata(headers);
      headers.set('etag', object.httpEtag);
      headers.set('cache-control', 'public, max-age=31536000, immutable');
      return new Response(object.body, { headers });
    }
    if (url.pathname === '/rss') return new Response('RSS migration is not implemented yet', { status: 501, headers: { 'content-type': 'text/plain; charset=UTF-8' } });
    if (!env.ASSETS) return new Response('Workers Assets binding is not configured', { status: 503 });
    return env.ASSETS.fetch(request);
  },
};
