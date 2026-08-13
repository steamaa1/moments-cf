import {
  sanitizeSafeHtml, createR2PresignedPut, validateDirectUpload, buildCommentEmail,
  sendNotification, createD1Backup, listBackups, restoreD1Backup, renderRssDescription,
  encryptConfigSecret, decryptConfigSecret, BACKUP_PREFIX,
  startD1Export, pollD1Export, storeD1Backup, sendTelegram,
} from './phase7.js';
import { storageBackend, r2Backend } from './storage.js';
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
  googleSecretKey: '',
  enableTurnstile: false,
  turnstileSiteKey: '',
  turnstileSecretKey: '',
  enableAbout: false,
  aboutContent: '',
  friendNotice: '感谢您对本站的关注！友情链接申请须知：\n\n1. 请先在贵站添加本站链接\n2. 本站仅收录原创、内容健康、定期更新的网站\n3. 申请时请提供：站点名称、网址、一句话简介、常用邮箱\n4. 审核通过后将在“友情链接”页面展示\n5. 本站保留审核与移除的权利',
  friendEmail: '',
  enableComment: true,
  maxCommentLength: 300,
  memoMaxHeight: 0,
  commentOrder: 'desc',
  timeFormat: 'timeAgo',
  enableRegister: false,
  seoDescription: '',
  seoKeywords: '',
  backupIntervalDays: 7,
  backupRetentionDays: 90,
  enableD1Backup: true,
  enableTelegram: false,
  telegramBotUsername: '',
  telegramBotTokenEncrypted: '',
  storageType: 'r2',
  backupTarget: 'r2',
  s3Storage: { endpoint: '', region: 'auto', bucket: '', accessKeyId: '', secretAccessKeyEncrypted: '' },
  webdavStorage: { url: '', username: '', passwordEncrypted: '' },
  enableEmail: false,
  smtpHost: '',
  smtpPort: '465',
  smtpUsername: '',
  smtpPasswordEncrypted: '',
  s3: { thumbnailSuffix: '' },
};
const BUILTIN_STATUSES = [
  { group: '心情想法', items: [{ icon: '😄', content: '美滋滋' }, { icon: '😞', content: '郁闷' }, { icon: '😴', content: '数羊' }, { icon: '😶', content: '发呆' }, { icon: '🤔', content: '胡思乱想' }, { icon: '🦲', content: '头秃' }, { icon: '😪', content: '疲惫' }, { icon: '💔', content: '裂开' }, { icon: '🌤️', content: '等天晴' }, { icon: '⚡', content: '冲' }, { icon: '🧊', content: '融化' }] },
  { group: '工作学习', items: [{ icon: '💼', content: '忙' }, { icon: '🐟', content: '摸鱼' }, { icon: '🧱', content: '搬砖' }, { icon: '✈️', content: '出差' }, { icon: '📚', content: '沉迷学习' }, { icon: '🏃', content: '飞奔回家' }, { icon: '💻', content: '写代码' }] },
  { group: '活动', items: [{ icon: '📝', content: '打卡' }, { icon: '🍽️', content: '聚餐' }, { icon: '☕', content: '喝咖啡' }, { icon: '🍻', content: '喝酒' }, { icon: '🏋️', content: '运动' }, { icon: '🛍️', content: '买买买' }, { icon: '🧋', content: '喝奶茶' }, { icon: '🍚', content: '干饭' }, { icon: '👶', content: '带娃' }, { icon: '🦸', content: '拯救世界' }, { icon: '🌊', content: '浪' }] },
  { group: '休息', items: [{ icon: '🎧', content: '听歌' }, { icon: '📺', content: '追剧' }, { icon: '🍉', content: '吃瓜' }, { icon: '🎮', content: '玩游戏' }, { icon: '📱', content: '看直播' }, { icon: '😴', content: '睡觉' }, { icon: '🧘', content: '闭关' }, { icon: '🏠', content: '宅' }] },
];
const ALLOWED_MEDIA_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/x-icon',
  'audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/flac', 'audio/mp4',
  'video/mp4', 'video/webm', 'video/quicktime',
]);
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
const DIRECT_UPLOAD_THRESHOLD = 20 * 1024 * 1024;
const TRASH_RETENTION_DAYS = 7;
const PUBLIC_CONFIG_KEYS = [
  'enableAutoLoadNextPage', 'favicon', 'title', 'beiAnNo', 'css', 'js', 'rss',
  'enableGoogleRecaptcha', 'googleSiteKey', 'enableTurnstile', 'turnstileSiteKey', 'enableAbout', 'aboutContent', 'enableComment', 'maxCommentLength', 'telegramBotUsername', 'friendNotice', 'friendEmail',
  'memoMaxHeight', 'commentOrder', 'timeFormat', 'enableRegister', 'seoDescription', 'seoKeywords',
];
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
function publicUser(user, includeEmail = false) {
  if (!user) return null;
  const result = {
    id: Number(user.id), username: user.username, nickname: user.nickname,
    avatarUrl: user.avatar_url, slogan: user.slogan, coverUrl: user.cover_url,
  };
  if (includeEmail) result.email = user.email;
  return result;
}
function parseConfig(value) {
  try { return { ...DEFAULT_CONFIG, ...(value ? JSON.parse(value) : {}) }; } catch { return { ...DEFAULT_CONFIG }; }
}
function publicConfig(config) {
  return Object.fromEntries(PUBLIC_CONFIG_KEYS.map(key => [key, config[key]]));
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
    telegramChatId: String(input.telegramChatId ?? existing.telegram_chat_id ?? '').trim().replace(/\D/g, '').slice(0, 30),
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
  const username = String(body.username).trim();
  const clientIp = String(request.headers.get('cf-connecting-ip') || '').trim();
  const networkHash = clientIp ? base64url(await hmac(env.JWT_SECRET, `login-network:${clientIp}`)) : '';
  const usernameHash = base64url(await hmac(env.JWT_SECRET, `login-username:${username.toLowerCase()}`));
  if (networkHash) {
    const recent = await db.prepare("SELECT COUNT(*) AS total FROM login_attempts WHERE network_hash=? AND username_hash=? AND created_at >= datetime('now', '-10 minutes')").bind(networkHash, usernameHash).first();
    if (Number(recent?.total || 0) >= 10) return json(fail('登录尝试过于频繁，请稍后再试'), 429, headers);
  }
  const user = await db.prepare('SELECT * FROM users WHERE username = ?').bind(username).first();
  if (!user || !(await passwordMatches(String(body.password), user.password_hash))) {
    if (networkHash) await db.prepare('INSERT INTO login_attempts (network_hash, username_hash) VALUES (?, ?)').bind(networkHash, usernameHash).run();
    return json(fail('用户不存在或密码不正确'), 401, headers);
  }
  if (networkHash) await db.prepare('DELETE FROM login_attempts WHERE network_hash=? AND username_hash=?').bind(networkHash, usernameHash).run();
  const now = Math.floor(Date.now() / 1000);
  const token = await signJwt({ sub: String(user.id), username: user.username, tv: Number(user.token_version), iat: now, exp: now + 60 * 60 * 24 * 14 }, env.JWT_SECRET);
  return json(ok({ token, username: user.username, id: Number(user.id) }), 200, headers);
}
async function getProfile(request, env, headers, username = null) {
  const db = requireBinding(env, 'DB');
  let user;
  let includeEmail = false;
  if (username) {
    user = await db.prepare('SELECT * FROM users WHERE username = ?').bind(decodeURIComponent(username)).first();
  } else {
    const me = await currentUser(request, env);
    if (me) { user = me; includeEmail = true; }
    else user = await db.prepare('SELECT * FROM users WHERE id = 1').first();
  }
  const view = publicUser(user, includeEmail);
  if (view && env.DB) {
    view.status = await userStatusView(env, user.id);
    if (includeEmail) view.telegramChatId = user.telegram_chat_id || '';
  }
  return json(ok(view), 200, headers);
}
async function getProfileById(request, env, headers) {
  const id = intParam(new URL(request.url).searchParams.get('id'));
  if (id < 1) return json(fail('用户 ID 无效'), 400, headers);
  const user = await requireBinding(env, 'DB').prepare('SELECT * FROM users WHERE id = ?').bind(id).first();
  const view = publicUser(user, false);
  if (!view) return json(fail('用户不存在'), 404, headers);
  view.status = await userStatusView(env, user.id);
  return json(ok(view), 200, headers);
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
  await env.DB.prepare('UPDATE users SET nickname=?, avatar_url=?, slogan=?, cover_url=?, email=?, telegram_chat_id=?, password_hash=?, token_version=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')
    .bind(profile.nickname, profile.avatarUrl, profile.slogan, profile.coverUrl, profile.email, profile.telegramChatId, password, tokenVersion, access.user.id).run();
  return json(ok({}), 200, headers);
}
async function getConfig(request, env, headers, full = false) {
  if (full) {
    const access = await requireUser(request, env, headers, true);
    if (access.response) return access.response;
  }
  const row = await requireBinding(env, 'DB').prepare('SELECT content FROM sys_config WHERE id = 1').first();
  const config = parseConfig(row?.content);
  // Cloudflare edition always uses the authenticated /api/file/upload -> R2 path.
  // Never let legacy S3 settings switch the frontend to an unsupported pre-signed endpoint.
  config.enableS3 = false;
  config.beiAnNo = sanitizeSafeHtml(config.beiAnNo);
  if (full) {
    delete config.enableS3;
    delete config.s3;
    const s3Raw = config.s3Storage || {};
    const davRaw = config.webdavStorage || {};
    config.s3Storage = { endpoint: s3Raw.endpoint || '', region: s3Raw.region || 'auto', bucket: s3Raw.bucket || '', accessKeyId: s3Raw.accessKeyId || '', secretAccessKeyConfigured: Boolean(s3Raw.secretAccessKeyEncrypted), secretAccessKey: '' };
    config.webdavStorage = { url: davRaw.url || '', username: davRaw.username || '', passwordConfigured: Boolean(davRaw.passwordEncrypted), password: '' };
    config.telegramBotTokenConfigured = Boolean(config.telegramBotTokenEncrypted);
    delete config.telegramBotTokenEncrypted;
    config.smtpPasswordConfigured = Boolean(config.smtpPasswordEncrypted || env.SMTP_PASSWORD || env.RESEND_API_KEY);
    config.smtpPassword = '';
    config.googleSecretKeyConfigured = Boolean(config.googleSecretKey);
    config.turnstileSecretKeyConfigured = Boolean(config.turnstileSecretKey);
    config.googleSecretKey = '';
    config.turnstileSecretKey = '';
    delete config.smtpPasswordEncrypted;
  }
  return json(ok(full ? config : publicConfig(config)), 200, headers);
}
async function saveConfig(request, env, headers) {
  const access = await requireUser(request, env, headers, true);
  if (access.response) return access.response;
  const body = await readJson(request);
  if (!body || typeof body !== 'object') return json(fail('参数错误'), 400, headers);
  const old = await env.DB.prepare('SELECT content FROM sys_config WHERE id = 1').first();
  const previousConfig = parseConfig(old?.content);
  const adminUserName = String(body.adminUserName || '').trim() || access.user.username;
  const config = { ...previousConfig, ...body, adminUserName };
  config.beiAnNo = sanitizeSafeHtml(body.beiAnNo);
  config.enableAbout = Boolean(body.enableAbout);
  config.friendNotice = String(body.friendNotice || '').slice(0, 10000);
  config.friendEmail = String(body.friendEmail || '').trim().slice(0, 254);
  config.aboutContent = String(body.aboutContent || '').slice(0, 100000);
  config.enableEmail = Boolean(body.enableEmail);
  config.smtpHost = String(body.smtpHost || '').trim().slice(0, 253);
  config.smtpPort = ['465', '587'].includes(String(body.smtpPort)) ? String(body.smtpPort) : '465';
  config.smtpUsername = String(body.smtpUsername || '').trim().slice(0, 254);
  config.googleSecretKey = String(body.googleSecretKey || previousConfig.googleSecretKey || '').trim().slice(0, 300);
  config.enableTurnstile = Boolean(body.enableTurnstile);
  config.turnstileSiteKey = String(body.turnstileSiteKey || '').trim().slice(0, 200);
  config.turnstileSecretKey = String(body.turnstileSecretKey || previousConfig.turnstileSecretKey || '').trim().slice(0, 300);
  config.seoDescription = String(body.seoDescription || '').trim().slice(0, 300);
  config.seoKeywords = String(body.seoKeywords || '').trim().slice(0, 500);
  config.enableD1Backup = body.enableD1Backup !== false;
  config.enableTelegram = body.enableTelegram === true;
  config.telegramBotUsername = String(body.telegramBotUsername || '').trim().replace(/^@/, '').slice(0, 64);
  const telegramBotToken = String(body.telegramBotToken || '').trim();
  if (telegramBotToken) config.telegramBotTokenEncrypted = await encryptConfigSecret(telegramBotToken, env.JWT_SECRET);
  else config.telegramBotTokenEncrypted = previousConfig.telegramBotTokenEncrypted || '';
  config.backupIntervalDays = clampInt(body.backupIntervalDays, 1, 365, 7);
  config.backupRetentionDays = clampInt(body.backupRetentionDays, 1, 3650, 90);
  config.storageType = ['r2', 's3', 'webdav'].includes(body.storageType) ? body.storageType : 'r2';
  const s3Prev = previousConfig.s3Storage || {};
  const s3Input = body.s3Storage || {};
  config.s3Storage = {
    endpoint: String(s3Input.endpoint ?? s3Prev.endpoint ?? '').trim().slice(0, 500),
    region: String(s3Input.region ?? s3Prev.region ?? 'auto').trim().slice(0, 100) || 'auto',
    bucket: String(s3Input.bucket ?? s3Prev.bucket ?? '').trim().slice(0, 200),
    accessKeyId: String(s3Input.accessKeyId ?? s3Prev.accessKeyId ?? '').trim().slice(0, 200),
    secretAccessKeyEncrypted: s3Input.secretAccessKey ? await encryptConfigSecret(String(s3Input.secretAccessKey).trim(), env.JWT_SECRET) : (s3Prev.secretAccessKeyEncrypted || ''),
  };
  const davPrev = previousConfig.webdavStorage || {};
  const davInput = body.webdavStorage || {};
  config.webdavStorage = {
    url: String(davInput.url ?? davPrev.url ?? '').trim().slice(0, 500),
    username: String(davInput.username ?? davPrev.username ?? '').trim().slice(0, 200),
    passwordEncrypted: davInput.password ? await encryptConfigSecret(String(davInput.password).trim(), env.JWT_SECRET) : (davPrev.passwordEncrypted || ''),
  };
  const storageTypes = ['r2', 's3', 'webdav'];
  const targetCandidates = ['r2'];
  if (config.s3Storage.endpoint && config.s3Storage.bucket && config.s3Storage.accessKeyId && config.s3Storage.secretAccessKeyEncrypted) targetCandidates.push('s3');
  if (config.webdavStorage.url) targetCandidates.push('webdav');
  config.backupTarget = storageTypes.includes(body.backupTarget) && targetCandidates.includes(body.backupTarget) ? body.backupTarget : 'r2';
  config.smtpPasswordEncrypted = previousConfig.smtpPasswordEncrypted || '';
  const mailSecret = String(body.smtpPassword || '');
  if (mailSecret) config.smtpPasswordEncrypted = await encryptConfigSecret(mailSecret, env.JWT_SECRET);
  delete config.smtpPassword;
  delete config.smtpPasswordConfigured;
  delete config.googleSecretKeyConfigured;
  delete config.turnstileSecretKeyConfigured;
  delete config.emailFrom;
  delete config.version;
  delete config.commitId;
  // Unsupported legacy credentials must never be persisted by the Cloudflare edition.
  config.enableS3 = false;
  config.s3 = { thumbnailSuffix: '' };
  delete config.smtpPassword;
  await env.DB.batch([
    env.DB.prepare('INSERT INTO sys_config (id, content, updated_at) VALUES (1, ?, CURRENT_TIMESTAMP) ON CONFLICT(id) DO UPDATE SET content=excluded.content, updated_at=CURRENT_TIMESTAMP').bind(JSON.stringify(config)),
    env.DB.prepare('UPDATE users SET username=?, updated_at=CURRENT_TIMESTAMP WHERE id=1').bind(config.adminUserName),
  ]);
  return json(ok({}), 200, headers);
}
async function upload(request, env, headers) {
  const access = await requireUser(request, env, headers);
  if (access.response) return access.response;
  const storageConfig = await loadStorageConfig(env);
  if (storageConfig.storageType === 'r2' && !env.MEDIA) return json(fail('R2 存储未配置'), 503, headers);
  const length = Number(request.headers.get('content-length') || 0);
  if (length > MAX_UPLOAD_BYTES) return json(fail('文件不能超过 25MB'), 413, headers);
  let form;
  try { form = await request.formData(); } catch { return json(fail('文件表单错误'), 400, headers); }
  const files = form.getAll('files').filter(value => value instanceof File);
  if (!files.length) return json(fail('没有选择文件'), 400, headers);
  const hashes = form.getAll('sha256').map(value => String(value).toLowerCase());
  const urls = [];
  for (let index = 0; index < files.length; index += 1) {
    const file = files[index]; const sha = hashes[index] || '';
    if (!ALLOWED_MEDIA_TYPES.has(file.type)) return json(fail(`不支持的文件类型：${file.type || '未知'}`), 415, headers);
    if (file.size > MAX_UPLOAD_BYTES) return json(fail('文件不能超过 25MB'), 413, headers);
    if (!/^[a-f0-9]{64}$/.test(sha)) return json(fail('SHA-256 格式错误'), 400, headers);
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', await file.arrayBuffer()));
    const actualSha = [...digest].map(value => value.toString(16).padStart(2, '0')).join('');
    if (actualSha !== sha) return json(fail('SHA-256 与文件内容不一致'), 400, headers);
    const duplicate = await env.DB.prepare("SELECT r2_key FROM media WHERE owner_id=? AND sha256=? AND trashed_at IS NULL AND upload_state='ready' LIMIT 1").bind(access.user.id, sha).first();
    if (duplicate) { urls.push(`/upload/${duplicate.r2_key}`); continue; }
    const extension = mediaExtension(file.name);
    const key = mediaObjectKey(extension);
    const thumbnailCandidate = form.get(`thumbnail_${index}`);
    const thumbnail = file.type.startsWith('image/') && thumbnailCandidate instanceof File ? thumbnailCandidate : null;
    const thumbnailKey = thumbnail ? mediaThumbKey() : null;
    try {
      const backend = storageBackend(env, storageConfig, storageConfig.storageType);
      await backend.put(key, file.stream(), { httpMetadata: { contentType: file.type } });
      if (thumbnail) await backend.put(thumbnailKey, thumbnail.stream(), { httpMetadata: { contentType: 'image/webp' } });
      await env.DB.prepare("INSERT INTO media (owner_id, r2_key, original_filename, content_type, size_bytes, sha256, thumbnail_key, upload_state, storage_backend) VALUES (?, ?, ?, ?, ?, ?, ?, 'ready', ?)")
        .bind(access.user.id, key, file.name.slice(0, 255), file.type, file.size, sha, thumbnailKey, storageConfig.storageType).run();
    } catch (error) {
      const backend = storageBackend(env, storageConfig, storageConfig.storageType);
      await Promise.all([backend.delete(key).catch(() => {}), thumbnailKey ? backend.delete(thumbnailKey).catch(() => {}) : Promise.resolve()]);
      throw error;
    }
    urls.push(`/upload/${key}`);
  }
  return json(ok(urls), 200, headers);
}


