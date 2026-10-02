import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import worker, { signJwt } from '../../worker/src/index.js';

/**
 * 运行时护栏：把第二轮冻结的行为常量与安全边界钉在行为层（关闭 T7-F2 记录的测试缺口）。
 *
 * 覆盖：回收站保留期 7 天 · 直传阈值 20MB · memo/list size≤50 · photo/album size≤60 ·
 * 评论默认长度 300 · 公开配置 enableSeo（含关闭后的闸门）· 回收站原图 404 守卫 ·
 * 媒体归属（原图与缩略图）· 附件单次数量硬上限 20 · enableRegisterApproval 缺省=不审批。
 *
 * 断言策略：既不做源码字符串匹配，也不让 mock 自实现 SQL 语义。这里用 node:sqlite
 * （与 D1 同为 SQLite 方言，本机 Node 24 内置）原样执行 worker/migrations/*.sql，再由
 * worker 的真实 handler 处理请求，因此 LIMIT 截断、datetime('now','-7 days') 偏移、
 * 外键级联与触发器都是引擎真值；断言只看 worker 实际决定的结果（HTTP 状态、响应字段、
 * 落库值、被调用的存储操作）。若实现把常量改错，这里会以行为差异失败，而不是被 mock 掩盖。
 */

const JWT_SECRET = 'runtime-guardrails-secret-at-least-32-characters';
const ORIGIN = 'https://moments.example';
// 动态的公开可见性要求 created_at <= CURRENT_TIMESTAMP，用「相对现在 1 天前」而不是写死日期，
// 避免在系统时钟早于该固定日期的环境里把动态误判为定时发布。
const PAST = new Date(Date.now() - 24 * 3600 * 1000).toISOString().slice(0, 19).replace('T', ' ');
const HTML = '<!doctype html><html><head><title>spa</title><meta name="description" content=""><meta name="keywords" content=""><meta property="og:site_name" content=""><meta property="og:title" content=""><meta property="og:description" content=""></head><body></body></html>';

let DatabaseSync = null;
try { ({ DatabaseSync } = await import('node:sqlite')); } catch { DatabaseSync = null; }
if (!DatabaseSync) {
  console.log('runtime-guardrails: SKIP —— 本机 Node 无 node:sqlite（需 >= 23.4），本次未执行任何护栏断言');
  process.exit(0);
}

const MIGRATION_DIR = new URL('../../worker/migrations/', import.meta.url);
const MIGRATIONS = readdirSync(MIGRATION_DIR).filter(name => name.endsWith('.sql')).sort();
assert.ok(MIGRATIONS.length >= 17, `迁移目录不完整（${MIGRATIONS.length} 个），无法建立真实 schema`);

/** D1 适配层：node:sqlite 与 Cloudflare D1 的 API 形状对齐。 */
class D1 {
  constructor(sqlite) { this.sqlite = sqlite; }
  prepare(sql) {
    const statement = this.sqlite.prepare(sql);
    const wrap = {
      args: [],
      bind(...args) {
        wrap.args = args.map(value => (value === undefined ? null : (typeof value === 'bigint' ? Number(value) : value)));
        return wrap;
      },
      async first() { const row = statement.get(...wrap.args); return row === undefined ? null : row; },
      async all() { return { results: statement.all(...wrap.args), success: true, meta: {} }; },
      async run() {
        const result = statement.run(...wrap.args);
        return { success: true, meta: { changes: Number(result.changes) || 0, last_row_id: Number(result.lastInsertRowid) || 0 } };
      },
    };
    return wrap;
  }
  async batch(statements) { const out = []; for (const statement of statements) out.push(await statement.run()); return out; }
  exec(sql) { this.sqlite.exec(sql); }
}

