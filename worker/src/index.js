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
const DEFAULT_PBKDF2_ITERATIONS = 100000;
const MAX_PBKDF2_ITERATIONS = 100000;

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
function pbkdf2Iterations(value = DEFAULT_PBKDF2_ITERATIONS) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 10000 || parsed > MAX_PBKDF2_ITERATIONS) {
    return DEFAULT_PBKDF2_ITERATIONS;
  }
  return parsed;
}
async function passwordHash(password, iterations = DEFAULT_PBKDF2_ITERATIONS) {
  iterations = pbkdf2Iterations(iterations);
  const salt = randomToken(16);
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: encoder.encode(salt), iterations }, key, 256);
  return `pbkdf2-sha256$${iterations}$${salt}$${base64url(bits)}`;
}
async function passwordMatches(password, stored) {
  const [scheme, iterations, salt, expected] = String(stored || '').split('$');
  if (scheme !== 'pbkdf2-sha256' || !iterations || !salt || !expected) return false;
  const safeIterations = Number(iterations);
  if (!Number.isInteger(safeIterations) || safeIterations < 10000 || safeIterations > MAX_PBKDF2_ITERATIONS) return false;
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: encoder.encode(salt), iterations: safeIterations }, key, 256);
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
  const hash = await passwordHash(String(body.password), pbkdf2Iterations(env.PBKDF2_ITERATIONS));
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
    password = await passwordHash(String(body.password), pbkdf2Iterations(env.PBKDF2_ITERATIONS));
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


function sqliteTime(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 19).replace('T', ' ');
}
function intParam(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : fallback;
}
function tagsString(tags) {
  if (!Array.isArray(tags)) return '';
  const unique = [...new Set(tags.map(tag => String(tag).trim().replaceAll(',', '').slice(0, 40)).filter(Boolean))];
  return unique.length ? `${unique.join(',')},` : '';
}
function imgConfigs(imgs) {
  return String(imgs || '').split(',').filter(Boolean).map(url => ({ url, thumbUrl: url }));
}
function memoView(row) {
  if (!row) return null;
  return {
    id: Number(row.id), content: row.content, imgs: row.imgs, favCount: Number(row.fav_count),
    commentCount: Number(row.comment_count), userId: Number(row.user_id), createdAt: row.created_at,
    updatedAt: row.updated_at, location: row.location, externalUrl: row.external_url,
    externalTitle: row.external_title, externalFavicon: row.external_favicon, pinned: Boolean(row.pinned),
    ext: row.ext, showType: Number(row.show_type), tags: row.tags, imgConfigs: imgConfigs(row.imgs),
    comments: [], user: {
      id: Number(row.user_id), username: row.username, nickname: row.nickname,
      avatarUrl: row.avatar_url, slogan: row.slogan, coverUrl: row.cover_url,
    },
  };
}
const MEMO_SELECT = `SELECT m.*, u.username, u.nickname, u.avatar_url, u.slogan, u.cover_url
  FROM memos m JOIN users u ON u.id=m.user_id`;