function sqliteTime(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 19).replace('T', ' ');
}

async function register(request, env, headers) {
  const body = await readJson(request);
  const config = parseConfig((await env.DB.prepare('SELECT content FROM sys_config WHERE id=1').first())?.content);
  if (!config.enableRegister) return json(fail('当前未开启注册用户'), 403, headers);
  const username = String(body?.username || '').trim();
  const password = String(body?.password || '');
  if (username.length < 3 || username.length > 40 || !/^[A-Za-z0-9_-]+$/.test(username)) return json(fail('用户名须为 3-40 位字母、数字、下划线或连字符'), 400, headers);
  if (password.length < 8) return json(fail('密码至少 8 位'), 400, headers);
  if (password !== String(body?.repeatPassword || '')) return json(fail('两次密码不一致'), 400, headers);
  if (await env.DB.prepare('SELECT id FROM users WHERE username=?').bind(username).first()) return json(fail('用户名已存在'), 409, headers);
  const hash = await passwordHash(password, pbkdf2Iterations(env.PBKDF2_ITERATIONS));
  await env.DB.prepare('INSERT INTO users (username, nickname, password_hash, slogan) VALUES (?, ?, ?, ?)')
    .bind(username, username, hash, '记录生活的每一个瞬间。').run();
  return json(ok({}), 201, headers);
}
async function fileExists(request, env, headers) {
  const access = await requireUser(request, env, headers);
  if (access.response) return access.response;
  const url = new URL(request.url);
  const sha = String(url.searchParams.get('sha256') || url.searchParams.get('filename') || '').toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(sha)) return json(fail('sha256 格式错误'), 400, headers);
  const row = await env.DB.prepare("SELECT r2_key, thumbnail_key FROM media WHERE owner_id=? AND sha256=? AND trashed_at IS NULL AND upload_state='ready' LIMIT 1").bind(access.user.id, sha).first();
  return json(ok({ exist: Boolean(row), path: row ? `/upload/${row.r2_key}` : '', thumbPath: row?.thumbnail_key ? `/upload/${row.thumbnail_key}` : '' }), 200, headers);
}
function mediaExtension(filename) { return filename.includes('.') ? filename.split('.').pop().toLowerCase().replace(/[^a-z0-9]/g, '') : ''; }
function mediaContentType(key) {
  const map = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', mp3: 'audio/mpeg', ogg: 'audio/ogg', wav: 'audio/wav', flac: 'audio/flac', m4a: 'audio/mp4' };
  return map[mediaExtension(key)] || '';
}
// 随机短 id 命名（约 14 字符），替代长 SHA-256 文件名；旧 SHA 命名的对象仍按 DB 索引访问
function mediaObjectKey(extension = '') {
  return `media/${new Date().toISOString().slice(0, 10).replaceAll('-', '/')}/${randomToken(10)}${extension ? `.${extension}` : ''}`;
}
function mediaThumbKey() { return `thumbs/${randomToken(10)}.webp`; }
async function directUploadInit(request, env, headers) {
  const access = await requireUser(request, env, headers); if (access.response) return access.response;
  const body = await readJson(request); let file;
  try { file = validateDirectUpload(body, ALLOWED_MEDIA_TYPES); } catch (error) { return json(fail(error.message), 400, headers); }
  const duplicate = await env.DB.prepare("SELECT r2_key, thumbnail_key FROM media WHERE owner_id=? AND sha256=? AND trashed_at IS NULL AND upload_state='ready' LIMIT 1").bind(access.user.id, file.sha256).first();
  if (duplicate) return json(ok({ exists: true, path: `/upload/${duplicate.r2_key}`, thumbPath: duplicate.thumbnail_key ? `/upload/${duplicate.thumbnail_key}` : '' }), 200, headers);
  const storageConfig = await loadStorageConfig(env);
  const backend = storageBackend(env, storageConfig, storageConfig.storageType);
  if (storageConfig.storageType === 'webdav') return json(fail('WebDAV 存储不支持大文件直传，请使用 25MB 以内的文件直接上传'), 400, headers);
  const signing = storageConfig.storageType === 's3' ? { ...storageConfig.s3Storage, bucket: storageConfig.s3Storage.bucket } : { accountId: env.CLOUDFLARE_ACCOUNT_ID, bucket: env.R2_BUCKET_NAME || 'moments-media', accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY };
  if (!signing.accessKeyId || !signing.secretAccessKey || (storageConfig.storageType === 'r2' && !signing.accountId)) return json(fail('直传凭据未配置，请在 Worker Secrets 设置对应 Access Key'), 503, headers);
  const extension = mediaExtension(file.filename);
  const key = mediaObjectKey(extension);
  // 先完成预签名，成功后再写 pending 记录；签名失败时不留下 pending 垃圾
  const uploadUrl = await backend.presignPut({ key, contentType: file.contentType });
  const thumbnailKey = file.contentType.startsWith('image/') ? mediaThumbKey() : '';
  const thumbnailUploadUrl = thumbnailKey ? await backend.presignPut({ key: thumbnailKey, contentType: 'image/webp' }) : '';
  const old = await env.DB.prepare('SELECT id FROM media WHERE owner_id=? AND r2_key=? LIMIT 1').bind(access.user.id, key).first();
  if (old) await env.DB.prepare("UPDATE media SET original_filename=?, content_type=?, size_bytes=?, sha256=?, thumbnail_key=?, storage_backend=?, upload_state='pending', trashed_at=NULL WHERE id=?").bind(file.filename, file.contentType, file.size, file.sha256, thumbnailKey || null, storageConfig.storageType, old.id).run();
  else await env.DB.prepare("INSERT INTO media (owner_id,r2_key,original_filename,content_type,size_bytes,sha256,thumbnail_key,upload_state,storage_backend) VALUES (?,?,?,?,?,?,?,'pending',?)").bind(access.user.id,key,file.filename,file.contentType,file.size,file.sha256,thumbnailKey || null,storageConfig.storageType).run();
  return json(ok({ exists: false, uploadUrl, key, path: `/upload/${key}`, contentType: file.contentType, direct: file.size >= DIRECT_UPLOAD_THRESHOLD, thumbnailKey, thumbnailUploadUrl }), 200, headers);
}
async function directUploadComplete(request, env, headers) {
  const access = await requireUser(request, env, headers); if (access.response) return access.response;
  const body = await readJson(request); const key = String(body?.key || '');
  const media = await env.DB.prepare("SELECT * FROM media WHERE owner_id=? AND r2_key=? AND upload_state='pending'").bind(access.user.id,key).first();
  if (!media) return json(fail('待确认上传不存在'),404,headers);
  const storageConfig = await loadStorageConfig(env);
  const backend = storageBackend(env, storageConfig, mediaStorageBackend(media));
  const object = await backend.head(key); if (!object || Number(object.size)!==Number(media.size_bytes)) return json(fail('文件不存在或大小不一致'),409,headers);
  let thumbnailKey = null;
  if (body.thumbnailKey) {
    thumbnailKey = String(body.thumbnailKey);
    if (!media.thumbnail_key || thumbnailKey !== String(media.thumbnail_key)) return json(fail('缩略图标识不匹配'), 403, headers);
    const thumb = await backend.head(thumbnailKey); if (!thumb || !String(thumb.httpMetadata?.contentType || '').startsWith('image/')) return json(fail('缩略图不存在'),409,headers);
  }
  await env.DB.prepare("UPDATE media SET upload_state='ready', thumbnail_key=? WHERE id=?").bind(thumbnailKey,media.id).run();
  return json(ok({ path:`/upload/${key}`, thumbPath:thumbnailKey?`/upload/${thumbnailKey}`:'' }),200,headers);
}
function collectUploadKeys(value, target) {
  const pattern = /\/upload\/([^\s"'<>),]+)/g;
  for (const match of String(value || '').matchAll(pattern)) target.add(decodeURIComponent(match[1]));
}
function mediaStorageBackend(media) {
  return ['r2', 's3', 'webdav'].includes(media?.storage_backend) ? media.storage_backend : 'r2';
}
async function purgeStalePendingUploads(userId, env) {
  const storageConfig = await loadStorageConfig(env);
  const stale = await env.DB.prepare("SELECT id, r2_key, thumbnail_key, storage_backend FROM media WHERE owner_id=? AND upload_state='pending' AND created_at <= datetime('now','-1 day')").bind(userId).all();
  for (const item of stale.results || []) {
    const backend = storageBackend(env, storageConfig, mediaStorageBackend(item));
    await Promise.all([backend.delete(item.r2_key).catch(() => {}), item.thumbnail_key ? backend.delete(item.thumbnail_key).catch(() => {}) : Promise.resolve()]);
    await env.DB.prepare("DELETE FROM media WHERE id=? AND owner_id=? AND upload_state='pending'").bind(item.id,userId).run();
  }
  return (stale.results || []).length;
}
async function purgeExpiredTrash(userId, env) {
  const storageConfig = await loadStorageConfig(env);
  const expired = await env.DB.prepare("SELECT id, r2_key, thumbnail_key, storage_backend FROM media WHERE owner_id=? AND trashed_at IS NOT NULL AND trashed_at <= datetime('now', ?)")
    .bind(userId, `-${TRASH_RETENTION_DAYS} days`).all();
  let purged = 0;
  for (const media of expired.results || []) {
    const backend = storageBackend(env, storageConfig, mediaStorageBackend(media));
    await Promise.all([backend.delete(media.r2_key), media.thumbnail_key ? backend.delete(media.thumbnail_key) : Promise.resolve()]);
    await env.DB.prepare('DELETE FROM media WHERE id=? AND owner_id=? AND trashed_at IS NOT NULL').bind(media.id, userId).run();
    purged += 1;
  }
  return purged;
}
async function cleanFiles(request, env, headers) {
  const access = await requireUser(request, env, headers);
  if (access.response) return access.response;
  const cleanStorageConfig = await loadStorageConfig(env);
  if (cleanStorageConfig.storageType === 'r2' && !env.MEDIA) return json(fail('R2 存储未配置'), 503, headers);
  const referenced = new Set();
  const [memos, users, configRow, mediaRows] = await Promise.all([
    env.DB.prepare('SELECT imgs, ext FROM memos WHERE user_id=?').bind(access.user.id).all(),
    env.DB.prepare('SELECT avatar_url, cover_url FROM users WHERE id=?').bind(access.user.id).all(),
    Number(access.user.id) === 1 ? env.DB.prepare('SELECT content FROM sys_config WHERE id=1').first() : Promise.resolve(null),
    env.DB.prepare('SELECT id, r2_key FROM media WHERE owner_id=? AND trashed_at IS NULL').bind(access.user.id).all(),
  ]);
  for (const row of memos.results || []) { collectUploadKeys(row.imgs, referenced); collectUploadKeys(row.ext, referenced); }
  for (const row of users.results || []) { collectUploadKeys(row.avatar_url, referenced); collectUploadKeys(row.cover_url, referenced); }
  collectUploadKeys(configRow?.content, referenced);
  let num = 0;
  for (const media of mediaRows.results || []) {
    if (referenced.has(media.r2_key)) continue;
    await env.DB.prepare('UPDATE media SET trashed_at=CURRENT_TIMESTAMP WHERE id=? AND owner_id=? AND trashed_at IS NULL').bind(media.id, access.user.id).run();
    num += 1;
  }
  const [purged, pendingPurged] = await Promise.all([purgeExpiredTrash(access.user.id, env), purgeStalePendingUploads(access.user.id, env)]);
  return json(ok({ num, purged, pendingPurged, retentionDays: TRASH_RETENTION_DAYS }), 200, headers);
}
async function listTrash(request, env, headers) {
  const access = await requireUser(request, env, headers);
  if (access.response) return access.response;
  const rows = await env.DB.prepare('SELECT id, r2_key, original_filename, content_type, size_bytes, trashed_at FROM media WHERE owner_id=? AND trashed_at IS NOT NULL ORDER BY trashed_at DESC').bind(access.user.id).all();
  return json(ok({ list: (rows.results || []).map(row => ({
    id: Number(row.id), path: `/upload/${row.r2_key}`, filename: row.original_filename,
    contentType: row.content_type, size: Number(row.size_bytes), trashedAt: row.trashed_at,
  })), retentionDays: TRASH_RETENTION_DAYS }), 200, headers);
}
async function restoreTrash(request, env, headers) {
  const access = await requireUser(request, env, headers);
  if (access.response) return access.response;
  const id = intParam(new URL(request.url).searchParams.get('id'));
  const result = await env.DB.prepare('UPDATE media SET trashed_at=NULL WHERE id=? AND owner_id=? AND trashed_at IS NOT NULL').bind(id, access.user.id).run();
  if (Number(result.meta?.changes || 0) !== 1) return json(fail('回收站文件不存在'), 404, headers);
  return json(ok({}), 200, headers);
}
async function purgeTrash(request, env, headers) {
  const access = await requireUser(request, env, headers);
  if (access.response) return access.response;
  const storageConfig = await loadStorageConfig(env);
  if (storageConfig.storageType === 'r2' && !env.MEDIA) return json(fail('R2 存储未配置'), 503, headers);
  const id = intParam(new URL(request.url).searchParams.get('id'));
  const media = await env.DB.prepare('SELECT id, r2_key, thumbnail_key, storage_backend FROM media WHERE id=? AND owner_id=? AND trashed_at IS NOT NULL').bind(id, access.user.id).first();
  if (!media) return json(fail('回收站文件不存在'), 404, headers);
  const backend = storageBackend(env, storageConfig, mediaStorageBackend(media));
  await Promise.all([backend.delete(media.r2_key), media.thumbnail_key ? backend.delete(media.thumbnail_key) : Promise.resolve()]);
  await env.DB.prepare('DELETE FROM media WHERE id=? AND owner_id=? AND trashed_at IS NOT NULL').bind(id, access.user.id).run();
  return json(ok({}), 200, headers);
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
// 本站媒体（/upload/ 前缀）的绝对 URL 规范化为相对路径，
// 避免历史数据或手动粘贴的绝对地址在绑定新域名后跨域加载触发 CORB。
function normalizeMediaUrls(imgs) {
  return String(imgs || '').split(',').filter(Boolean).map(url => {
    if (/^https?:\/\/[^/]+\/upload\//.test(url)) return url.replace(/^https?:\/\/[^/]+/, '');
    return url;
  }).join(',');
}
function imgConfigs(imgs, thumbnails = new Map()) {
  return String(imgs || '').split(',').filter(Boolean).map(url => {
    const key = url.startsWith('/upload/') ? url.slice('/upload/'.length) : '';
    return { url, thumbUrl: thumbnails.get(key) || url };
  });
}
function memoView(row) {
  if (!row) return null;
  const imgs = normalizeMediaUrls(row.imgs);
  return {
    id: Number(row.id), content: row.content, imgs, favCount: Number(row.fav_count),
    commentCount: Number(row.comment_count), userId: Number(row.user_id), createdAt: row.created_at,
    updatedAt: row.updated_at, location: row.location, externalUrl: row.external_url,
    externalTitle: row.external_title, externalFavicon: row.external_favicon, pinned: Boolean(row.pinned),
    ext: row.ext, showType: Number(row.show_type), tags: row.tags, imgConfigs: imgConfigs(imgs),
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
  const clientIp = String(request.headers.get('cf-connecting-ip') || '').trim();
  const networkHash = clientIp ? base64url(await hmac(secret, `like-network:${clientIp}`)) : '';
  return { hash: base64url(await hmac(secret, identity)), networkHash, headers };
}
async function canReadMemo(memo, user) {
  if (!memo) return false;
  if (Number(memo.show_type) === 1 && Date.parse(memo.created_at) <= Date.now()) return true;
  return Boolean(user && Number(user.id) === Number(memo.user_id));
}
async function listMemos(request, env, headers) {
  const body = (await readJson(request)) || {};
  const config = parseConfig((await env.DB.prepare('SELECT content FROM sys_config WHERE id=1').first())?.content);
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
  if (body.start) { const start = sqliteTime(body.start); if (start) { clauses.push('m.created_at >= ?'); values.push(start); } }
  if (body.end) { const end = sqliteTime(body.end); if (end) { clauses.push('m.created_at <= ?'); values.push(end); } }
  if (user && body.showType != null && Number(body.showType) >= 0) { clauses.push('m.show_type = ?'); values.push(intParam(body.showType)); }
  const where = ` WHERE ${clauses.join(' AND ')}`;
  const count = await env.DB.prepare(`SELECT COUNT(*) AS total FROM memos m JOIN users u ON u.id=m.user_id${where}`).bind(...values).first();
  const result = await env.DB.prepare(`${MEMO_SELECT}${where} ORDER BY m.pinned DESC, m.created_at DESC LIMIT ? OFFSET ?`).bind(...values, size, (page - 1) * size).all();
  const total = Number(count?.total || 0);
  const rows = result.results || [];
  const commentsByMemo = new Map();
  if (rows.length) {
    try {
      const ids = rows.map(row => Number(row.id));
      const placeholders = ids.map(() => '?').join(',');
      const order = config.commentOrder === 'asc' ? 'ASC' : 'DESC';
      const all = await env.DB.prepare(`SELECT * FROM (
        SELECT c.*, ROW_NUMBER() OVER (PARTITION BY memo_id ORDER BY created_at ${order}, id ${order}) AS row_num
        FROM comments c WHERE memo_id IN (${placeholders})
      ) ranked WHERE row_num <= 5 ORDER BY memo_id, created_at ${order}, id ${order}`).bind(...ids).all();
      for (const row of all.results || []) {
        const bucket = commentsByMemo.get(Number(row.memo_id)) || [];
        bucket.push(commentView(row));
        commentsByMemo.set(Number(row.memo_id), bucket);
      }
    } catch (error) {
      // During a rolling deployment, 0003_comments_friends.sql might not be applied yet.
      console.warn('Comments are temporarily unavailable for memo list', error);
    }
  }
  const allKeys = rows.flatMap(row => String(row.imgs || '').split(',').filter(value => value.startsWith('/upload/')).map(value => value.slice('/upload/'.length)));
  const thumbnails = new Map();
  if (allKeys.length) {
    const placeholders = allKeys.map(() => '?').join(',');
    const media = await env.DB.prepare(`SELECT r2_key, thumbnail_key FROM media WHERE r2_key IN (${placeholders}) AND trashed_at IS NULL`).bind(...allKeys).all();
    for (const item of media.results || []) if (item.thumbnail_key) thumbnails.set(item.r2_key, `/upload/${item.thumbnail_key}`);
  }
  const list = rows.map(row => {
    const view = memoView(row);
    view.imgConfigs = imgConfigs(row.imgs, thumbnails);
    view.comments = commentsByMemo.get(Number(row.id)) || [];
    return view;
  });
  await attachStatuses(env, list.map(memo => memo.user).filter(Boolean));
  return json(ok({ list, total, hasNext: page * size < total }), 200, headers);
}
async function getMemo(request, env, headers) {
  const url = new URL(request.url);
  const id = intParam(url.searchParams.get('id'));
  if (!id) return json(fail('参数错误'), 400, headers);
  const memo = await env.DB.prepare(`${MEMO_SELECT} WHERE m.id = ?`).bind(id).first();
  if (!memo) return json(fail('动态不存在'), 404, headers);
  if (!(await canReadMemo(memo, await currentUser(request, env)))) return json(fail('暂无权限查看'), 403, headers);
  const config = parseConfig((await env.DB.prepare('SELECT content FROM sys_config WHERE id=1').first())?.content);
  const view = memoView(memo);
  try {
    const order = config.commentOrder === 'asc' ? 'ASC' : 'DESC';
    const latest = url.searchParams.get('latest');
    const comments = await env.DB.prepare(`SELECT * FROM comments WHERE memo_id=? ORDER BY created_at ${order}, id ${order}${latest ? ' LIMIT 5' : ''}`).bind(id).all();
    view.comments = (comments.results || []).map(commentView);
    const keys = String(memo.imgs || '').split(',').filter(value => value.startsWith('/upload/')).map(value => value.slice('/upload/'.length));
    if (keys.length) {
      const media = await env.DB.prepare(`SELECT r2_key, thumbnail_key FROM media WHERE r2_key IN (${keys.map(() => '?').join(',')}) AND trashed_at IS NULL`).bind(...keys).all();
      const thumbnails = new Map((media.results || []).filter(item => item.thumbnail_key).map(item => [item.r2_key, `/upload/${item.thumbnail_key}`]));
      view.imgConfigs = imgConfigs(memo.imgs, thumbnails);
    }
  } catch (error) {
    console.warn('Comments are temporarily unavailable for memo detail', error);
    view.comments = [];
  }
  return json(ok(view), 200, headers);
}
function parseMemoRefUrl(value, currentHost) {
  const text = String(value || '').trim();
  if (!text) throw new Error('站内动态链接不能为空');
  let id;
  if (text.startsWith('/')) {
    const match = text.match(/^\/memo\/(\d+)\/?$/);
    if (!match) throw new Error('仅支持本站 /memo/{id} 动态链接');
    id = Number(match[1]);
  } else {
    const url = validHttpUrl(text);
    if (!url) throw new Error('仅支持本站 /memo/{id} 动态链接');
    if (url.hostname.toLowerCase() !== String(currentHost || '').toLowerCase()) throw new Error('仅支持本站动态链接');
    const match = url.pathname.match(/^\/memo\/(\d+)\/?$/);
    if (!match) throw new Error('仅支持本站 /memo/{id} 动态链接');
    id = Number(match[1]);
  }
  if (!Number.isInteger(id) || id < 1) throw new Error('动态编号无效');
  return { id, url: `/memo/${id}` };
}
function memoRefText(value) {
  return String(value || '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[`*_~>#]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 500);
}
async function memoRefSnapshot(env, id, viewer) {
  const memo = await env.DB.prepare(`${MEMO_SELECT} WHERE m.id = ?`).bind(id).first();
  if (!memo) throw new Error('动态不存在');
  if (Number(memo.show_type) !== 1 || Date.parse(memo.created_at) > Date.now()) throw new Error('仅可引用已发布的公开动态');
  const imgs = String(memo.imgs || '').split(',').filter(Boolean).slice(0, 4);
  return {
    id: Number(memo.id),
    url: `/memo/${Number(memo.id)}`,
    authorName: String(memo.nickname || '').slice(0, 80),
    authorAvatar: String(memo.avatar_url || '').slice(0, 2048),
    content: memoRefText(memo.content),
    imgs,
    createdAt: String(memo.created_at || ''),
  };
}
async function previewUnfurl(request, env, headers) {
  const access = await requireUser(request, env, headers);
  if (access.response) return access.response;
  const body = await readJson(request);
  const kind = String(body?.kind || '');
  const url = String(body?.url || '').trim();
  try {
    if (kind === 'git') return json(ok(await fetchGitSnapshot(parseGitEmbedUrl(url))), 200, headers);
    if (kind === 'x') return json(ok(await fetchXSnapshot(parseXEmbedUrl(url))), 200, headers);
    if (kind === 'memo') return json(ok(await memoRefSnapshot(env, parseMemoRefUrl(url, new URL(request.url).hostname).id, await currentUser(request, env))), 200, headers);
    return json(fail('预览类型无效'), 400, headers);
  } catch (error) { return json(fail(error.message), 400, headers); }
}
async function verifyMemoMedia(imgs, user, env) {
  for (const url of imgs) {
    if (!url.startsWith('/upload/media/')) continue;
    const key = url.slice('/upload/'.length);
    const media = await env.DB.prepare('SELECT owner_id FROM media WHERE r2_key = ? AND trashed_at IS NULL').bind(key).first();
    if (!media || Number(media.owner_id) !== Number(user.id)) throw new Error('图片不属于当前用户');
  }
}
async function saveMemo(request, env, headers) {
  const access = await requireUser(request, env, headers);
  if (access.response) return access.response;
  const body = await readJson(request);
  if (!body || typeof body !== 'object') return json(fail('参数错误'), 400, headers);
  const content = String(body.content || '').trim();
  let imgs;
  try {
    imgs = (Array.isArray(body.imgs) ? body.imgs : []).map(value => safeHttpHref(value, '图片地址', { allowRelativeUpload: true })).filter(Boolean).slice(0, 9);
  } catch (error) { return json(fail(error.message), 400, headers); }
  if (content.length > 10000) return json(fail('动态内容不能超过 10000 字'), 400, headers);
  try { await verifyMemoMedia(imgs, access.user, env); } catch (error) { return json(fail(error.message), 403, headers); }
  const id = intParam(body.id);
  const showType = Number(body.showType) === 0 ? 0 : 1;
  const createdAt = sqliteTime(body.createdAt || new Date());
  if (!createdAt) return json(fail('发布时间格式错误'), 400, headers);
  const externalUrl = body.externalUrl ? validHttpUrl(String(body.externalUrl)) : null;
  let externalFavicon = '';
  try { externalFavicon = safeSiteAssetHref(body.externalFavicon, '外部图标'); }
  catch (error) { return json(fail(error.message), 400, headers); }
  if (body.externalUrl && !externalUrl) return json(fail('外部链接仅支持 http/https'), 400, headers);
  let safeExt;
  try {
    safeExt = sanitizeMemoExt(body.ext);
    if (safeExt.git?.url && !safeExt.git.title) safeExt.git = await fetchGitSnapshot(safeExt.git);
    if (safeExt.memoRef?.id) {
      try { safeExt.memoRef = await memoRefSnapshot(env, safeExt.memoRef.id, access.user); }
      catch (error) {
        // 源动态已失效（删除/变私密/未发布）：移除引用，避免整条动态无法保存
        delete safeExt.memoRef;
      }
    }
    if (safeExt.x?.id) {
      const metricsAllZero = !safeExt.x.likes && !safeExt.x.replies && !safeExt.x.reposts;
      const needsRefresh = !safeExt.x.text || !safeExt.x.avatar || metricsAllZero || (String(safeExt.x.text).includes('pic.twitter.com') && !safeExt.x.media?.length);
      if (needsRefresh) {
        try { safeExt.x = await fetchXSnapshot(safeExt.x); }
        catch (error) {
          // 快照抓取失败：已有文本快照则保留旧快照，否则移除，避免阻塞保存
          if (!safeExt.x.text) delete safeExt.x;
        }
      }
    }
  } catch (error) { return json(fail(error.message), 400, headers); }
  const hasExt = safeExt.music?.url || safeExt.music?.id || safeExt.x?.id || safeExt.git?.url || safeExt.video?.value || safeExt.memoRef?.id
    || (Array.isArray(safeExt.doubanBooks) && safeExt.doubanBooks.length > 0)
    || (Array.isArray(safeExt.doubanMovies) && safeExt.doubanMovies.length > 0)
    || Boolean(safeExt.doubanBook?.title) || Boolean(safeExt.doubanMovie?.title);
  if (!content && !imgs.length && !externalUrl && !hasExt) return json(fail('动态内容不能为空'), 400, headers);
  const ext = JSON.stringify(safeExt);
  const imgsValue = normalizeMediaUrls(imgs.join(','));
  const values = [content, imgsValue, String(body.location || '').slice(0, 200), externalUrl?.href || '', String(body.externalTitle || '').slice(0, 300), externalFavicon || '/favicon.png', ext, showType, tagsString(body.tags)];
  if (id) {
    const existing = await env.DB.prepare('SELECT * FROM memos WHERE id=?').bind(id).first();
    if (!existing) return json(fail('动态不存在'), 404, headers);
    if (Number(existing.user_id) !== Number(access.user.id)) return json(fail('没有权限'), 403, headers);
    await env.DB.prepare('UPDATE memos SET content=?, imgs=?, location=?, external_url=?, external_title=?, external_favicon=?, ext=?, show_type=?, tags=?, created_at=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')
      .bind(...values, createdAt, id).run();
  } else {
    await env.DB.prepare('INSERT INTO memos (content, imgs, location, external_url, external_title, external_favicon, pinned, ext, show_type, tags, user_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)')
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
  const config = parseConfig((await env.DB.prepare('SELECT content FROM sys_config WHERE id=1').first())?.content);
  const requestUrl = new URL(request.url);
  const human = await verifyHumanToken(requestUrl.searchParams.get('token'), config, 'likeMemo', requestUrl.hostname);
  if (!human.ok) return json(fail(human.message), 400, headers);
  const memo = await env.DB.prepare('SELECT id, show_type, created_at FROM memos WHERE id=?').bind(id).first();
  if (!memo || Number(memo.show_type) !== 1 || Date.parse(memo.created_at) > Date.now()) return json(fail('动态不存在或不可点赞'), 404, headers);
  const identity = await likeIdentity(request, env);
  const result = await env.DB.prepare('INSERT OR IGNORE INTO memo_likes (memo_id, identity_hash, network_hash) VALUES (?, ?, ?)').bind(id, identity.hash, identity.networkHash).run();
  if (Number(result.meta?.changes || 0) === 0) return json(fail('您已经点赞过了'), 409, { ...headers, ...Object.fromEntries(identity.headers) });
  // D1 trigger trg_memo_likes_insert updates fav_count in the same transaction.
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
// 静态 SEO 默认文案：与 front/site.config.ts 保持一致，供爬虫读取兜底。
const DEFAULT_SEO = {
  title: '极简朋友圈',
  description: '极简朋友圈 - 记录生活的每个瞬间，分享日常、心情与见闻的个人博客。',
  keywords: '朋友圈, 动态, 博客, 极简朋友圈, 个人博客, 生活记录',
};
// 把后台配置的 SEO 信息动态注入 SPA index.html，
// 让不执行 JS 的爬虫（Bing 等）也能读到站点标题/描述/关键词。
export function injectSeoMeta(html, config) {
  const title = escapeXml(String(config?.title || DEFAULT_SEO.title));
  const description = escapeXml(String(config?.seoDescription || (config?.slogan ? `${config.slogan} · ${config.title || DEFAULT_SEO.title}` : DEFAULT_SEO.description)));
  const keywords = escapeXml(String(config?.seoKeywords || DEFAULT_SEO.keywords));
  let output = String(html || '');
  output = output.replace(/<title>[^<]*<\/title>/, `<title>${title}</title>`);
  output = output.replace(/<meta name="description"[^>]*>/, `<meta name="description" content="${description}">`);
  output = output.replace(/<meta name="keywords"[^>]*>/, `<meta name="keywords" content="${keywords}">`);
  output = output.replace(/<meta property="og:site_name"[^>]*>/, `<meta property="og:site_name" content="${title}">`);
  output = output.replace(/<meta property="og:title"[^>]*>/, `<meta property="og:title" content="${title}">`);
  output = output.replace(/<meta property="og:description"[^>]*>/, `<meta property="og:description" content="${description}">`);
  output = output.replace(/<meta name="twitter:title"[^>]*>/, `<meta name="twitter:title" content="${title}">`);
  output = output.replace(/<meta name="twitter:description"[^>]*>/, `<meta name="twitter:description" content="${description}">`);
  return output;
}
function rssText(value) { return String(value || '').replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/[>#*_`~-]/g, '').trim(); }
async function sitemap(request, env) {
  const host = new URL(request.url).origin;
  const [memos, users, configRow] = await Promise.all([
    env.DB.prepare('SELECT id, created_at FROM memos WHERE show_type=1 LIMIT 50000').all(),
    env.DB.prepare('SELECT id, updated_at FROM users LIMIT 5000').all(),
    env.DB.prepare('SELECT content FROM sys_config WHERE id=1').first(),
  ]);
  const config = parseConfig(configRow?.content);
  const urls = [];
  const push = (loc, lastmod, freq, priority) => {
    const lastmodTag = lastmod ? `<lastmod>${escapeXml(lastmod.replace(' ', 'T') + 'Z')}</lastmod>` : '';
    urls.push(`<url><loc>${host}${loc}</loc>${lastmodTag}<changefreq>${freq}</changefreq><priority>${priority}</priority></url>`);
  };
  push('/', null, 'daily', '1.0');
  if (config.enableAbout) push('/about', null, 'monthly', '0.6');
  push('/friend', null, 'weekly', '0.6');
  for (const user of users.results || []) push(`/user/${Number(user.id)}`, user.updated_at || '', 'weekly', '0.7');
  for (const memo of memos.results || []) push(`/memo/${Number(memo.id)}`, memo.created_at || '', 'weekly', '0.8');
  const xml = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.join('')}</urlset>`;
  return new Response(xml, { headers: { 'content-type': 'application/xml; charset=UTF-8', 'cache-control': 'no-store' } });
}
function robots(request) {
  const host = new URL(request.url).origin;
  const text = `User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /upload/\nSitemap: ${host}/sitemap.xml\n`;
  return new Response(text, { headers: { 'content-type': 'text/plain; charset=UTF-8', 'cache-control': 'no-store' } });
}
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
    const description = renderRssDescription(memo, host).replaceAll(']]>', ']]&gt;');
    return `<item><guid>${host}/memo/${memo.id}</guid><title>${escapeXml(title)}</title><link>${host}/memo/${memo.id}</link><description><![CDATA[${description}]]></description><pubDate>${new Date(memo.createdAt).toUTCString()}</pubDate></item>`;
  }).join('');
  const feed = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>${escapeXml(config.title)}</title><link>${host}</link><description>${escapeXml(admin?.slogan || '')}</description><lastBuildDate>${new Date().toUTCString()}</lastBuildDate>${items}</channel></rss>`;
  return new Response(feed, { headers: { 'content-type': 'application/rss+xml; charset=UTF-8', 'cache-control': 'no-store' } });
}


function validHttpUrl(value) {
  try { const url = new URL(value); return url.protocol === 'https:' || url.protocol === 'http:' ? url : null; } catch { return null; }
}
function safeHttpHref(value, label, { allowRelativeUpload = false } = {}) {
  const text = String(value || '').trim();
  if (!text) return '';
  if (allowRelativeUpload && text.startsWith('/upload/')) return text.slice(0, 2048);
  const url = validHttpUrl(text);
  if (!url) throw new Error(`${label}仅支持 http/https`);
  return url.href.slice(0, 2048);
}
function safeSiteAssetHref(value, label) {
  const text = String(value || '').trim();
  if (!text) return '';
  if (/^\/(?:upload\/|favicon(?:\.|\/))/.test(text) && !text.includes('..')) return text.slice(0, 2048);
  return safeHttpHref(text, label);
}
function parseXEmbedUrl(value) {
  const url = safeHttpHref(value, 'X 链接');
  const parsed = new URL(url);
  const host = parsed.hostname.toLowerCase();
  if (!['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com', 'mobile.twitter.com'].includes(host)) throw new Error('仅支持 X（Twitter）链接');
  const match = parsed.pathname.match(/\/status(?:es)?\/(\d{5,30})(?:\/|$)/);
  if (!match) throw new Error('仅支持单条 X（Twitter）状态链接');
  return { url, id: match[1] };
}
function isIpLiteralHost(host) {
  const h = String(host || '').toLowerCase();
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h)) return true; // IPv4 字面量
  return h.includes(':'); // IPv6 字面量（URL.hostname 已去除方括号）
}
function parseGitEmbedUrl(value) {
  const href = safeHttpHref(value, 'Git 链接');
  const url = new URL(href);
  if (forbiddenHost(url.hostname) || isIpLiteralHost(url.hostname)) throw new Error('不允许访问本地、内网或 IP 地址');
  const parts = url.pathname.split('/').filter(Boolean);
  if (parts.length < 2) throw new Error('Git 链接必须包含仓库所有者和仓库名');
  const host = url.hostname.toLowerCase();
  const provider = host === 'github.com' ? 'github' : host === 'gitlab.com' ? 'gitlab' : host === 'codeberg.org' ? 'codeberg' : host.includes('forgejo') ? 'forgejo' : host.includes('gitea') ? 'gitea' : 'git';
  const owner = parts[0].slice(0, 200);
  const repo = parts[1].replace(/\.git$/i, '').slice(0, 200);
  if (!owner || !repo || ['api', 'explore', 'users', 'user', 'org'].includes(owner.toLowerCase())) throw new Error('Git 仓库路径无效');
  let kind = 'repo'; let branch = ''; let path = ''; let number;
  const marker = parts[2] === '-' ? parts[3] : parts[2];
  const offset = parts[2] === '-' ? 4 : 3;
  if (['issues', 'issue'].includes(marker)) { kind = 'issue'; number = clampInt(parts[offset], 1, 1_000_000_000, 0) || undefined; }
  else if (['pull', 'pulls', 'merge_requests'].includes(marker)) { kind = 'pull'; number = clampInt(parts[offset], 1, 1_000_000_000, 0) || undefined; }
  else if (['commit', 'commits'].includes(marker)) { kind = 'commit'; path = String(parts[offset] || '').slice(0, 200); }
  else if (['releases', 'release'].includes(marker)) { kind = 'release'; path = parts.slice(offset).join('/').slice(0, 500); }
  else if (['blob', 'tree', 'src', 'raw'].includes(marker)) { kind = 'file'; branch = String(parts[offset] || '').slice(0, 200); path = parts.slice(offset + 1).join('/').slice(0, 1000); }
  return { url: href, provider, kind, owner, repo, branch, path, number };
}
function gitSnapshotFromRepository(data, git) {
  return {
    ...git,
    title: String(data?.full_name || data?.path_with_namespace || data?.name || `${git.owner}/${git.repo}`).slice(0, 300),
    description: String(data?.description || '').slice(0, 4000),
    author: String(data?.owner?.login || data?.owner?.username || data?.namespace?.name || git.owner).slice(0, 200),
    avatar: safeHttpHref(data?.owner?.avatar_url || data?.avatar_url || '', 'Git 头像') || '',
    language: String(data?.language || data?.language_name || '').slice(0, 100),
    stars: clampInt(data?.stargazers_count ?? data?.star_count ?? data?.stars_count, 0, 1_000_000_000, 0),
    forks: clampInt(data?.forks_count, 0, 1_000_000_000, 0),
    updatedAt: String(data?.updated_at || data?.last_activity_at || '').slice(0, 100),
  };
}
function gitSnapshotFromHtml(html, git) {
  const title = decodeHtml(metaContent(html, 'property', 'og:title') || html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || `${git.owner}/${git.repo}`).replace(/<[^>]*>/g, '').trim();
  const description = decodeHtml(metaContent(html, 'property', 'og:description') || metaContent(html, 'name', 'description')).replace(/<[^>]*>/g, '').trim();
  return { ...git, title: title.slice(0, 300) || `${git.owner}/${git.repo}`, description: description.slice(0, 4000), author: git.owner };
}
async function fetchGitRepositorySnapshot(git) {
  const headers = { accept: 'application/json', 'user-agent': 'Moments-CF/1.0' };
  let apiUrl = '';
  if (git.provider === 'github') apiUrl = `https://api.github.com/repos/${encodeURIComponent(git.owner)}/${encodeURIComponent(git.repo)}`;
  else if (git.provider === 'gitlab') apiUrl = `https://gitlab.com/api/v4/projects/${encodeURIComponent(`${git.owner}/${git.repo}`)}`;
  else apiUrl = `${new URL(git.url).origin}/api/v1/repos/${encodeURIComponent(git.owner)}/${encodeURIComponent(git.repo)}`;
  try {
    const response = await fetch(apiUrl, { redirect: 'manual', headers, signal: AbortSignal.timeout(8000) });
    if (response.ok && (response.headers.get('content-type') || '').includes('json')) return gitSnapshotFromRepository(await response.json(), git);
  } catch (error) { console.warn('Git repository API snapshot failed', error); }
  try {
    const response = await fetch(git.url, { redirect: 'manual', headers: { 'user-agent': headers['user-agent'], accept: 'text/html' }, signal: AbortSignal.timeout(8000) });
    if (response.ok && (response.headers.get('content-type') || '').includes('text/html')) return gitSnapshotFromHtml((await response.text()).slice(0, 512000), git);
  } catch (error) { console.warn('Git page snapshot failed', error); }
  return { ...git, title: `${git.owner}/${git.repo}`, description: '', author: git.owner };
}
function gitItemApiUrl(git) {
  const origin = new URL(git.url).origin;
  if (git.provider === 'github') {
    const base = `https://api.github.com/repos/${encodeURIComponent(git.owner)}/${encodeURIComponent(git.repo)}`;
    if (git.kind === 'commit') return `${base}/commits/${encodeURIComponent(git.path || '')}`;
    return `${base}/issues/${git.number}`;
  }
  const project = encodeURIComponent(`${git.owner}/${git.repo}`);
  if (git.provider === 'gitlab') {
    if (git.kind === 'commit') return `https://gitlab.com/api/v4/projects/${project}/repository/commits/${encodeURIComponent(git.path || '')}`;
    return `https://gitlab.com/api/v4/projects/${project}/${git.kind === 'pull' ? 'merge_requests' : 'issues'}/${git.number}`;
  }
  if (git.kind === 'commit') return `${origin}/api/v1/repos/${encodeURIComponent(git.owner)}/${encodeURIComponent(git.repo)}/git/commits/${encodeURIComponent(git.path || '')}`;
  return `${origin}/api/v1/repos/${encodeURIComponent(git.owner)}/${encodeURIComponent(git.repo)}/issues/${git.number}`;
}
function gitItemSnapshotFrom(data, git) {
  if (git.kind === 'commit') {
    const message = String(data?.commit?.message || data?.title || '').split('\n')[0].trim();
    return {
      itemTitle: message.slice(0, 300),
      itemAuthor: String(data?.author?.login || data?.author?.username || data?.author_name || data?.commit?.author?.name || '').slice(0, 200),
      avatar: safeHttpHref(data?.author?.avatar_url || data?.commit?.author?.avatar_url || '', 'Git 头像') || '',
      itemDate: String(data?.created_at || data?.committed_date || data?.commit?.author?.date || '').slice(0, 100),
      itemState: '',
    };
  }
  const merged = git.kind === 'pull' && Boolean(data?.merged_at || data?.merged || data?.state === 'merged');
  return {
    itemTitle: String(data?.title || '').slice(0, 300),
    itemAuthor: String(data?.user?.login || data?.author?.username || data?.author?.name || data?.author?.login || '').slice(0, 200),
    avatar: safeHttpHref(data?.user?.avatar_url || data?.author?.avatar_url || '', 'Git 头像') || '',
    itemState: merged ? 'merged' : String(data?.state || '').slice(0, 20),
    itemDate: String(data?.created_at || '').slice(0, 100),
  };
}
async function fetchGitItemSnapshot(git) {
  const headers = { accept: 'application/json', 'user-agent': 'Moments-CF/1.0' };
  const response = await fetch(gitItemApiUrl(git), { redirect: 'manual', headers, signal: AbortSignal.timeout(8000) });
  if (!response.ok || !(response.headers.get('content-type') || '').includes('json')) throw new Error(`Git 条目获取失败（${response.status}）`);
  const snapshot = gitItemSnapshotFrom(await response.json(), git);
  if (git.kind !== 'commit' && !snapshot.itemTitle) throw new Error('Git 条目没有标题');
  return snapshot;
}
async function fetchGitSnapshot(git) {
  if (!['issue', 'pull', 'commit'].includes(git.kind)) return fetchGitRepositorySnapshot(git);
  const base = await fetchGitRepositorySnapshot(git);
  try {
    const item = await fetchGitItemSnapshot(git);
    return { ...base, ...item };
  } catch (error) { console.warn('Git item snapshot failed', error); }
  return base;
}
function xSyndicationToken(id) {
  return ((Number(id) / 1e15) * Math.PI).toString(36).replace(/(0+|\.)/g, '');
}
function xMediaSnapshot(data) {
  const source = Array.isArray(data?.mediaDetails) ? data.mediaDetails : (Array.isArray(data?.media) ? data.media : []);
  const photoFallback = Array.isArray(data?.photos) ? data.photos.map(item => ({ ...item, type: 'photo', media_url_https: item.url })) : [];
  const entries = source.length ? source : photoFallback;
  return entries.slice(0, 4).map(item => ({
    type: ['photo', 'video', 'animated_gif'].includes(item.type) ? item.type : 'photo',
    url: String(item.media_url_https || item.media_url || item.url || '').slice(0, 2048),
    previewUrl: String(item.media_url_https || item.media_url || item.preview_image_url || item.url || '').slice(0, 2048),
    width: Number(item.original_info?.width || item.width || 0) || undefined,
    height: Number(item.original_info?.height || item.height || 0) || undefined,
  })).filter(item => item.url);
}
function decodeXHtml(value) {
  return String(value || '').replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#x27;/g, "'").replace(/&mdash;/g, '—').replace(/&nbsp;/g, ' ').trim();
}
function xSnapshotFromSyndication(data, x) {
  const user = data?.user || data?.author || {};
  const rawText = String(data?.text || data?.full_text || '').trim();
  const mediaLinks = new Set((Array.isArray(data?.mediaDetails) ? data.mediaDetails : []).map(item => String(item.url || '').trim()).filter(Boolean));
  const text = rawText.replace(/\s+https?:\/\/t\.co\/[A-Za-z0-9_]+/g, match => mediaLinks.has(match.trim()) ? '' : match).trim();
  if (!text) return null;
  return {
    ...x,
    authorName: String(user.name || '').slice(0, 200),
    authorUsername: String(user.screen_name || user.username || '').slice(0, 100),
    authorUrl: safeHttpHref(user.screen_name ? `https://x.com/${user.screen_name}` : '', 'X 作者链接') || '',
    avatar: safeHttpHref(user.profile_image_url_https || user.profile_image_url || '', 'X 头像') || '',
    verified: Boolean(user.verified || user.is_blue_verified),
    text: text.slice(0, 10000),
    createdAt: String(data?.created_at || '').slice(0, 100),
    likes: clampInt(data?.favorite_count || data?.like_count, 0, 1_000_000_000, 0),
    replies: clampInt(data?.conversation_count || data?.reply_count, 0, 1_000_000_000, 0),
    // X syndication 不返回转发数；缺少时置 undefined，由 JSON 序列化省略，前端不显示
    reposts: undefined,
    media: xMediaSnapshot(data),
  };
}
function xSnapshotFromOembed(data, x) {
  const html = String(data?.html || '');
  const text = decodeXHtml(html.match(/<p[^>]*>([\s\S]*?)<\/p>/i)?.[1] || '');
  if (!text) return null;
  const authorName = String(data.author_name || '').slice(0, 200);
  return {
    ...x,
    authorName,
    authorUsername: '',
    authorUrl: safeHttpHref(data.author_url, 'X 作者链接') || '',
    avatar: '',
    verified: false,
    text: text.slice(0, 10000),
    createdAt: decodeXHtml(html.match(/<a[^>]*>([^<]+)<\/a>\s*<\/blockquote>/i)?.[1] || '').slice(0, 100),
    likes: 0,
    replies: 0,
    reposts: 0,
    media: [],
  };
}
function xSyndicationUrl(x) {
  const features = [
    'tfw_timeline_list:', 'tfw_follower_count_sunset:true', 'tfw_tweet_edit_backend:on',
    'tfw_refsrc_session:on', 'tfw_fosnr_soft_interventions_enabled:on',
    'tfw_show_birdwatch_pivots_enabled:on', 'tfw_show_business_verified_badge:on',
    'tfw_duplicate_scribes_to_settings:on', 'tfw_use_profile_image_shape_enabled:on',
    'tfw_show_blue_verified_badge:on', 'tfw_legacy_timeline_sunset:true', 'tfw_tweet_edit_frontend:on',
  ].join(',');
  return `https://cdn.syndication.twimg.com/tweet-result?id=${encodeURIComponent(x.id)}&token=${encodeURIComponent(xSyndicationToken(x.id))}&lang=zh-cn&features=${encodeURIComponent(features)}`;
}
async function fetchXSnapshot(x) {
  const headers = { accept: 'application/json', 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36' };
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const syndication = await fetch(xSyndicationUrl(x), { headers, signal: AbortSignal.timeout(10000) });
      if (syndication.ok) {
        const data = await syndication.json();
        const snapshot = xSnapshotFromSyndication(data, x);
        if (snapshot) return snapshot;
      }
    } catch (error) { console.warn(`X syndication snapshot failed (attempt ${attempt + 1})`, error); }
  }
  const oembed = await fetch(`https://publish.twitter.com/oembed?url=${encodeURIComponent(x.url)}&dnt=true`, { headers, signal: AbortSignal.timeout(10000) });
  if (!oembed.ok) throw new Error(`X 原帖获取失败（${oembed.status}）`);
  const snapshot = xSnapshotFromOembed(await oembed.json(), x);
  if (!snapshot) throw new Error('X 原帖没有可保存的文本内容');
  return snapshot;
}
function sanitizeMemoExt(input) {
  const ext = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const output = { music: {}, video: {}, git: {}, memoRef: {}, doubanBook: {}, doubanMovie: {} };
  if (ext.music?.url || ext.music?.mode === 'direct') {
    const url = safeHttpHref(ext.music.url, '音乐直链');
    const name = String(ext.music.name || '').trim().slice(0, 200);
    if (!url || !name) throw new Error('直链音乐需要音频链接和歌曲名');
    output.music = {
      mode: 'direct', url, name,
      artist: String(ext.music.artist || '').trim().slice(0, 200),
      cover: safeHttpHref(ext.music.cover, '音乐封面', { allowRelativeUpload: true }) || '',
      lrc: String(ext.music.lrc || '').slice(0, 30000),
    };
  } else if (ext.music?.id) {
    const servers = new Set(['netease', 'tencent', 'kugou', 'xiami', 'baidu']);
    const types = new Set(['song', 'playlist', 'album', 'search', 'artist']);
    const server = String(ext.music.server || '');
    const type = String(ext.music.type || '');
    if (!servers.has(server)) throw new Error('不支持的音乐平台');
    if (!types.has(type)) throw new Error('不支持的音乐类型');
    output.music = {
      mode: 'platform', id: String(ext.music.id).slice(0, 200), server, type,
      api: safeHttpHref(ext.music.api, '音乐 API'),
    };
  }
  if (ext.video?.value) {
    const type = String(ext.video.type || '');
    if (!['online', 'youtube', 'bilibili'].includes(type)) throw new Error('不支持的视频类型');
    const value = safeHttpHref(ext.video.value, '视频地址', { allowRelativeUpload: type === 'online' });
    const url = value.startsWith('/upload/') ? null : new URL(value);
    if (type === 'youtube' && !['www.youtube.com', 'youtube.com', 'www.youtube-nocookie.com'].includes(url?.hostname)) throw new Error('Youtube 视频地址无效');
    if (type === 'bilibili' && url?.hostname !== 'player.bilibili.com') throw new Error('B站视频地址无效');
    output.video = { type, value };
  }
  if (ext.git?.url) {
    const git = parseGitEmbedUrl(ext.git.url);
    if (ext.git.title) Object.assign(git, {
      title: String(ext.git.title || '').slice(0, 300),
      description: String(ext.git.description || '').slice(0, 4000),
      author: String(ext.git.author || '').slice(0, 200),
      avatar: safeHttpHref(ext.git.avatar, 'Git 头像') || '',
      language: String(ext.git.language || '').slice(0, 100),
      stars: clampInt(ext.git.stars, 0, 1_000_000_000, 0),
      forks: clampInt(ext.git.forks, 0, 1_000_000_000, 0),
      updatedAt: String(ext.git.updatedAt || '').slice(0, 100),
      itemTitle: String(ext.git.itemTitle || '').slice(0, 300),
      itemAuthor: String(ext.git.itemAuthor || '').slice(0, 200),
      itemState: ['open', 'closed', 'merged'].includes(String(ext.git.itemState || '').toLowerCase()) ? String(ext.git.itemState).toLowerCase() : '',
      itemDate: String(ext.git.itemDate || '').slice(0, 100),
    });
    output.git = git;
  }
  if (ext.memoRef?.id != null) {
    const id = Number(ext.memoRef.id);
    if (!Number.isInteger(id) || id < 1) throw new Error('站内动态编号无效');
    const avatar = String(ext.memoRef.authorAvatar || '').trim();
    const imgs = (Array.isArray(ext.memoRef.imgs) ? ext.memoRef.imgs : []).slice(0, 4).map(img => {
      const value = String(img || '').trim();
      return value.startsWith('/upload/') || /^https?:\/\//i.test(value) ? value.slice(0, 2048) : '';
    }).filter(Boolean);
    output.memoRef = {
      id,
      url: `/memo/${id}`,
      authorName: String(ext.memoRef.authorName || '').slice(0, 80),
      authorAvatar: (avatar.startsWith('/upload/') || avatar.startsWith('/avatar') || avatar.startsWith('/cover') || /^https?:\/\//i.test(avatar)) ? avatar.slice(0, 2048) : '',
      content: String(ext.memoRef.content || '').slice(0, 500),
      imgs,
      createdAt: String(ext.memoRef.createdAt || '').slice(0, 100),
    };
  }
  if (ext.x?.url) {
    const x = parseXEmbedUrl(ext.x.url);
    // 已保存的快照在编辑时原样保留，避免每次修改动态都重新请求 X。
    if (ext.x.text) Object.assign(x, {
      authorName: String(ext.x.authorName || '').slice(0, 200),
      authorUsername: String(ext.x.authorUsername || '').replace(/^@/, '').slice(0, 100),
      authorUrl: safeHttpHref(ext.x.authorUrl, 'X 作者链接') || '',
      avatar: safeHttpHref(ext.x.avatar, 'X 头像') || '',
      verified: Boolean(ext.x.verified),
      text: String(ext.x.text || '').slice(0, 10000),
      createdAt: String(ext.x.createdAt || '').slice(0, 100),
      likes: clampInt(ext.x.likes, 0, 1_000_000_000, 0),
      replies: clampInt(ext.x.replies, 0, 1_000_000_000, 0),
      reposts: clampInt(ext.x.reposts, 0, 1_000_000_000, 0),
      media: (Array.isArray(ext.x.media) ? ext.x.media : []).slice(0, 4).map(item => ({
        type: ['photo', 'video', 'animated_gif'].includes(item?.type) ? item.type : 'photo',
        url: safeHttpHref(item?.url, 'X 媒体') || '',
        previewUrl: safeHttpHref(item?.previewUrl, 'X 媒体预览') || '',
        width: clampInt(item?.width, 1, 10000, 0) || undefined,
        height: clampInt(item?.height, 1, 10000, 0) || undefined,
      })).filter(item => item.url),
    });
    output.x = x;
  }
  const cleanDouban = (item, isBook) => {
    const clean = {
      id: String(item.id || '').replace(/\D/g, '').slice(0, 20),
      url: safeHttpHref(item.url, '豆瓣链接'), title: String(item.title).slice(0, 300),
      desc: String(item.desc || '').slice(0, 4000), image: String(item.image || '').startsWith('/douban-cover?') ? String(item.image).slice(0, 4096) : safeHttpHref(item.image, '豆瓣封面', { allowRelativeUpload: true }),
      rating: String(item.rating || '').slice(0, 30),
    };
    if (isBook) Object.assign(clean, { isbn: String(item.isbn || '').slice(0, 40), author: String(item.author || '').slice(0, 300), pubDate: String(item.pubDate || '').slice(0, 40), keywords: String(item.keywords || '').slice(0, 1000) });
    else Object.assign(clean, { director: String(item.director || '').slice(0, 300), releaseDate: String(item.releaseDate || '').slice(0, 80), actors: String(item.actors || '').slice(0, 1000), runtime: String(item.runtime || '').slice(0, 40) });
    return clean;
  };
  // 多卡片数组（兼容旧单个字段）
  for (const key of ['doubanBooks', 'doubanMovies']) {
    const isBook = key === 'doubanBooks';
    const list = Array.isArray(ext[key]) ? ext[key].slice(0, 10) : [];
    const cleaned = [];
    for (const item of list) {
      if (!item || typeof item !== 'object' || !item.title) continue;
      cleaned.push(cleanDouban(item, isBook));
    }
    if (cleaned.length) output[key] = cleaned;
  }
  for (const key of ['doubanBook', 'doubanMovie']) {
    const item = ext[key];
    if (!item || typeof item !== 'object' || !item.title) continue;
    output[key] = cleanDouban(item, key === 'doubanBook');
  }
  return output;
}
function commentView(row) {
  return { id: Number(row.id), content: row.content, replyTo: row.reply_to, username: row.username, website: row.website, createdAt: row.created_at, updatedAt: row.updated_at, memoId: Number(row.memo_id), author: row.author };
}
async function verifyRecaptchaToken(token, config, expectedAction = '', expectedHostname = '') {
  if (!config.enableGoogleRecaptcha) return { ok: true };
  if (!config.googleSecretKey) return { ok: false, message: 'reCAPTCHA 服务端未配置' };
  if (!token) return { ok: false, message: 'token不能为空' };
  try {
    const response = await fetch('https://recaptcha.net/recaptcha/api/siteverify', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ secret: config.googleSecretKey, response: token }).toString(),
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return { ok: false, message: '人机校验服务不可用' };
    const data = await response.json();
    if (!data.success) return { ok: false, message: '人机校验不通过' };
    if (typeof data.score !== 'number' || data.score <= 0.5) return { ok: false, message: '人机校验不通过' };
    if (expectedAction && data.action !== expectedAction) return { ok: false, message: '人机校验场景不匹配' };
    if (expectedHostname && data.hostname !== expectedHostname) return { ok: false, message: '人机校验域名不匹配' };
    return { ok: true };
  } catch {
    return { ok: false, message: '人机校验服务不可用' };
  }
}
async function verifyTurnstileToken(token, config, expectedAction = '', expectedHostname = '') {
  if (!config.enableTurnstile) return { ok: true };
  if (!config.turnstileSecretKey) return { ok: false, message: 'Turnstile 服务端未配置' };
  if (!token) return { ok: false, message: 'token不能为空' };
  try {
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ secret: config.turnstileSecretKey, response: token }).toString(), signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return { ok: false, message: '人机校验服务不可用' };
    const data = await response.json();
    if (!data.success) return { ok: false, message: '人机校验不通过' };
    if (expectedAction && data.action !== expectedAction) return { ok: false, message: '人机校验场景不匹配' };
    if (expectedHostname && data.hostname !== expectedHostname) return { ok: false, message: '人机校验域名不匹配' };
    return { ok: true };
  } catch { return { ok: false, message: '人机校验服务不可用' }; }
}
async function verifyHumanToken(token, config, expectedAction = '', expectedHostname = '') {
  if (config.enableTurnstile) return verifyTurnstileToken(token, config, expectedAction, expectedHostname);
  return verifyRecaptchaToken(token, config, expectedAction, expectedHostname);
}
async function commentIdentity(request, env) {
  const existing = request.headers.get('cookie')?.match(/(?:^|;\s*)moments_comment_id=([^;]+)/)?.[1];
  const identity = existing || randomToken(20); const secret = env.LIKE_SALT || env.JWT_SECRET;
  const hash = base64url(await hmac(secret, identity)); const headers = new Headers();
  const clientIp = String(request.headers.get('cf-connecting-ip') || '').trim();
  const networkHash = clientIp ? base64url(await hmac(secret, `comment-network:${clientIp}`)) : '';
  if (!existing) headers.append('set-cookie', `moments_comment_id=${identity}; Path=/; Max-Age=604800; HttpOnly; Secure; SameSite=Lax`);
  return { hash, networkHash, headers };
}
async function addComment(request, env, headers, ctx) {
  const body = await readJson(request); if (!body?.memoId || !String(body.content || '').trim()) return json(fail('评论内容不能为空'), 400, headers);
  const config = parseConfig((await env.DB.prepare('SELECT content FROM sys_config WHERE id=1').first())?.content);
  if (!config.enableComment) return json(fail('评论未开启'), 403, headers);
  const human = await verifyHumanToken(body.token, config, 'newComment', new URL(request.url).hostname);
  if (!human.ok) return json(fail(human.message), 400, headers);
  const content = String(body.content).trim();
  const maxCommentLength = Math.max(1, Number(config.maxCommentLength) || 300);
  if (content.length > maxCommentLength) return json(fail(`评论字数超过限制长度:${maxCommentLength}`), 400, headers);
  const memo = await env.DB.prepare('SELECT * FROM memos WHERE id=?').bind(intParam(body.memoId)).first();
  if (!memo || !(await canReadMemo(memo, await currentUser(request, env)))) return json(fail('动态不存在或不可评论'), 404, headers);
  const user = await currentUser(request, env); const identity = await commentIdentity(request, env);
  if (!user) {
    const recent = identity.networkHash
      ? await env.DB.prepare("SELECT COUNT(*) AS total FROM comments WHERE (identity_hash=? OR network_hash=?) AND created_at >= datetime('now', '-1 minute')").bind(identity.hash, identity.networkHash).first()
      : await env.DB.prepare("SELECT COUNT(*) AS total FROM comments WHERE identity_hash=? AND created_at >= datetime('now', '-1 minute')").bind(identity.hash).first();
    if (Number(recent?.total || 0) >= 5) return json(fail('评论过于频繁，请稍后再试'), 429, { ...headers, ...Object.fromEntries(identity.headers) });
  }
  const website = body.website ? validHttpUrl(String(body.website)) : null;
  if (body.website && !website) return json(fail('网站地址格式错误'), 400, headers);
  const username = user ? user.nickname : String(body.username || `匿名用户_${randomToken(2)}`).trim().slice(0, 80);
  const replyCommentId = intParam(body.replyCommentId);
  let replyTo = '';
  let replyEmail = '';
  if (replyCommentId) {
    const targetComment = await env.DB.prepare('SELECT id, username, email FROM comments WHERE id=? AND memo_id=?').bind(replyCommentId, memo.id).first();
    if (!targetComment) return json(fail('回复的评论不存在'), 400, headers);
    replyTo = String(targetComment.username || '').slice(0, 80);
    replyEmail = String(targetComment.email || '').slice(0, 254);
  }
  await env.DB.prepare('INSERT INTO comments (content, reply_to, reply_email, username, email, website, memo_id, author, identity_hash, network_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(content, replyTo, replyEmail, username || '匿名用户', user ? user.email : String(body.email || '').slice(0, 254), website?.href || '', memo.id, user ? String(user.id) : '', identity.hash, user ? '' : identity.networkHash).run();
  const owner = await env.DB.prepare('SELECT nickname,email,telegram_chat_id FROM users WHERE id=?').bind(memo.user_id).first();
  // 评论者是动态作者本人时，不向作者自己发送评论通知；
  // 作者回复他人评论时，仍通知被回复人（replyEmail）。
  const selfComment = Boolean(user && Number(user.id) === Number(memo.user_id));
  if (config.enableEmail) {
    const target = replyTo ? replyEmail : owner?.email;
    // 非回复场景的通知对象即作者本人：作者自评时跳过，避免通知自己。
    if (target && config.smtpUsername && !(!replyTo && selfComment)) {
      const email = buildCommentEmail({ title: config.title, host: new URL(request.url).origin, poster: replyTo || owner.nickname, commenter: username || '匿名用户', content, memoId: memo.id, createdAt: new Date().toISOString().slice(0,19).replace('T',' ') });
      const message = { from: config.smtpUsername, to: target, ...email };
      let mailCredential = '';
      try { mailCredential = config.smtpPasswordEncrypted ? await decryptConfigSecret(config.smtpPasswordEncrypted, env.JWT_SECRET) : ''; }
      catch (error) { console.error('Mail credential decrypt failed', error); }
      const task = sendNotification(env, { ...config, mailCredential }, message).catch(error => console.error('Email notification failed', error));
      if (ctx?.waitUntil) ctx.waitUntil(task); else await task;
    }
  }
  if (config.enableTelegram && owner?.telegram_chat_id && !selfComment) {
    const botToken = config.telegramBotTokenEncrypted ? await decryptConfigSecret(config.telegramBotTokenEncrypted, env.JWT_SECRET).catch(() => '') : '';
    if (botToken) {
      const email = buildCommentEmail({ title: config.title, host: new URL(request.url).origin, poster: replyTo || owner.nickname, commenter: username || '匿名用户', content, memoId: memo.id, createdAt: new Date().toISOString().slice(0,19).replace('T',' ') });
      const telegramTask = sendTelegram({ botToken, chatId: owner.telegram_chat_id, text: `📬 ${email.subject}\n\n${email.text}` }).catch(error => console.error('Telegram notification failed', error));
      if (ctx?.waitUntil) ctx.waitUntil(telegramTask); else await telegramTask;
    }
  }
  // D1 trigger trg_comments_insert updates comment_count atomically.
  return json(ok({}), 200, { ...headers, ...Object.fromEntries(identity.headers) });
}
async function removeComment(request, env, headers) {
  const access = await requireUser(request, env, headers); if (access.response) return access.response;
  const id = intParam(new URL(request.url).searchParams.get('id')); const comment = await env.DB.prepare('SELECT c.*, m.user_id FROM comments c JOIN memos m ON m.id=c.memo_id WHERE c.id=?').bind(id).first();
  if (!comment) return json(fail('评论不存在'), 404, headers);
  if (Number(comment.user_id) !== Number(access.user.id) && Number(access.user.id) !== 1) return json(fail('没有权限'), 403, headers);
  await env.DB.prepare('DELETE FROM comments WHERE id=?').bind(id).run();
  // D1 trigger trg_comments_delete updates comment_count atomically.
  return json(ok({}), 200, headers);
}
async function listFriends(_request, env, headers) { const rows = await env.DB.prepare('SELECT * FROM friends ORDER BY created_at ASC').all(); return json(ok({ list: (rows.results || []).map(row => ({ id: Number(row.id), name: row.name, icon: row.icon, url: row.url, desc: row.description })) }), 200, headers); }
async function addFriend(request, env, headers) {
  const access = await requireUser(request, env, headers, true); if (access.response) return access.response; const body = await readJson(request);
  const url = validHttpUrl(body?.url); const icon = validHttpUrl(body?.icon); const name = String(body?.name || '').trim().slice(0, 80);
  if (!name || !url || !icon) return json(fail('请填写正确的名称、链接和图标地址'), 400, headers);
  await env.DB.prepare('INSERT INTO friends (name, icon, url, description) VALUES (?, ?, ?, ?)').bind(name, icon.href, url.href, String(body.desc || '').slice(0, 300)).run(); return json(ok({}), 200, headers);
}
async function deleteFriend(request, env, headers) { const access = await requireUser(request, env, headers, true); if (access.response) return access.response; await env.DB.prepare('DELETE FROM friends WHERE id=?').bind(intParam(new URL(request.url).searchParams.get('id'))).run(); return json(ok({}), 200, headers); }
function forbiddenHost(host) { const h = host.toLowerCase(); if (h === 'localhost' || h.endsWith('.localhost') || h === '::1') return true; if (/^127\.|^10\.|^192\.168\.|^169\.254\./.test(h)) return true; const match = h.match(/^172\.(\d+)\./); return Boolean(match && Number(match[1]) >= 16 && Number(match[1]) <= 31); }
function decodeHtml(value) {
  return String(value || '').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'").replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&#(\d+);/g, (_m, code) => String.fromCodePoint(Number(code)));
}
function metaContent(html, attribute, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    new RegExp(`<meta[^>]+${attribute}=["']${escaped}["'][^>]+content=["']([^"']*)["'][^>]*>`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+${attribute}=["']${escaped}["'][^>]*>`, 'i'),
  ];
  return decodeHtml(patterns.map(pattern => html.match(pattern)?.[1]).find(Boolean) || '').trim();
}
function selectorText(html, className) {
  const escaped = className.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = html.match(new RegExp(`<[^>]+class=["'][^"']*\\b${escaped}\\b[^"']*["'][^>]*>([\\s\\S]*?)<\\/[^>]+>`, 'i'));
  return decodeHtml((match?.[1] || '').replace(/<[^>]*>/g, '')).trim();
}
function doubanJsonLd(html) {
  for (const match of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { const value = JSON.parse(decodeHtml(match[1])); if (value && typeof value === 'object') return value; } catch {}
  }
  return {};
}
function doubanCoverPath(source) {
  const url = safeHttpHref(source, '豆瓣封面');
  return `/douban-cover?url=${encodeURIComponent(url)}`;
}
function namesFromJsonLd(value) {
  const list = Array.isArray(value) ? value : value ? [value] : [];
  return list.map(item => typeof item === 'string' ? item : item?.name).filter(Boolean).join('/');
}
function parseDoubanMovieJson(input, id) {
  const data = input && typeof input === 'object' ? input : {};
  const imageSource = data.cover_url || data.pic?.large || data.pic?.normal || data.cover?.url || '';
  const title = String(data.title || '').trim();
  if (!title || !imageSource) throw new Error('豆瓣电影 JSON 缺少标题或封面');
  const rating = data.rating && typeof data.rating === 'object' ? data.rating.value : data.rating;
  const releaseDate = Array.isArray(data.pubdate) ? data.pubdate[0] : data.release_date || data.year || '';
  const durationText = Array.isArray(data.durations) ? data.durations[0] : data.duration || '';
  const runtime = String(durationText).match(/\d+/)?.[0] || '';
  return {
    id: String(data.id || id),
    url: safeHttpHref(data.url || `https://movie.douban.com/subject/${id}/`, '豆瓣链接'),
    title: title.slice(0, 300),
    desc: String(data.intro || data.description || '').slice(0, 4000),
    image: doubanCoverPath(imageSource),
    rating: String(rating || '未知评分').slice(0, 30),
    director: namesFromJsonLd(data.directors || data.director).slice(0, 300),
    actors: namesFromJsonLd(data.actors || data.actor).slice(0, 1000),
    releaseDate: String(releaseDate).slice(0, 80),
    runtime: runtime.slice(0, 40),
  };
}
function parseDouban(html, type, id) {
  const target = `https://${type === 'book' ? 'book' : 'movie'}.douban.com/subject/${id}/`;
  const ld = doubanJsonLd(html);
  const title = metaContent(html, 'property', 'og:title') || ld.name || ld.headline || '';
  const imageSource = metaContent(html, 'property', 'og:image') || (Array.isArray(ld.image) ? ld.image[0] : ld.image) || '';
  const common = {
    id, url: target, title: String(title).slice(0, 300),
    desc: String(metaContent(html, 'property', 'og:description') || ld.description || '').slice(0, 4000),
    image: doubanCoverPath(imageSource),
    rating: selectorText(html, 'rating_num') || String(ld.aggregateRating?.ratingValue || '') || (type === 'book' ? '暂无' : '未知评分'),
  };
  if (!common.title || !imageSource) throw new Error('无法解析豆瓣页面');
  if (type === 'book') {
    const keywords = metaContent(html, 'name', 'keywords');
    return { ...common, author: metaContent(html, 'property', 'book:author'), isbn: metaContent(html, 'property', 'book:isbn'), keywords, pubDate: keywords.match(/\d{4}-\d{1,2}(?:-\d{1,2})?/)?.[0] || '' };
  }
  const releaseDate = html.match(/<span[^>]+property=["']v:initialReleaseDate["'][^>]+content=["']([^"']*)["']/i)?.[1] || '';
  const runtime = html.match(/<span[^>]+property=["']v:runtime["'][^>]+content=["']([^"']*)["']/i)?.[1] || '';
  const actors = [...html.matchAll(/<meta(?=[^>]+property=["']video:actor["'])(?=[^>]+content=["']([^"']*)["'])[^>]*>/gi)].map(match => decodeHtml(match[1])).join('/') || namesFromJsonLd(ld.actor);
  return { ...common, director: metaContent(html, 'property', 'video:director') || namesFromJsonLd(ld.director), actors, releaseDate: decodeHtml(releaseDate) || String(ld.datePublished || ''), runtime: decodeHtml(runtime) || String(ld.duration || '').replace(/^PT|M$/g, '') };
}
async function doubanInfo(request, env, headers, type) {
  const access = await requireUser(request, env, headers);
  if (access.response) return access.response;
  const id = String(new URL(request.url).searchParams.get('id') || '');
  if (!/^\d{1,20}$/.test(id)) return json(fail('豆瓣 ID 格式错误'), 400, headers);
  const fetchHeaders = { 'user-agent': 'Mozilla/5.0 (compatible; Moments-CF/1.0)', referer: 'https://m.douban.com/' };
  if (type === 'movie') {
    try {
      const apiResponse = await fetch(`https://m.douban.com/rexxar/api/v2/movie/${id}`, { redirect: 'manual', headers: fetchHeaders, signal: AbortSignal.timeout(8000) });
      if (apiResponse.ok && (apiResponse.headers.get('content-type') || '').includes('application/json')) {
        return json(ok(parseDoubanMovieJson(await apiResponse.json(), id)), 200, headers);
      }
    } catch {}
  }
  const hostname = type === 'book' ? 'book.douban.com' : 'movie.douban.com';
  const target = `https://${hostname}/subject/${id}/`;
  const response = await fetch(target, { redirect: 'manual', headers: fetchHeaders, signal: AbortSignal.timeout(8000) });
  if (!response.ok) return json(fail(`豆瓣页面暂时不可用（${response.status}）`), 502, headers);
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('text/html')) return json(fail('豆瓣返回了非网页内容'), 502, headers);
  const html = (await response.text()).slice(0, 1024 * 1024);
  try { return json(ok(parseDouban(html, type, id)), 200, headers); }
  catch { return json(fail('无法解析豆瓣页面，页面结构可能已变化'), 502, headers); }
}
async function serveDoubanCover(request) {
  const source = validHttpUrl(new URL(request.url).searchParams.get('url'));
  const allowed = source && /(^|\.)doubanio\.com$|(^|\.)douban\.com$/.test(source.hostname);
  if (!allowed) return new Response('Not Found', { status: 404 });
  try {
    const response = await fetch(source.href, {
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; Moments-CF/1.0)', referer: 'https://www.douban.com/' },
      redirect: 'manual', signal: AbortSignal.timeout(8000),
    });
    const contentType = response.headers.get('content-type') || '';
    if (!response.ok || !contentType.startsWith('image/')) return new Response('Cover unavailable', { status: 502 });
    return new Response(response.body, { headers: { 'content-type': contentType, 'cache-control': 'public, max-age=604800, stale-while-revalidate=86400', 'x-content-type-options': 'nosniff' } });
  } catch { return new Response('Cover unavailable', { status: 502 }); }
}
async function serveXMedia(request) {
  const source = validHttpUrl(new URL(request.url).searchParams.get('url'));
  if (!source || !/(^|\.)twimg\.com$/.test(source.hostname)) return new Response('Not Found', { status: 404 });
  try {
    const response = await fetch(source.href, { redirect: 'manual', signal: AbortSignal.timeout(8000) });
    const contentType = response.headers.get('content-type') || '';
    if (!response.ok || !contentType.startsWith('image/')) return new Response('X media unavailable', { status: 502 });
    return new Response(response.body, { headers: { 'content-type': contentType, 'cache-control': 'public, max-age=604800, stale-while-revalidate=86400', 'x-content-type-options': 'nosniff' } });
  } catch { return new Response('X media unavailable', { status: 502 }); }
}
async function externalInfo(request, env, headers) {
  const access = await requireUser(request, env, headers);
  if (access.response) return access.response;
  const target = validHttpUrl(new URL(request.url).searchParams.get('url')); if (!target || forbiddenHost(target.hostname)) return json(fail('不允许的链接地址'), 400, headers);
  const response = await fetch(target.href, { redirect: 'manual', headers: { 'user-agent': 'Moments-CF/1.0' }, signal: AbortSignal.timeout(5000) });
  if (response.status >= 300 && response.status < 400) return json(fail('不允许重定向链接'), 400, headers);
  const type = response.headers.get('content-type') || ''; if (!response.ok || !type.includes('text/html')) return json(fail('无法读取网页信息'), 400, headers);
  const html = (await response.text()).slice(0, 512000); const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '').replace(/<[^>]*>/g, '').trim().slice(0, 300);
  const href = html.match(/<link[^>]+rel=["'][^"']*(?:icon|shortcut icon)[^"']*["'][^>]+href=["']([^"']+)["']/i)?.[1];
  let favicon = `${target.protocol}//${target.host}/favicon.ico`; try { if (href) favicon = new URL(href, target).href; } catch {}
  return json(ok({ title, favicon }), 200, headers);
}

function requireBackupConfig(env, headers) {
  const missing = ['CLOUDFLARE_ACCOUNT_ID','D1_DATABASE_ID','D1_BACKUP_API_TOKEN'].filter(key => !env[key]);
  return missing.length ? json(fail(`备份功能未配置：${missing.join(', ')}`),503,headers) : null;
}
async function backupExportLocal(request, env, headers) {
  const access = await requireUser(request, env, headers, true);
  if (access.response) return access.response;
  const missing = requireBackupConfig(env, headers);
  if (missing) return missing;
  let result;
  try { result = await startD1Export(env); } catch { return json(fail('D1 导出启动失败，请稍后重试'), 502, headers); }
  const bookmark = result?.at_bookmark || '';
  let attempts = 0;
  while (!result?.signed_url && attempts < 30) {
    if (attempts) await new Promise(resolve => setTimeout(resolve, 2000));
    result = await pollD1Export(env, bookmark).catch(() => null);
    if (result?.status === 'error') return json(fail(result.error || 'D1 导出失败'), 502, headers);
    attempts += 1;
  }
  if (!result?.signed_url) return json(fail('D1 导出超时，请稍后重试'), 502, headers);
  const download = await fetch(result.signed_url);
  if (!download.ok) return json(fail('无法获取备份文件'), 502, headers);
  const filename = `moments-backup-${new Date().toISOString().slice(0, 10)}.sql`;
  return new Response(download.body, { headers: { 'content-type': 'application/sql', 'content-disposition': `attachment; filename="${filename}"` } });
}
async function backupList(request, env, headers) {
  const access = await requireUser(request, env, headers, true);
  if (access.response) return access.response;
  const storageConfig = await loadStorageConfig(env);
  const row = await env.DB.prepare('SELECT content FROM sys_config WHERE id=1').first();
  const config = parseConfig(row?.content);
  const retentionDays = clampInt(config.backupRetentionDays, 1, 3650, 90);
  const target = storageConfig.backupTarget;
  return json(ok({ list: await listBackups(env, target, storageConfig), retentionDays, target }), 200, headers);
}
async function backupCreate(request, env, headers) { const access=await requireUser(request,env,headers,true); if(access.response)return access.response; const missing=requireBackupConfig(env,headers); if(missing)return missing; const storageConfig=await loadStorageConfig(env); const row=await env.DB.prepare('SELECT content FROM sys_config WHERE id=1').first(); const config=parseConfig(row?.content); return json(ok(await createD1Backup(env, {}, clampInt(config.backupRetentionDays, 1, 3650, 90), storageConfig.backupTarget, storageConfig)),200,headers); }
async function backupDownload(request, env, headers) { const access=await requireUser(request,env,headers,true); if(access.response)return access.response; const key=String(new URL(request.url).searchParams.get('key')||''); if(!key.startsWith(BACKUP_PREFIX)||key.includes('..'))return json(fail('备份名称无效'),400,headers); const storageConfig=await loadStorageConfig(env); const object=await storageBackend(env, storageConfig, storageConfig.backupTarget).get(key); if(!object)return json(fail('备份不存在'),404,headers); return new Response(object.body,{headers:{'content-type':'application/sql','content-disposition':`attachment; filename="${key.split('/').pop()}"`}}); }
async function backupRestore(request, env, headers) {
  const access = await requireUser(request, env, headers, true);
  if (access.response) return access.response;
  const missing = requireBackupConfig(env, headers);
  if (missing) return missing;
  const body = await readJson(request);
  const key = String(body?.key || '');
  if (body?.confirmName !== key.split('/').pop()) return json(fail('请输入完整备份名称确认'), 400, headers);
  if (!(await passwordMatches(String(body?.password || ''), access.user.password_hash))) return json(fail('管理员密码错误'), 403, headers);
  const storageConfig = await loadStorageConfig(env);
  const row = await env.DB.prepare('SELECT content FROM sys_config WHERE id=1').first();
  const config = parseConfig(row?.content);
  const retentionDays = clampInt(config.backupRetentionDays, 1, 3650, 90);
  await createD1Backup(env, {}, retentionDays, storageConfig.backupTarget, storageConfig);
  return json(ok(await restoreD1Backup(env, key, {}, storageConfig.backupTarget, storageConfig)), 200, headers);
}

async function statusSet(request, env, headers) {
  const access = await requireUser(request, env, headers);
  if (access.response) return access.response;
  const body = await readJson(request);
  const content = String(body?.content || '').trim().slice(0, 40);
  if (!content) return json(fail('状态内容不能为空'), 400, headers);
  const icon = String(body?.icon || '').slice(0, 20);
  const remark = String(body?.remark || '').trim().slice(0, 200);
  const durationHours = clampInt(Number(body?.durationHours || 24), 1, 24 * 30, 24);
  const expiresAt = new Date(Date.now() + durationHours * 3600000).toISOString().slice(0, 19).replace('T', ' ');
  await env.DB.prepare('INSERT INTO user_status (user_id, icon, content, remark, duration_hours, expires_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP) ON CONFLICT(user_id) DO UPDATE SET icon=excluded.icon, content=excluded.content, remark=excluded.remark, duration_hours=excluded.duration_hours, expires_at=excluded.expires_at, updated_at=CURRENT_TIMESTAMP')
    .bind(access.user.id, icon, content, remark, durationHours, expiresAt).run();
  return json(ok(await userStatusView(env, access.user.id)), 200, headers);
}
async function statusClear(request, env, headers) {
  const access = await requireUser(request, env, headers);
  if (access.response) return access.response;
  await env.DB.prepare('DELETE FROM user_status WHERE user_id=?').bind(access.user.id).run();
  return json(ok({ cleared: true }), 200, headers);
}
async function statusGet(request, env, headers) {
  const userId = Number(new URL(request.url).searchParams.get('userId') || 0);
  if (!Number.isInteger(userId) || userId < 1) return json(fail('userId 无效'), 400, headers);
  return json(ok({ status: await userStatusView(env, userId) }), 200, headers);
}
async function statusList(request, env, headers) {
  const body = await readJson(request);
  const users = (Array.isArray(body?.users) ? body.users : []).map(user => ({ id: Number(user) })).filter(user => user.id > 0).slice(0, 100);
  if (!users.length) return json(ok({ statuses: {} }), 200, headers);
  await attachStatuses(env, users);
  const statuses = {};
  for (const user of users) statuses[user.id] = user.status;
  return json(ok({ statuses }), 200, headers);
}
async function migrationPreflight(request, env, headers) {
  const access = await requireUser(request, env, headers, true);
  if (access.response) return access.response;
  const body = await readJson(request);
  const manifest = body?.manifest;
  if (!manifest || manifest.format !== 'moments-cf-migration' || Number(manifest.version) !== 1) return json(fail('迁移包格式或版本不受支持'), 400, headers);
  const packageId = String(manifest.packageId || '');
  if (!/^[a-f0-9]{64}$/.test(packageId)) return json(fail('迁移包缺少有效 packageId'), 400, headers);
  const existingRun = await env.DB.prepare('SELECT status, summary FROM migration_runs WHERE package_id=?').bind(packageId).first();
  const counts = {};
  for (const [name, value] of Object.entries(manifest.tables || {})) {
    if (!Number.isInteger(Number(value)) || Number(value) < 0) return json(fail(`迁移清单数量无效：${name}`), 400, headers);
    counts[name] = Number(value);
  }
  const manifestSummary = { tables: counts, mediaCount: Number(manifest.mediaCount) || 0, mediaBytes: Number(manifest.mediaBytes) || 0 };
  if (!existingRun) {
    await env.DB.prepare("INSERT INTO migration_runs (package_id,status,summary) VALUES (?, 'importing', ?)").bind(packageId, JSON.stringify({ manifest: manifestSummary, preflight: true })).run();
  } else if (existingRun.status === 'importing') {
    const previous = migrationSummary(existingRun.summary);
    await env.DB.prepare("UPDATE migration_runs SET summary=?, updated_at=CURRENT_TIMESTAMP WHERE package_id=? AND status='importing'").bind(JSON.stringify({ ...previous, manifest: manifestSummary, preflight: true }), packageId).run();
  }
  const userCount = await env.DB.prepare('SELECT COUNT(*) AS count FROM users').first();
  const memoCount = await env.DB.prepare('SELECT COUNT(*) AS count FROM memos').first();
  const backupAvailable = Boolean(env.CLOUDFLARE_ACCOUNT_ID && env.D1_DATABASE_ID && env.D1_BACKUP_API_TOKEN);
  return json(ok({ packageId, existingRun, manifest: manifestSummary, destination: { users: Number(userCount?.count || 0), memos: Number(memoCount?.count || 0) }, backupAvailable, warnings: ['旧用户密码不会迁移，管理员密码保留本站当前密码', existingRun?.status === 'completed' ? '该迁移包已经导入完成，不能重复导入' : existingRun?.status === 'importing' ? '检测到未完成迁移，将从已记录的断点继续' : '导入过程中请保持页面开启，避免中断'] }), 200, headers);
}
function clampInt(value, min, max, fallback) {
  const n = Number(value);
  return Number.isInteger(n) && n >= min && n <= max ? n : fallback;
}
async function loadStorageConfig(env) {
  const row = await env.DB.prepare('SELECT content FROM sys_config WHERE id=1').first();
  const config = parseConfig(row?.content);
  return {
    storageType: ['r2', 's3', 'webdav'].includes(config.storageType) ? config.storageType : 'r2',
    backupTarget: ['r2', 's3', 'webdav'].includes(config.backupTarget) ? config.backupTarget : 'r2',
    s3Storage: {
      endpoint: String(config.s3Storage?.endpoint || '').trim(),
      region: String(config.s3Storage?.region || 'auto').trim() || 'auto',
      bucket: String(config.s3Storage?.bucket || '').trim(),
      accessKeyId: String(config.s3Storage?.accessKeyId || '').trim(),
      secretAccessKey: config.s3Storage?.secretAccessKeyEncrypted ? await decryptConfigSecret(config.s3Storage.secretAccessKeyEncrypted, env.JWT_SECRET).catch(() => '') : '',
    },
    webdavStorage: {
      url: String(config.webdavStorage?.url || '').trim(),
      username: String(config.webdavStorage?.username || '').trim(),
      password: config.webdavStorage?.passwordEncrypted ? await decryptConfigSecret(config.webdavStorage.passwordEncrypted, env.JWT_SECRET).catch(() => '') : '',
    },
  };
}
async function userStatusView(env, userId) {
  const row = await env.DB.prepare("SELECT icon, content, remark, duration_hours, expires_at FROM user_status WHERE user_id=? AND expires_at > datetime('now')").bind(Number(userId)).first();
  if (!row) return null;
  return { icon: row.icon || '', content: row.content, remark: row.remark || '', expiresAt: row.expires_at };
}
async function attachStatuses(env, users) {
  const ids = [...new Set(users.map(user => Number(user.id)).filter(id => id > 0))];
  if (!ids.length) return;
  const rows = await env.DB.prepare(`SELECT user_id, icon, content, remark, expires_at FROM user_status WHERE expires_at > datetime('now') AND user_id IN (${ids.map(() => '?').join(',')})`).bind(...ids).all();
  const map = new Map((rows.results || []).map(row => [Number(row.user_id), { icon: row.icon || '', content: row.content, remark: row.remark || '', expiresAt: row.expires_at }]));
  for (const user of users) user.status = map.get(Number(user.id)) || null;
}
function migrationText(value, max = 2000) { return String(value ?? '').slice(0, max); }
function migrationTime(value) { return sqliteTime(value) || sqliteTime(); }
async function migrationMapping(env, packageId, kind, sourceId) {
  return env.DB.prepare('SELECT target_id FROM migration_items WHERE package_id=? AND kind=? AND source_id=?').bind(packageId, kind, String(sourceId)).first();
}
async function saveMigrationMapping(env, packageId, kind, sourceId, targetId = null) {
  await env.DB.prepare('INSERT OR IGNORE INTO migration_items (package_id,kind,source_id,target_id) VALUES (?,?,?,?)').bind(packageId, kind, String(sourceId), targetId).run();
}
function migrationSummary(value) { try { return JSON.parse(value || '{}') || {}; } catch { return {}; } }
async function migrationPrepare(request, env, headers) {
  const access = await requireUser(request, env, headers, true);
  if (access.response) return access.response;
  const body = await readJson(request);
  if (!body?.password || !(await passwordMatches(String(body.password), access.user.password_hash))) return json(fail('管理员密码错误'), 403, headers);
  const packageId = String(body?.packageId || '');
  if (!/^[a-f0-9]{64}$/.test(packageId)) return json(fail('packageId 无效'), 400, headers);
  const existing = await env.DB.prepare('SELECT status, summary FROM migration_runs WHERE package_id=?').bind(packageId).first();
  if (existing?.status === 'completed') return json(fail('该迁移包已经导入完成'), 409, headers);
  const previous = migrationSummary(existing?.summary);
  if (existing?.status === 'importing' && previous.backupReady) return json(ok({ packageId, ready: true, resumed: true }), 200, headers);
  if (existing?.status === 'importing' && previous.backupBookmark) return json(ok({ packageId, ready: false, resumed: true, bookmark: previous.backupBookmark }), 200, headers);
  if (body?.skipBackup === true) {
    const summary = { ...previous, backupReady: true, backup: null, skipped: true, retentionDays: 90 };
    await env.DB.prepare("INSERT INTO migration_runs (package_id,status,summary) VALUES (?, 'importing', ?) ON CONFLICT(package_id) DO UPDATE SET status='importing', summary=excluded.summary, updated_at=CURRENT_TIMESTAMP").bind(packageId, JSON.stringify(summary)).run();
    return json(ok({ packageId, ready: true, resumed: false, skipped: true }), 200, headers);
  }
  const missing = requireBackupConfig(env, headers);
  if (missing) return missing;
  const row = await env.DB.prepare('SELECT content FROM sys_config WHERE id=1').first();
  const retentionDays = clampInt(parseConfig(row?.content).backupRetentionDays, 1, 3650, 90);
  const storageConfig = await loadStorageConfig(env);
  const exportResult = await startD1Export(env);
  let summary = { backupBookmark: exportResult.at_bookmark || '', backupReady: false, retentionDays, backupTarget: storageConfig.backupTarget };
  if (exportResult.signed_url) {
    summary = { ...summary, backup: await storeD1Backup(env, exportResult, retentionDays, fetch, storageConfig.backupTarget, storageConfig), backupReady: true };
  }
  if (!summary.backupBookmark && !summary.backupReady) return json(fail('D1 导出未返回 bookmark'), 502, headers);
  await env.DB.prepare("INSERT INTO migration_runs (package_id,status,summary) VALUES (?, 'importing', ?) ON CONFLICT(package_id) DO UPDATE SET status='importing', summary=excluded.summary, updated_at=CURRENT_TIMESTAMP").bind(packageId, JSON.stringify(summary)).run();
  return json(ok({ packageId, ready: summary.backupReady, resumed: false, bookmark: summary.backupBookmark }), 200, headers);
}
async function migrationBackupStatus(request, env, headers) {
  const access = await requireUser(request, env, headers, true);
  if (access.response) return access.response;
  const body = await readJson(request);
  const packageId = String(body?.packageId || '');
  if (!/^[a-f0-9]{64}$/.test(packageId)) return json(fail('packageId 无效'), 400, headers);
  const requestBookmark = String(body?.bookmark || '');
  let summary = { backupBookmark: requestBookmark, backupReady: false, retentionDays: 90 };
  if (!requestBookmark) {
    const run = await env.DB.prepare('SELECT status, summary FROM migration_runs WHERE package_id=?').bind(packageId).first();
    if (!run || run.status !== 'importing') return json(fail('迁移未准备或已经结束'), 409, headers);
    summary = migrationSummary(run.summary);
    if (summary.backupReady) return json(ok({ ready: true, backup: summary.backup }), 200, headers);
    if (!summary.backupBookmark) return json(fail('迁移备份状态无效，请重新开始'), 409, headers);
  }
  const result = await pollD1Export(env, summary.backupBookmark);
  if (result.status === 'error') return json(fail(result.error || 'D1 导出失败'), 502, headers);
  if (!result.signed_url) return json(ok({ ready: false, status: result.status || 'pending' }), 200, headers);
  const storageConfig = await loadStorageConfig(env);
  summary.backup = await storeD1Backup(env, result, clampInt(summary.retentionDays, 1, 3650, 90), fetch, summary.backupTarget || storageConfig.backupTarget, storageConfig);
  summary.backupReady = true;
  await env.DB.prepare("INSERT INTO migration_runs (package_id,status,summary) VALUES (?, 'importing', ?) ON CONFLICT(package_id) DO UPDATE SET status='importing', summary=excluded.summary, updated_at=CURRENT_TIMESTAMP").bind(packageId, JSON.stringify(summary)).run();
  return json(ok({ ready: true, backup: summary.backup }), 200, headers);
}
async function migrationImport(request, env, headers) {
  const access = await requireUser(request, env, headers, true);
  if (access.response) return access.response;
  const body = await readJson(request);
  const packageId = String(body?.packageId || '');
  if (!/^[a-f0-9]{64}$/.test(packageId)) return json(fail('packageId 无效'), 400, headers);
  const run = await env.DB.prepare('SELECT status, summary FROM migration_runs WHERE package_id=?').bind(packageId).first();
  if (!run || run.status !== 'importing') return json(fail('迁移未准备或已经结束'), 409, headers);
  if (!migrationSummary(run.summary).backupReady) return json(fail('导入前备份尚未完成，请稍候'), 409, headers);
  const kind = String(body?.kind || '');
  const rows = Array.isArray(body?.rows) ? body.rows.slice(0, 50) : [];
  if (!['users', 'memos', 'comments', 'friends', 'config'].includes(kind) || !rows.length) return json(fail('迁移批次参数错误'), 400, headers);
  if (kind === 'config') {
    if (await migrationMapping(env, packageId, 'config', '1')) return json(ok({ imported: 0 }), 200, headers);
    const old = await env.DB.prepare('SELECT content FROM sys_config WHERE id=1').first();
    const current = parseConfig(old?.content);
    let legacy = rows[0]?.content ?? rows[0] ?? {};
    if (typeof legacy === 'string') { try { legacy = JSON.parse(legacy); } catch { legacy = {}; } }
    const keys = ['title','favicon','beiAnNo','css','js','rss','enableAutoLoadNextPage','enableComment','maxCommentLength','memoMaxHeight','commentOrder','timeFormat','enableRegister','seoDescription','seoKeywords'];
    for (const key of keys) if (Object.hasOwn(legacy, key)) current[key] = legacy[key];
    current.beiAnNo = sanitizeSafeHtml(current.beiAnNo);
    current.enableS3 = false;
    current.s3 = { thumbnailSuffix: '' };
    await env.DB.prepare('UPDATE sys_config SET content=?, updated_at=CURRENT_TIMESTAMP WHERE id=1').bind(JSON.stringify(current)).run();
    await saveMigrationMapping(env, packageId, 'config', '1', 1);
    return json(ok({ imported: 1 }), 200, headers);
  }
  if (kind === 'users') {
    const userMap = {};
    let imported = 0;
    for (const row of rows) {
      const oldId = Number(row.id);
      if (!Number.isInteger(oldId) || oldId < 1) continue;
      const mapped = await migrationMapping(env, packageId, 'users', oldId);
      if (mapped) { userMap[oldId] = Number(mapped.target_id); continue; }
      if (oldId === 1) {
        userMap[oldId] = 1;
        await env.DB.prepare('UPDATE users SET nickname=?, avatar_url=?, slogan=?, cover_url=?, email=?, updated_at=? WHERE id=1').bind(migrationText(row.nickname || row.username, 80), migrationText(row.avatarUrl, 1024), migrationText(row.slogan, 300), migrationText(row.coverUrl, 1024), migrationText(row.email, 254), migrationTime(row.updatedAt)).run();
        await saveMigrationMapping(env, packageId, 'users', oldId, 1);
        imported += 1;
        continue;
      }
      const username = migrationText(row.username || `legacy_${oldId}`, 40).replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 40) || `legacy_${oldId}`;
      const existing = await env.DB.prepare('SELECT id FROM users WHERE username=?').bind(username).first();
      if (existing) {
        userMap[oldId] = Number(existing.id);
        await saveMigrationMapping(env, packageId, 'users', oldId, existing.id);
        continue;
      }
      const hash = await passwordHash(randomToken(32));
      const result = await env.DB.prepare('INSERT INTO users (username,nickname,password_hash,avatar_url,slogan,cover_url,email,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)').bind(username, migrationText(row.nickname || username, 80), hash, migrationText(row.avatarUrl || '/avatar.webp', 1024), migrationText(row.slogan, 300), migrationText(row.coverUrl || '/cover.webp', 1024), migrationText(row.email, 254), migrationTime(row.createdAt), migrationTime(row.updatedAt)).run();
      const targetId = Number(result.meta?.last_row_id || 0);
      userMap[oldId] = targetId;
      await saveMigrationMapping(env, packageId, 'users', oldId, targetId);
      imported += 1;
    }
    return json(ok({ userMap, imported }), 200, headers);
  }
  if (kind === 'memos') {
    const userMap = body.userMap || {};
    const memoMap = {};
    let imported = 0;
    for (const row of rows) {
      const oldId = Number(row.id);
      if (!Number.isInteger(oldId) || oldId < 1) continue;
      const mapped = await migrationMapping(env, packageId, 'memos', oldId);
      if (mapped) { memoMap[oldId] = Number(mapped.target_id); continue; }
      const userId = Number(userMap[String(row.userId)] || userMap[row.userId] || 1);
      const rawExt = row.ext && typeof row.ext === 'string' ? (() => { try { return JSON.parse(row.ext); } catch { return {}; } })() : (row.ext || {});
      const ext = sanitizeMemoExt(rawExt);
      const imgs = Array.isArray(row.imgs) ? row.imgs.join(',') : migrationText(row.imgs, 20000);
      const result = await env.DB.prepare('INSERT INTO memos (content,imgs,fav_count,comment_count,user_id,created_at,updated_at,location,external_url,external_title,external_favicon,pinned,ext,show_type,tags) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(migrationText(row.content, 100000), imgs, Number(row.favCount || 0), 0, userId, migrationTime(row.createdAt), migrationTime(row.updatedAt), migrationText(row.location, 500), migrationText(row.externalUrl, 2000), migrationText(row.externalTitle, 300), migrationText(row.externalFavicon || '/favicon.png', 2000), row.pinned ? 1 : 0, JSON.stringify(ext), row.showType === 0 ? 0 : 1, migrationText(Array.isArray(row.tags) ? row.tags.join(',') : row.tags, 2000)).run();
      const targetId = Number(result.meta?.last_row_id || 0);
      memoMap[oldId] = targetId;
      await saveMigrationMapping(env, packageId, 'memos', oldId, targetId);
      imported += 1;
    }
    return json(ok({ memoMap, imported }), 200, headers);
  }
  if (kind === 'comments') {
    const memoMap = body.memoMap || {};
    let imported = 0;
    for (const row of rows) {
      const oldId = Number(row.id);
      if (!Number.isInteger(oldId) || oldId < 1 || await migrationMapping(env, packageId, 'comments', oldId)) continue;
      const memoId = Number(memoMap[String(row.memoId)] || memoMap[row.memoId] || 0);
      if (!memoId) continue;
      const result = await env.DB.prepare('INSERT INTO comments (content,reply_to,reply_email,username,email,website,created_at,updated_at,memo_id,author,identity_hash) VALUES (?,?,?,?,?,?,?,?,?,?,?)').bind(migrationText(row.content, 10000), migrationText(row.replyTo, 200), migrationText(row.replyEmail, 254), migrationText(row.username, 80), migrationText(row.email, 254), migrationText(row.website, 2000), migrationTime(row.createdAt), migrationTime(row.updatedAt), memoId, migrationText(row.author, 200), '').run();
      await saveMigrationMapping(env, packageId, 'comments', oldId, Number(result.meta?.last_row_id || 0));
      imported += 1;
    }
    return json(ok({ imported }), 200, headers);
  }
  let imported = 0;
  for (const row of rows) {
    const oldId = Number(row.id);
    if (!Number.isInteger(oldId) || oldId < 1 || await migrationMapping(env, packageId, 'friends', oldId)) continue;
    const result = await env.DB.prepare('INSERT INTO friends (name,icon,url,description,created_at,updated_at) VALUES (?,?,?,?,?,?)').bind(migrationText(row.name, 120), migrationText(row.icon, 2000), migrationText(row.url, 2000), migrationText(row.desc || row.description, 1000), migrationTime(row.createdAt), migrationTime(row.updatedAt)).run();
    await saveMigrationMapping(env, packageId, 'friends', oldId, Number(result.meta?.last_row_id || 0));
    imported += 1;
  }
  return json(ok({ imported }), 200, headers);
}

async function migrationFinish(request, env, headers) {
  const access = await requireUser(request, env, headers, true);
  if (access.response) return access.response;
  const body = await readJson(request);
  const packageId = String(body?.packageId || '');
  if (!/^[a-f0-9]{64}$/.test(packageId)) return json(fail('packageId 无效'), 400, headers);
  const run = await env.DB.prepare('SELECT status, summary FROM migration_runs WHERE package_id=?').bind(packageId).first();
  if (!run || run.status !== 'importing') return json(fail('迁移未准备或已经结束'), 409, headers);
  const summary = migrationSummary(run.summary);
  const manifest = summary.manifest;
  if (!manifest || !manifest.tables) return json(fail('迁移缺少服务端预检记录，请重新预检后再完成'), 409, headers);
  const kinds = [['users.json', 'users'], ['memos.json', 'memos'], ['comments.json', 'comments'], ['friends.json', 'friends'], ['sys_config.json', 'config']];
  const mismatches = [];
  for (const [filename, kind] of kinds) {
    const expected = Number(manifest.tables[filename] || 0);
    if (!expected) continue;
    const row = await env.DB.prepare('SELECT COUNT(*) AS count FROM migration_items WHERE package_id=? AND kind=?').bind(packageId, kind).first();
    const actual = Number(row?.count || 0);
    if (actual !== expected) mismatches.push(`${filename}: 清单 ${expected}，实际完成 ${actual}`);
  }
  const expectedMedia = Number(manifest.mediaCount || 0);
  const importedMedia = Number(body?.imported?.media);
  if (!Number.isInteger(importedMedia) || importedMedia !== expectedMedia) mismatches.push(`media: 清单 ${expectedMedia}，客户端报告完成 ${Number.isFinite(importedMedia) ? importedMedia : 0}`);
  if (mismatches.length) return json(fail(`迁移尚未完成：${mismatches.join('；')}`), 409, headers);
  const completedSummary = { ...summary, finishedAt: new Date().toISOString(), completedCounts: Object.fromEntries(kinds.map(([filename, kind]) => [kind, Number(manifest.tables[filename] || 0)])), media: expectedMedia };
  await env.DB.prepare("UPDATE migration_runs SET status='completed', summary=?, updated_at=CURRENT_TIMESTAMP WHERE package_id=? AND status='importing'").bind(JSON.stringify(completedSummary), packageId).run();
  return json(ok({ packageId, completed: true }), 200, headers);
}

async function migrationFail(request, env, headers) {
  const access = await requireUser(request, env, headers, true);
  if (access.response) return access.response;
  const body = await readJson(request);
  const packageId = String(body?.packageId || '');
  if (!/^[a-f0-9]{64}$/.test(packageId)) return json(fail('packageId 无效'), 400, headers);
  await env.DB.prepare("UPDATE migration_runs SET status='failed', summary=?, updated_at=CURRENT_TIMESTAMP WHERE package_id=? AND status='importing'").bind(JSON.stringify({ failedAt: new Date().toISOString(), error: migrationText(body?.error, 1000) }), packageId).run();
  return json(ok({ packageId, failed: true }), 200, headers);
}

async function handleApi(request, env, ctx) {
  const url = new URL(request.url);
  const headers = corsHeaders(request, env);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  try {
    if (url.pathname === '/api/health') return json(ok({ ok: true, service: 'moments-cf', phase: 7, database: Boolean(env.DB), media: Boolean(env.MEDIA) }), 200, headers);
    if (request.method !== 'POST') return json(fail('仅支持 POST'), 405, headers);
    if (url.pathname === '/api/admin/initialize') return await initialize(request, env, headers);
    if (url.pathname === '/api/user/login') return await login(request, env, headers);
    if (url.pathname === '/api/user/reg') return await register(request, env, headers);
    if (url.pathname === '/api/user/status/set') return await statusSet(request, env, headers);
    if (url.pathname === '/api/user/status/clear') return await statusClear(request, env, headers);
    if (url.pathname === '/api/user/status/get') return await statusGet(request, env, headers);
    if (url.pathname === '/api/user/status/list') return await statusList(request, env, headers);
    if (url.pathname === '/api/user/profile') return await getProfile(request, env, headers);
    if (url.pathname === '/api/user/profileById') return await getProfileById(request, env, headers);
    if (url.pathname.startsWith('/api/user/profile/')) return await getProfile(request, env, headers, url.pathname.slice('/api/user/profile/'.length));
    if (url.pathname === '/api/user/saveProfile') return await saveProfile(request, env, headers);
    if (url.pathname === '/api/sysConfig/get') return await getConfig(request, env, headers);
    if (url.pathname === '/api/sysConfig/getFull') return await getConfig(request, env, headers, true);
    if (url.pathname === '/api/sysConfig/save') return await saveConfig(request, env, headers);
    if (url.pathname === '/api/file/upload') return await upload(request, env, headers);
    if (url.pathname === '/api/file/exist') return await fileExists(request, env, headers);
    if (url.pathname === '/api/file/direct/init') return await directUploadInit(request, env, headers);
    if (url.pathname === '/api/file/direct/complete') return await directUploadComplete(request, env, headers);
    if (url.pathname === '/api/file/clean') return await cleanFiles(request, env, headers);
    if (url.pathname === '/api/file/trash/list') return await listTrash(request, env, headers);
    if (url.pathname === '/api/file/trash/restore') return await restoreTrash(request, env, headers);
    if (url.pathname === '/api/file/trash/purge') return await purgeTrash(request, env, headers);
    if (url.pathname === '/api/file/s3PreSigned') return json(fail('Cloudflare 版本使用 R2 直连上传，请关闭旧 S3 设置'), 400, headers);
    if (url.pathname === '/api/memo/list') return await listMemos(request, env, headers);
    if (url.pathname === '/api/memo/preview') return await previewUnfurl(request, env, headers);
    if (url.pathname === '/api/memo/get') return await getMemo(request, env, headers);
    if (url.pathname === '/api/memo/save') return await saveMemo(request, env, headers);
    if (url.pathname === '/api/memo/remove') return await removeMemo(request, env, headers);
    if (url.pathname === '/api/memo/setPinned') return await setPinned(request, env, headers);
    if (url.pathname === '/api/memo/like') return await likeMemo(request, env, headers);
    if (url.pathname === '/api/tag/list') return await listTags(request, env, headers);
    if (url.pathname === '/api/comment/add') return await addComment(request, env, headers, ctx);
    if (url.pathname === '/api/comment/remove') return await removeComment(request, env, headers);
    if (url.pathname === '/api/friend/list') return await listFriends(request, env, headers);
    if (url.pathname === '/api/friend/add') return await addFriend(request, env, headers);
    if (url.pathname === '/api/friend/delete') return await deleteFriend(request, env, headers);
    if (url.pathname === '/api/memo/getFaviconAndTitle') return await externalInfo(request, env, headers);
    if (url.pathname === '/api/memo/getDoubanBookInfo') return await doubanInfo(request, env, headers, 'book');
    if (url.pathname === '/api/memo/getDoubanMovieInfo') return await doubanInfo(request, env, headers, 'movie');
    if (url.pathname === '/api/admin/migration/preflight') return await migrationPreflight(request, env, headers);
    if (url.pathname === '/api/admin/migration/prepare') return await migrationPrepare(request, env, headers);
    if (url.pathname === '/api/admin/migration/backup/status') return await migrationBackupStatus(request, env, headers);
    if (url.pathname === '/api/admin/migration/finish') return await migrationFinish(request, env, headers);
    if (url.pathname === '/api/admin/migration/fail') return await migrationFail(request, env, headers);
    if (url.pathname === '/api/admin/migration/import') return await migrationImport(request, env, headers);
    if (url.pathname === '/api/admin/backup/export') return await backupExportLocal(request, env, headers);
    if (url.pathname === '/api/admin/backup/list') return await backupList(request, env, headers);
    if (url.pathname === '/api/admin/backup/create') return await backupCreate(request, env, headers);
    if (url.pathname === '/api/admin/backup/download') return await backupDownload(request, env, headers);
    if (url.pathname === '/api/admin/backup/restore') return await backupRestore(request, env, headers);

    return json(fail('Cloudflare API migration endpoint not implemented yet', 404), 404, headers);
  } catch (error) {
    console.error('API error', error);
    let message = `服务暂时不可用，请稍后再试（${url.pathname}）`;
    try {
      const me = await currentUser(request, env);
      if (me && Number(me.id) === 1) {
        const safe = String(error?.message || error).slice(0, 300).replace(/https?:\/\/[^\s]+/g, '[url]');
        message = `服务暂时不可用，请稍后再试（${url.pathname}: ${safe}）`;
      }
    } catch { /* keep generic message */ }
    return json(fail(message), 503, headers);
  }
}

export { passwordHash, passwordMatches, signJwt, verifyJwt, validHttpUrl, forbiddenHost, verifyRecaptchaToken, verifyTurnstileToken, verifyHumanToken, commentView, publicUser, sanitizeMemoExt, parseGitEmbedUrl, fetchGitSnapshot, previewUnfurl, parseMemoRefUrl, memoRefSnapshot, parseXEmbedUrl, fetchXSnapshot, parseDouban, parseDoubanMovieJson, migrationPreflight, migrationPrepare, migrationImport, migrationFinish, migrationFail, BUILTIN_STATUSES, userStatusView, attachStatuses, normalizeMediaUrls };
function parseRangeHeader(header, size) {
  const match = String(header || '').match(/^bytes=(\d*)-(\d*)$/);
  if (!match) return null;
  if (!match[1] && !match[2]) return null;
  let start;
  let end;
  if (!match[1]) {
    const suffix = Number(match[2]);
    if (!Number.isInteger(suffix) || suffix <= 0) return null;
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] ? Number(match[2]) : size - 1;
  }
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || start >= size || end < start) return null;
  end = Math.min(end, size - 1);
  return { offset: start, length: end - start + 1 };
}
async function serveMedia(request, env, key) {
  if (!env.DB) return new Response('D1 binding is not configured', { status: 503 });
  const media = await env.DB.prepare("SELECT id, storage_backend FROM media WHERE (r2_key=? OR thumbnail_key=?) AND trashed_at IS NULL AND upload_state='ready'").bind(key, key).first();
  if (!media) return new Response('Not Found', { status: 404 });
  const storageConfig = await loadStorageConfig(env);
  const backendType = mediaStorageBackend(media);
  if (backendType === 'r2' && !env.MEDIA) return new Response('R2 binding is not configured', { status: 503 });
  const backend = storageBackend(env, storageConfig, backendType);
  const head = await backend.head(key);
  const reader = backend;
  if (!head) return new Response('Not Found', { status: 404 });
  const etag = head.httpEtag;
  if (request.headers.get('if-none-match') === etag) return new Response(null, { status: 304, headers: { etag } });
  const headers = new Headers();
  head.writeHttpMetadata(headers);
  // 存储元数据缺失 Content-Type 时按扩展名兜底，避免浏览器嗅探误判（防 CORB/裂图）。
  if (!headers.get('content-type')) {
    const inferred = mediaContentType(key);
    if (inferred) headers.set('content-type', inferred);
  }
  headers.set('x-content-type-options', 'nosniff');
  headers.set('etag', etag);
  headers.set('cache-control', 'public, max-age=31536000, immutable');
  headers.set('accept-ranges', 'bytes');
  if (request.method === 'HEAD') {
    headers.set('content-length', String(head.size));
    return new Response(null, { status: 200, headers });
  }
  const rangeHeader = request.headers.get('range');
  if (rangeHeader) {
    const range = parseRangeHeader(rangeHeader, head.size);
    if (!range) return new Response('Range Not Satisfiable', { status: 416, headers: { 'content-range': `bytes */${head.size}`, 'accept-ranges': 'bytes' } });
    const object = await reader.get(key, { range });
    if (!object) return new Response('Not Found', { status: 404 });
    headers.set('content-range', `bytes ${range.offset}-${range.offset + range.length - 1}/${head.size}`);
    headers.set('content-length', String(range.length));
    return new Response(object.body, { status: 206, headers });
  }
  const object = await reader.get(key);
  if (!object) return new Response('Not Found', { status: 404 });
  headers.set('content-length', String(head.size));
  return new Response(object.body, { status: 200, headers });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === '/douban-cover') return serveDoubanCover(request);
    if (url.pathname === '/x-media') return serveXMedia(request);
    if (url.pathname.startsWith('/api/')) return handleApi(request, env, ctx);
    if (url.pathname.startsWith('/upload/')) {
      const key = url.pathname.slice('/upload/'.length);
      return serveMedia(request, env, key);
    }
    // 站外资源路径容忍尾斜杠与大小写，避免落入 SPA 前端 404
    const normalizedPath = url.pathname.replace(/\/+$/, '').toLowerCase();
    if (normalizedPath === '/rss') return rss(request, env);
    if (normalizedPath === '/sitemap.xml') return sitemap(request, env);
    if (normalizedPath === '/robots.txt') return robots(request);
    if (!env.ASSETS) return new Response('Workers Assets binding is not configured', { status: 503 });
    const assetsResponse = await env.ASSETS.fetch(request);
    // SPA fallback（HTML）不缓存：避免 Cloudflare 边缘把 index.html 缓存到
    // /sitemap.xml、/rss 等动态路径，导致访问者拿到 Nuxt 404 页
    if (assetsResponse.headers.get('content-type')?.includes('text/html')) {
      const headers = new Headers(assetsResponse.headers);
      headers.set('content-type', 'text/html; charset=UTF-8');
      headers.set('cache-control', 'no-store');
      // 注入后台配置的 SEO meta，让不执行 JS 的爬虫读取到动态标题/描述/关键词
      const row = env.DB ? await env.DB.prepare('SELECT content FROM sys_config WHERE id=1').first() : null;
      const config = parseConfig(row?.content);
      const injected = injectSeoMeta(await assetsResponse.text(), config);
      return new Response(injected, { status: assetsResponse.status, headers });
    }
    // 静态资源缓存：_nuxt/ 构建产物按内容 hash 命名，可永久缓存；
    // 其它静态资源（favicon/头像/外部 js css 等）短缓存 1 天；
    // HTML 已在上方处理（no-store，SEO 动态注入）。
    if (url.pathname.startsWith('/_nuxt/')) {
      const headers = new Headers(assetsResponse.headers);
      headers.set('cache-control', 'public, max-age=31536000, immutable');
      return new Response(assetsResponse.body, { status: assetsResponse.status, headers });
    }
    if (request.method === 'GET' && assetsResponse.status === 200) {
      const headers = new Headers(assetsResponse.headers);
      headers.set('cache-control', 'public, max-age=86400');
      return new Response(assetsResponse.body, { status: assetsResponse.status, headers });
    }
    return assetsResponse;
  },
  async scheduled(_controller, env, ctx) {
    ctx.waitUntil((async () => {
      try {
        const row = await env.DB.prepare('SELECT content FROM sys_config WHERE id=1').first();
        const config = parseConfig(row?.content);
        if (config.enableD1Backup === false) return;
        const intervalDays = clampInt(config.backupIntervalDays, 1, 365, 7);
        const retentionDays = clampInt(config.backupRetentionDays, 1, 3650, 90);
        const storageConfig = await loadStorageConfig(env);
        const backups = await listBackups(env, storageConfig.backupTarget, storageConfig);
        const latest = backups[0] ? new Date(backups[0].uploaded).getTime() : 0;
        if (Date.now() - latest < intervalDays * 86400000) return;
        await createD1Backup(env, {}, retentionDays, storageConfig.backupTarget, storageConfig);
      } catch (error) { console.error('Scheduled D1 backup failed', error); }
    })());
  },
};