/** 内存版 R2 binding：记录写入与删除，供 serveMedia / clean / 附件上传使用。 */
function createMediaBinding() {
  const objects = new Map();
  const deletions = [];
  return {
    objects,
    deletions,
    async put(key, body, options = {}) {
      const buffer = body instanceof Uint8Array ? body : new Uint8Array(await new Response(body).arrayBuffer());
      objects.set(String(key), { buffer, contentType: options.httpMetadata?.contentType || 'application/octet-stream' });
    },
    async head(key) {
      const item = objects.get(String(key));
      if (!item) return null;
      return {
        size: item.buffer.byteLength,
        httpEtag: `"etag-${key}"`,
        httpMetadata: { contentType: item.contentType },
        writeHttpMetadata(headers) { headers.set('content-type', item.contentType); },
      };
    },
    async get(key) { const item = objects.get(String(key)); return item ? { body: item.buffer } : null; },
    async delete(key) { deletions.push(String(key)); objects.delete(String(key)); },
    async list() { return [...objects.keys()].map(key => ({ key })); },
  };
}

/** 建一个独立的「世界」：真实 schema + 隔离数据 + worker env。 */
async function createWorld(options = {}) {
  const sqlite = new DatabaseSync(':memory:');
  for (const name of MIGRATIONS) sqlite.exec(readFileSync(new URL(name, MIGRATION_DIR), 'utf8'));
  const run = (sql, ...args) => sqlite.prepare(sql).run(...args);
  const query = (sql, ...args) => sqlite.prepare(sql).all(...args);

  run('INSERT INTO sys_config (id, content) VALUES (1, ?)', JSON.stringify(options.config || {}));
  const users = [
    { id: 1, username: 'admin', nickname: '管理员', state: 1, email: 'admin@example.com' },
    { id: 2, username: 'alice', nickname: 'Alice', state: 1, email: 'alice@example.com' },
    { id: 3, username: 'bob', nickname: 'Bob', state: 0, email: '' },
    ...(options.extraUsers || []),
  ];
  for (const user of users) {
    run('INSERT INTO users (id, username, nickname, password_hash, registration_state, email, avatar_url, cover_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      user.id, user.username, user.nickname, user.password_hash || 'x', user.state, user.email || '', '/avatar.webp', '/cover.webp');
  }
  for (const memo of options.memos || []) {
    run('INSERT INTO memos (id, content, imgs, user_id, created_at, show_type, tags) VALUES (?, ?, ?, ?, ?, ?, ?)',
      memo.id, memo.content ?? '', memo.imgs ?? '', memo.user_id ?? 1, memo.created_at ?? PAST, memo.show_type ?? 1, memo.tags ?? '');
  }
  for (const media of options.media || []) {
    // 显式给出 id 的用例必须落库为该值（随后按 id 调整 trashed_at）；给 null 则交给 rowid 自增
    run('INSERT INTO media (id, owner_id, r2_key, original_filename, content_type, size_bytes, sha256, thumbnail_key, upload_state, storage_backend, trashed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      media.id ?? null, media.owner_id ?? 1, media.r2_key, media.original_filename ?? 'f.jpg', media.content_type ?? 'image/jpeg',
      media.size_bytes ?? 16, media.sha256 ?? null, media.thumbnail_key ?? null, media.upload_state ?? 'ready',
      media.storage_backend ?? 'r2', media.trashed_at ?? null);
  }
  for (const album of options.albums || []) {
    run('INSERT INTO photo_albums (id, name, description, is_default, sort_order) VALUES (?, ?, ?, ?, ?)',
      album.id, album.name ?? '图集', album.description ?? '', album.is_default ?? 0, album.sort_order ?? 1);
  }
  for (const item of options.albumItems || []) {
    run('INSERT INTO photo_album_items (album_id, source_type, source_ref, source_index, image_url, created_by) VALUES (?, ?, ?, ?, ?, ?)',
      item.album_id, item.source_type ?? 'upload', item.source_ref, item.source_index ?? 0, item.image_url, item.created_by ?? 1);
  }

  const mediaBinding = createMediaBinding();
  const env = {
    DB: new D1(sqlite),
    JWT_SECRET,
    MEDIA: mediaBinding,
    CLOUDFLARE_ACCOUNT_ID: 'test-account',
    R2_ACCESS_KEY_ID: 'test-access-key',
    R2_SECRET_ACCESS_KEY: 'test-secret-key',
    R2_BUCKET_NAME: 'moments-media',
    ASSETS: {
      // 每次调用都返回新 Response：body 只能读一次
      async fetch() { return new Response(HTML, { headers: { 'content-type': 'text/html; charset=UTF-8' } }); },
    },
  };
  const now = Math.floor(Date.now() / 1000);
  const tokenFor = async id => await signJwt({ sub: String(id), tv: 0, iat: now, exp: now + 3600 }, JWT_SECRET);
  const api = async (path, opts = {}) => {
    const headers = {};
    if (opts.token) headers['x-api-token'] = opts.token;
    if (opts.body !== undefined) headers['content-type'] = 'application/json';
    return worker.fetch(new Request(`${ORIGIN}${path}`, {
      method: 'POST', headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    }), env);
  };
  const json = async (path, opts) => {
    const response = await api(path, opts);
    return { response, body: await response.clone().json() };
  };
  const get = path => worker.fetch(new Request(`${ORIGIN}${path}`), env);
  const tokens = { admin: await tokenFor(1), alice: await tokenFor(2) };
  return { sqlite, run, query, env, mediaBinding, tokenFor, tokens, api, json, get };
}

const guards = [];
const guard = async (name, fn) => {
  try { await fn(); guards.push({ name, ok: true }); }
  catch (error) { guards.push({ name, ok: false, detail: String(error?.message ?? error).split('\n')[0] }); }
};

// ---------------------------------------------------------------------------
// 1. 回收站保留期 = 7 天（TRASH_RETENTION_DAYS），且只清超过保留期的项
// ---------------------------------------------------------------------------
await guard('回收站保留期 = 7 天，且只清超过 7 天的已回收媒体', async () => {
  const world = await createWorld({
    media: [
      { id: 11, r2_key: 'media/old.jpg' },
      { id: 12, r2_key: 'media/recent.jpg' },
    ],
  });
  world.run("UPDATE media SET trashed_at = datetime('now', ?) WHERE id = ?", '-8 days', 11);
  world.run("UPDATE media SET trashed_at = datetime('now', ?) WHERE id = ?", '-6 days', 12);

  const clean = await world.json('/api/file/clean', { token: world.tokens.admin });
  assert.equal(clean.response.status, 200, `clean 应为 200，实际 ${clean.response.status}`);
  assert.equal(clean.body.data.retentionDays, 7, 'clean 必须回报 7 天保留期');
  assert.equal(clean.body.data.purged, 1, `应只清除 1 个过期项，实际 ${clean.body.data.purged}`);

  const remaining = world.query('SELECT id FROM media ORDER BY id').map(row => row.id);
  assert.deepEqual(remaining, [12], `8 天前的必须清除、6 天前的必须保留，实际剩余 ${remaining.join(',')}`);
  assert.deepEqual(world.mediaBinding.deletions, ['media/old.jpg'], '过期媒体必须调用存储后端删除物理对象');

  const trash = await world.json('/api/file/trash/list', { token: world.tokens.admin });
  assert.equal(trash.body.data.retentionDays, 7, '回收站列表必须与 clean 回报同一保留期');
});

// ---------------------------------------------------------------------------
// 2. 直传阈值 = 20MB
// ---------------------------------------------------------------------------
await guard('直传阈值 = 20MB（阈值内外与 500MB 硬上限）', async () => {
  const world = await createWorld({ config: { storageType: 'r2' } });
  const init = size => world.json('/api/file/direct/init', {
    token: world.tokens.admin,
    body: { filename: 'big.jpg', contentType: 'image/jpeg', size, sha256: 'a'.repeat(64) },
  });

  const below = await init(20 * 1024 * 1024 - 1);
  assert.equal(below.response.status, 200, `阈值下方应 200，实际 ${below.response.status}`);
  assert.equal(below.body.data.direct, false, '19.999…MB 不得标记为直传');

  const at = await init(20 * 1024 * 1024);
  assert.equal(at.response.status, 200, `阈值处应 200，实际 ${at.response.status}`);
  assert.equal(at.body.data.direct, true, '正好 20MB 必须标记为直传');

  const tooBig = await init(500 * 1024 * 1024 + 1);
  assert.equal(tooBig.response.status, 400, '超过 500MB 硬上限必须拒绝');
});

// ---------------------------------------------------------------------------
// 3. memo/list 的 size 上限 = 50
// ---------------------------------------------------------------------------
await guard('memo/list 的 size 上限 = 50（请求 1000 只返回 50 条）', async () => {
  const memos = Array.from({ length: 60 }, (_, index) => ({ id: 100 + index, content: `memo ${index}`, user_id: 1 }));
  memos.push({ id: 999, content: '待审批用户的动态', user_id: 3 });
  const world = await createWorld({ memos });

  const big = await world.json('/api/memo/list', { body: { page: 1, size: 1000 } });
  assert.equal(big.body.data.total, 60, `未批准用户的动态不得计入总数，实际 ${big.body.data.total}`);
  assert.equal(big.body.data.list.length, 50, `size 上限应为 50，实际返回 ${big.body.data.list.length}`);
  assert.equal(big.body.data.hasNext, true, '被上限截断后必须还有下一页');

  const small = await world.json('/api/memo/list', { body: { page: 2, size: 5 } });
  assert.equal(small.body.data.list.length, 5, '请求值小于上限时必须按请求值返回');
});

// ---------------------------------------------------------------------------
// 4. photo/album 的 size 上限 = 60
// ---------------------------------------------------------------------------
await guard('photo/album 的 size 上限 = 60（请求 1000 只返回 60 条）', async () => {
  const albumItems = Array.from({ length: 70 }, (_, index) => ({
    album_id: 7, source_type: 'upload',
    source_ref: `/upload/media/album/${index}.jpg`, image_url: `/upload/media/album/${index}.jpg`,
  }));
  const world = await createWorld({ albums: [{ id: 7, name: '精选' }], albumItems });

  const first = await world.json('/api/photo/album', { body: { id: 7, page: 1, size: 1000 } });
  assert.equal(first.response.status, 200, `图集接口应 200，实际 ${first.response.status}`);
  assert.equal(first.body.data.total, 70, 'total 必须是图集真实条目数');
  assert.equal(first.body.data.list.length, 60, `size 上限应为 60，实际返回 ${first.body.data.list.length}`);
  assert.equal(first.body.data.hasNext, true, '被上限截断后必须还有下一页');

  const second = await world.json('/api/photo/album', { body: { id: 7, page: 2, size: 60 } });
  assert.equal(second.body.data.list.length, 10, '第二页应返回剩余 10 条');
});

// ---------------------------------------------------------------------------
// 5. 评论默认长度 = 300，且后台配置优先
// ---------------------------------------------------------------------------
await guard('评论长度默认上限 = 300，配置值优先', async () => {
  const memo = { id: 101, content: 'memo', user_id: 1 };
  const world = await createWorld({ config: { enableComment: true }, memos: [memo] });
  const tooLong = await world.json('/api/comment/add', { token: world.tokens.admin, body: { memoId: 101, content: 'x'.repeat(301) } });
  assert.equal(tooLong.response.status, 400, '301 字必须被拒绝');
  assert.match(String(tooLong.body.message), /300/, `拒绝原因必须写明默认上限 300，实际「${tooLong.body.message}」`);
  assert.equal(world.query('SELECT COUNT(*) AS n FROM comments')[0].n, 0, '被拒绝的评论不得落库');

  const atLimit = await world.json('/api/comment/add', { token: world.tokens.admin, body: { memoId: 101, content: 'y'.repeat(300) } });
  assert.equal(atLimit.response.status, 200, `正好 300 字必须通过，实际 ${atLimit.response.status}`);
  assert.equal(world.query('SELECT COUNT(*) AS n FROM comments')[0].n, 1, '通过校验的评论必须落库');

  const custom = await createWorld({ config: { enableComment: true, maxCommentLength: 5 }, memos: [memo] });
  const overridden = await custom.json('/api/comment/add', { token: custom.tokens.admin, body: { memoId: 101, content: 'z'.repeat(6) } });
  assert.equal(overridden.response.status, 400, '配置上限更小时必须按配置拒绝');
  assert.match(String(overridden.body.message), /5/, `拒绝原因必须写明配置值，实际「${overridden.body.message}」`);
});

// ---------------------------------------------------------------------------
// 6. 公开配置暴露 enableSeo + 关闭后的闸门
// ---------------------------------------------------------------------------
await guard('公开配置暴露 enableSeo（默认开），关闭后 sitemap/robots/llms/页面同步收紧', async () => {
  const on = await createWorld({});
  const onConfig = await on.json('/api/sysConfig/get', {});
  assert.ok('enableSeo' in onConfig.body.data, '公开配置必须包含 enableSeo（前端运行时同步 noindex 依赖它）');
  assert.equal(onConfig.body.data.enableSeo, true, 'SEO 总开关必须默认为开');
  assert.equal(onConfig.body.data.maxCommentLength, 300, '评论默认长度属于公开配置（前端同步依赖）');

  const off = await createWorld({ config: { enableSeo: false }, memos: [{ id: 101, content: '正文', user_id: 1 }] });
  const offConfig = await off.json('/api/sysConfig/get', {});
  assert.equal(offConfig.body.data.enableSeo, false, '关闭后公开配置必须为 false');
  assert.equal((await off.get('/sitemap.xml')).status, 404, '关闭后 sitemap 必须 404');
  assert.equal((await off.get('/llms.txt')).status, 404, '关闭后 llms.txt 必须 404');
  assert.equal((await off.get('/llms-full.txt')).status, 404, '关闭后 llms-full.txt 必须 404');
  assert.match(await (await off.get('/robots.txt')).text(), /User-agent: \*\nDisallow: \/\n/, '关闭后 robots 必须全站禁止抓取');
  assert.match(await (await off.get('/memo/101')).text(), /noindex/, '关闭后页面必须注入 noindex');
});

// ---------------------------------------------------------------------------
// 7. 回收站原图 404 守卫（缩略图放行给回收站预览）
// ---------------------------------------------------------------------------
await guard('回收站原图 404、其缩略图放行、正常媒体可读', async () => {
  const world = await createWorld({
    media: [
      { id: 21, r2_key: 'media/gone.jpg', thumbnail_key: 'thumbs/gone.webp', trashed_at: '2026-09-01 00:00:00' },
      { id: 22, r2_key: 'media/live.jpg', thumbnail_key: null },
    ],
  });
  world.mediaBinding.objects.set('media/gone.jpg', { buffer: new Uint8Array([1, 2, 3]), contentType: 'image/jpeg' });
  world.mediaBinding.objects.set('thumbs/gone.webp', { buffer: new Uint8Array([4, 5]), contentType: 'image/webp' });
  world.mediaBinding.objects.set('media/live.jpg', { buffer: new Uint8Array([6, 7, 8]), contentType: 'image/jpeg' });

  assert.equal((await world.get('/upload/media/gone.jpg')).status, 404, '回收站中的原图必须 404');
  assert.equal((await world.get('/upload/thumbs/gone.webp')).status, 200, '回收站媒体的缩略图必须放行（回收站列表预览依赖）');
  assert.equal((await world.get('/upload/media/unknown.jpg')).status, 404, '库中不存在的对象必须 404');

  const live = await world.get('/upload/media/live.jpg');
  assert.equal(live.status, 200, '正常媒体必须可读');
  assert.equal(live.headers.get('x-content-type-options'), 'nosniff', '媒体响应必须禁止内容嗅探');
  assert.equal(live.headers.get('content-length'), '3', '必须回传真实对象长度');
});

// ---------------------------------------------------------------------------
// 8. 媒体归属：原图与缩略图都必须属于当前用户且未回收
// ---------------------------------------------------------------------------
await guard('媒体归属：他人原图 / 他人缩略图 / 自己已回收的媒体都不得写入动态', async () => {
  const world = await createWorld({
    memos: [{ id: 900, content: '既有动态', user_id: 1 }],
    media: [
      { id: 31, owner_id: 2, r2_key: 'media/alice.jpg', thumbnail_key: 'thumbs/alice.webp' },
      { id: 32, owner_id: 1, r2_key: 'media/admin.jpg', thumbnail_key: 'thumbs/admin.webp' },
      { id: 33, owner_id: 1, r2_key: 'media/trashed.jpg', trashed_at: '2026-09-01 00:00:00' },
    ],
  });
  const save = imgs => world.json('/api/memo/save', { token: world.tokens.admin, body: { content: '带图动态', imgs } });
  const before = world.query('SELECT COUNT(*) AS n FROM memos')[0].n;

  const foreign = await save(['/upload/media/alice.jpg']);
  assert.equal(foreign.response.status, 403, `不得引用他人原图，实际 ${foreign.response.status}`);
  const foreignThumb = await save(['/upload/thumbs/alice.webp']);
  assert.equal(foreignThumb.response.status, 403, `不得借用他人缩略图地址，实际 ${foreignThumb.response.status}`);
  const trashed = await save(['/upload/media/trashed.jpg']);
  assert.equal(trashed.response.status, 403, `已回收媒体不得再次引用，实际 ${trashed.response.status}`);
  assert.equal(world.query('SELECT COUNT(*) AS n FROM memos')[0].n, before, '被拒绝的保存不得落库');

  const own = await save(['/upload/media/admin.jpg', '/upload/thumbs/admin.webp']);
  assert.equal(own.response.status, 200, `自己的原图与缩略图必须可保存，实际 ${own.response.status}`);
  const stored = world.query('SELECT imgs FROM memos WHERE user_id=1 ORDER BY id DESC LIMIT 1')[0].imgs;
  assert.match(String(stored), /media\/admin\.jpg/, `保存后 imgs 必须包含自己的原图，实际「${stored}」`);
  assert.equal(world.query('SELECT COUNT(*) AS n FROM memos')[0].n, before + 1, '成功保存必须新增动态');
});

// ---------------------------------------------------------------------------
// 9. 附件单次数量硬上限 = 20
// ---------------------------------------------------------------------------
await guard('附件单次数量硬上限 = 20（超过即整体拒绝，配置也不能保存到超过上限）', async () => {
  const makeFiles = count => Array.from({ length: count }, (_, index) => new File([`payload-${index}`], `note-${index}.txt`, { type: 'text/plain' }));
  const upload = (world, count) => {
    const form = new FormData();
    for (const file of makeFiles(count)) form.append('files', file);
    return worker.fetch(new Request(`${ORIGIN}/api/file/attachment`, {
      method: 'POST', headers: { 'x-api-token': world.tokens.admin }, body: form,
    }), world.env);
  };

  const world = await createWorld({ config: { storageType: 'r2', attachmentMaxSize: 1, attachmentMaxCount: 20 } });
  const tooMany = await upload(world, 21);
  assert.equal(tooMany.status, 400, `21 个附件必须整体拒绝，实际 ${tooMany.status}`);
  assert.match(String((await tooMany.json()).message), /20/, '拒绝原因必须写明单次上限 20');
  assert.equal(world.query('SELECT COUNT(*) AS n FROM media')[0].n, 0, '被拒绝的附件不得落库');

  const accepted = await upload(world, 20);
  assert.equal(accepted.status, 200, `20 个附件必须接受，实际 ${accepted.status}`);
  assert.equal(world.query('SELECT COUNT(*) AS n FROM media')[0].n, 20, '20 个附件必须全部落库');

  const saveWorld = await createWorld({ config: { storageType: 'r2' } });
  const save = value => saveWorld.json('/api/sysConfig/save', { token: saveWorld.tokens.admin, body: { adminUserName: 'admin', attachmentMaxCount: value } });
  const persisted = () => JSON.parse(saveWorld.query('SELECT content FROM sys_config WHERE id=1')[0].content).attachmentMaxCount;
  const overflow = await save(100);
  assert.equal(overflow.response.status, 200, `保存配置应成功，实际 ${overflow.response.status}`);
  assert.ok(Number(persisted()) <= 20, `落库的附件数量上限必须 <= 20，实际 ${persisted()}`);
  await save(20);
  assert.equal(Number(persisted()), 20, '合法的上限 20 必须原样保留');
});

// ---------------------------------------------------------------------------
// 10. enableRegisterApproval 缺省 = 不审批
// ---------------------------------------------------------------------------
await guard('enableRegisterApproval 缺省 = 不审批（注册即生效能登录），开启后必须待审批', async () => {
  const world = await createWorld({ config: { enableRegister: true } });
  const registered = await world.json('/api/user/reg', {
    body: { username: 'newbie', password: 'password123', repeatPassword: 'password123', email: 'newbie@example.com' },
  });
  assert.equal(registered.response.status, 201, `缺省注册应直接建号，实际 ${registered.response.status}`);
  assert.equal(registered.body.data.awaitingApproval, false, '缺省不得进入待审批');
  assert.equal(world.query('SELECT registration_state FROM users WHERE username = ?', 'newbie')[0].registration_state, 1, '缺省注册必须落库为已批准');
  const login = await world.json('/api/user/login', { body: { username: 'newbie', password: 'password123' } });
  assert.equal(login.response.status, 200, `缺省注册的账号必须能立即登录，实际 ${login.response.status}`);

  const gated = await createWorld({ config: { enableRegister: true, enableRegisterApproval: true } });
  const noReason = await gated.json('/api/user/reg', {
    body: { username: 'pending1', password: 'password123', repeatPassword: 'password123', email: '' },
  });
  assert.equal(noReason.response.status, 400, '开启审批后未填注册理由必须拒绝');
  const withReason = await gated.json('/api/user/reg', {
    body: { username: 'pending1', password: 'password123', repeatPassword: 'password123', email: '', reason: '想记录生活' },
  });
  assert.equal(withReason.response.status, 202, `开启审批后应进入待审批，实际 ${withReason.response.status}`);
  assert.equal(withReason.body.data.awaitingApproval, true, '响应必须标记待审批');
  assert.equal(gated.query('SELECT registration_state FROM users WHERE username = ?', 'pending1')[0].registration_state, 0, '待审批用户必须落库为 state 0');
  const blocked = await gated.json('/api/user/login', { body: { username: 'pending1', password: 'password123' } });
  assert.equal(blocked.response.status, 403, '待审批账号不得登录');
});

for (const item of guards) console.log(`${item.ok ? 'PASS' : 'FAIL'}  ${item.name}${item.ok ? '' : `  —— ${item.detail}`}`);
const failed = guards.filter(item => !item.ok);
console.log(`runtime-guardrails: ${guards.length - failed.length}/${guards.length} 项行为护栏通过`);
if (failed.length) {
  console.log('FAILED:', failed.map(item => item.name).join(' | '));
  process.exitCode = 1;
} else {
  console.log('runtime-guardrails: PASS');
}