function requestIdentity(request) {
  const match = request.headers.get('cookie')?.match(/(?:^|;\s*)moments_like_id=([^;]+)/);
  return match?.[1] || null;
}
async function likeIdentity(request, env) {
  let identity = requestIdentity(request);
  const headers = new Headers();
  if (!identity) {
    identity = randomToken(24);
    headers.append('set-cookie', `moments_like_id=${identity}; Path=/; Max-Age=31536000; HttpOnly; Secure; SameSite=Lax`);
  }
  const secret = env.LIKE_SALT || env.JWT_SECRET;
  if (!secret) throw new Error('服务端未配置 JWT_SECRET');
  return { hash: base64url(await hmac(secret, identity)), headers };
}
async function canReadMemo(memo, user) {
  if (!memo) return false;
  if (Number(memo.show_type) === 1 && Date.parse(memo.created_at) <= Date.now()) return true;
  return Boolean(user && Number(user.id) === Number(memo.user_id));
}
async function listMemos(request, env, headers) {
  const body = (await readJson(request)) || {};
  const page = Math.max(1, intParam(body.page, 1));
  const size = Math.min(50, Math.max(1, intParam(body.size, 10)));
  const user = await currentUser(request, env);
  const clauses = [];
  const values = [];
  if (user) {
    clauses.push('(m.user_id = ? OR (m.show_type = 1 AND m.created_at <= CURRENT_TIMESTAMP))');
    values.push(user.id);
  } else {
    clauses.push('m.show_type = 1 AND m.created_at <= CURRENT_TIMESTAMP');
  }
  if (body.username) { clauses.push('u.username = ?'); values.push(String(body.username)); }
  if (body.userId != null) { clauses.push('m.user_id = ?'); values.push(intParam(body.userId)); }
  if (body.tag) {
    for (const tag of String(body.tag).split(',').map(v => v.trim()).filter(Boolean)) { clauses.push('m.tags LIKE ?'); values.push(`%${tag},%`); }
  }
  if (body.contentContains) { clauses.push('m.content LIKE ?'); values.push(`%${String(body.contentContains).slice(0, 200)}%`); }
  if (body.start) { clauses.push('m.created_at >= ?'); values.push(String(body.start)); }
  if (body.end) { clauses.push('m.created_at <= ?'); values.push(String(body.end)); }
  if (user && body.showType != null && Number(body.showType) >= 0) { clauses.push('m.show_type = ?'); values.push(intParam(body.showType)); }
  const where = ` WHERE ${clauses.join(' AND ')}`;
  const count = await env.DB.prepare(`SELECT COUNT(*) AS total FROM memos m JOIN users u ON u.id=m.user_id${where}`).bind(...values).first();
  const result = await env.DB.prepare(`${MEMO_SELECT}${where} ORDER BY m.pinned DESC, m.created_at DESC LIMIT ? OFFSET ?`).bind(...values, size, (page - 1) * size).all();
  const total = Number(count?.total || 0);
  return json(ok({ list: (result.results || []).map(memoView), total, hasNext: page * size < total }), 200, headers);
}
async function getMemo(request, env, headers) {
  const url = new URL(request.url);
  const id = intParam(url.searchParams.get('id'));
  if (!id) return json(fail('参数错误'), 400, headers);
  const memo = await env.DB.prepare(`${MEMO_SELECT} WHERE m.id = ?`).bind(id).first();
  if (!memo) return json(fail('动态不存在'), 404, headers);
  if (!(await canReadMemo(memo, await currentUser(request, env)))) return json(fail('暂无权限查看'), 403, headers);
  return json(ok(memoView(memo)), 200, headers);
}
async function verifyMemoMedia(imgs, user, env) {
  for (const url of imgs) {
    if (!url.startsWith('/upload/media/')) continue;
    const key = url.slice('/upload/'.length);
    const media = await env.DB.prepare('SELECT owner_id FROM media WHERE r2_key = ?').bind(key).first();
    if (!media || Number(media.owner_id) !== Number(user.id)) throw new Error('图片不属于当前用户');
  }
}
async function saveMemo(request, env, headers) {
  const access = await requireUser(request, env, headers);
  if (access.response) return access.response;
  const body = await readJson(request);
  if (!body || typeof body !== 'object') return json(fail('参数错误'), 400, headers);
  const content = String(body.content || '').trim();
  const imgs = Array.isArray(body.imgs) ? body.imgs.map(v => String(v).trim()).filter(Boolean).slice(0, 9) : [];
  if (!content && !imgs.length && !body.externalUrl && !body.ext?.video?.value) return json(fail('动态内容不能为空'), 400, headers);
  if (content.length > 10000) return json(fail('动态内容不能超过 10000 字'), 400, headers);
  try { await verifyMemoMedia(imgs, access.user, env); } catch (error) { return json(fail(error.message), 403, headers); }
  const id = intParam(body.id);
  const pinned = body.pinned ? 1 : 0;
  const showType = Number(body.showType) === 0 ? 0 : 1;
  const createdAt = sqliteTime(body.createdAt || new Date());
  const ext = JSON.stringify(body.ext && typeof body.ext === 'object' ? body.ext : {});
  const values = [content, imgs.join(','), String(body.location || '').slice(0, 200), String(body.externalUrl || '').slice(0, 2048), String(body.externalTitle || '').slice(0, 300), String(body.externalFavicon || '/favicon.png').slice(0, 2048), pinned, ext, showType, tagsString(body.tags)];
  if (id) {
    const existing = await env.DB.prepare('SELECT * FROM memos WHERE id=?').bind(id).first();
    if (!existing) return json(fail('动态不存在'), 404, headers);
    if (Number(existing.user_id) !== Number(access.user.id)) return json(fail('没有权限'), 403, headers);
    await env.DB.prepare('UPDATE memos SET content=?, imgs=?, location=?, external_url=?, external_title=?, external_favicon=?, pinned=?, ext=?, show_type=?, tags=?, created_at=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')
      .bind(...values, createdAt, id).run();
  } else {
    await env.DB.prepare('INSERT INTO memos (content, imgs, location, external_url, external_title, external_favicon, pinned, ext, show_type, tags, user_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)')
      .bind(...values, access.user.id, createdAt).run();
  }
  return json(ok({}), 200, headers);
}
async function removeMemo(request, env, headers) {
  const access = await requireUser(request, env, headers);
  if (access.response) return access.response;
  const id = intParam(new URL(request.url).searchParams.get('id'));
  const memo = await env.DB.prepare('SELECT * FROM memos WHERE id=?').bind(id).first();
  if (!memo) return json(fail('动态不存在'), 404, headers);
  if (Number(memo.user_id) !== Number(access.user.id) && Number(access.user.id) !== 1) return json(fail('没有权限'), 403, headers);
  await env.DB.prepare('DELETE FROM memos WHERE id=?').bind(id).run();
  return json(ok({}), 200, headers);
}
async function setPinned(request, env, headers) {
  const access = await requireUser(request, env, headers, true);
  if (access.response) return access.response;
  const id = intParam(new URL(request.url).searchParams.get('id'));
  const memo = await env.DB.prepare('SELECT id, pinned FROM memos WHERE id=?').bind(id).first();
  if (!memo) return json(fail('动态不存在'), 404, headers);
  await env.DB.batch([
    env.DB.prepare('UPDATE memos SET pinned=0 WHERE pinned=1'),
    env.DB.prepare('UPDATE memos SET pinned=? WHERE id=?').bind(Number(memo.pinned) ? 0 : 1, id),
  ]);
  return json(ok({}), 200, headers);
}
async function likeMemo(request, env, headers) {
  const id = intParam(new URL(request.url).searchParams.get('id'));
  const memo = await env.DB.prepare('SELECT id, show_type, created_at FROM memos WHERE id=?').bind(id).first();
  if (!memo || Number(memo.show_type) !== 1 || Date.parse(memo.created_at) > Date.now()) return json(fail('动态不存在或不可点赞'), 404, headers);
  const identity = await likeIdentity(request, env);
  const result = await env.DB.prepare('INSERT OR IGNORE INTO memo_likes (memo_id, identity_hash) VALUES (?, ?)').bind(id, identity.hash).run();
  if (Number(result.meta?.changes || 0) === 0) return json(fail('您已经点赞过了'), 409, { ...headers, ...Object.fromEntries(identity.headers) });
  await env.DB.prepare('UPDATE memos SET fav_count=fav_count+1, updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(id).run();
  return json(ok({}), 200, { ...headers, ...Object.fromEntries(identity.headers) });
}
async function listTags(request, env, headers) {
  const access = await requireUser(request, env, headers);
  if (access.response) return access.response;
  const rows = await env.DB.prepare('SELECT tags FROM memos WHERE user_id=? AND tags<>\'\'').bind(access.user.id).all();
  const tags = [...new Set((rows.results || []).flatMap(row => String(row.tags).split(',').filter(Boolean)))].sort((a, b) => a.localeCompare(b, 'zh-CN'));
  return json(ok({ tags }), 200, headers);
}
function escapeXml(value) { return String(value || '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;'); }
function rssText(value) { return String(value || '').replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/[>#*_`~-]/g, '').trim(); }
async function rss(request, env) {
  if (!env.DB) return new Response('D1 binding is not configured', { status: 503 });
  const url = new URL(request.url);
  const configRow = await env.DB.prepare('SELECT content FROM sys_config WHERE id=1').first();
  const config = parseConfig(configRow?.content);
  if (config.rss) return Response.redirect(config.rss, 302);
  const admin = await env.DB.prepare('SELECT * FROM users WHERE id=1').first();
  const rows = await env.DB.prepare(`${MEMO_SELECT} WHERE m.show_type=1 AND m.created_at<=CURRENT_TIMESTAMP ORDER BY m.created_at DESC LIMIT 15`).all();
  const host = url.origin;
  const items = (rows.results || []).map(row => {
    const memo = memoView(row);
    const titleBase = rssText(memo.content).split('\n')[0] || `Memo #${memo.id}`;
    const title = `${memo.tags ? memo.tags.split(',').filter(Boolean).map(tag => `[${tag}]`).join('') : ''}${titleBase.slice(0, 20)}${titleBase.length > 20 ? '...' : ''}`;
    const media = memo.imgs.split(',').filter(Boolean).map(image => `<p><img src="${escapeXml(image.startsWith('/') ? host + image : image)}" /></p>`).join('');
    return `<item><guid>${host}/memo/${memo.id}</guid><title>${escapeXml(title)}</title><link>${host}/memo/${memo.id}</link><description><![CDATA[${rssText(memo.content)}${media}]]></description><pubDate>${new Date(memo.createdAt).toUTCString()}</pubDate></item>`;
  }).join('');
  const feed = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>${escapeXml(config.title)}</title><link>${host}</link><description>${escapeXml(admin?.slogan || '')}</description><lastBuildDate>${new Date().toUTCString()}</lastBuildDate>${items}</channel></rss>`;
  return new Response(feed, { headers: { 'content-type': 'application/rss+xml; charset=UTF-8', 'cache-control': 'public, max-age=300' } });
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
    if (url.pathname === '/api/memo/list') return listMemos(request, env, headers);
    if (url.pathname === '/api/memo/get') return getMemo(request, env, headers);
    if (url.pathname === '/api/memo/save') return saveMemo(request, env, headers);
    if (url.pathname === '/api/memo/remove') return removeMemo(request, env, headers);
    if (url.pathname === '/api/memo/setPinned') return setPinned(request, env, headers);
    if (url.pathname === '/api/memo/like') return likeMemo(request, env, headers);
    if (url.pathname === '/api/tag/list') return listTags(request, env, headers);
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
    if (url.pathname === '/rss') return rss(request, env);
    if (!env.ASSETS) return new Response('Workers Assets binding is not configured', { status: 503 });
    return env.ASSETS.fetch(request);
  },
};
