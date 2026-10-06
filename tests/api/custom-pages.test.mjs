import assert from 'node:assert/strict';
import worker, { signJwt } from '../../worker/src/index.js';

/**
 * 自定义页面（custom_pages，migration 0018）集成测试：
 * - 管理接口鉴权：未登录 code 3（401）、普通用户 code 4（403）
 * - 管理员 save：断言 INSERT SQL 与全部参数；非法输入逐个 400；slug 重复 HTTP 409（body code 仍为 1）
 * - 公开 get/nav：启用页只暴露四字段（不含内部 enabled），nav 只含启用且 show_in_nav 并按 sort_order 排序
 * - remove 后公开 get 404（物理删除）
 * - 读参：page 三接口（pageGet/adminPageGet/adminPageRemove）body 优先、query 兜底，两种形态均锁定
 * - 根级 /<slug> SEO：启用页注入「页面标题 - 站点标题」+ seo_description（空时站点级回退），
 *   停用或不存在的单段路径注入 noindex（契约看输出行为，不绑实现形态）
 * - sitemap：收录启用页根级路径（monthly/0.5/lastmod=updated_at），不含停用页
 */
const JWT_SECRET = 'custom-pages-test-secret-at-least-32-chars';
const CREATED_AT = '2026-03-01 08:00:00';
const state = {
  users: {
    1: { id: 1, username: 'admin', nickname: 'Admin', token_version: 0, password_hash: 'x' },
    2: { id: 2, username: 'user', nickname: 'User', token_version: 0, password_hash: 'x' },
  },
  config: { title: '站点', seoDescription: '站点描述', siteUrl: 'https://seo.example' },
  pages: [],
  nextId: 11,
};
const queries = [];
const captured = [];

// mock D1：Statement 按 sql 关键字路由（参考 photo-delete.test.mjs），
// 写操作收集进 captured 以断言 SQL 文本与绑定参数
class Statement {
  constructor(sql) { this.sql = sql; this.args = []; queries.push(sql); }
  bind(...args) { this.args = args; return this; }
  async first() {
    const sql = this.sql.toLowerCase();
    if (sql.includes('select * from users where id')) return state.users[Number(this.args[0])] || null;
    if (sql.includes('from sys_config')) return { content: JSON.stringify(state.config) };
    if (sql.includes('select slug, title, content, seo_description from custom_pages')) {
      return state.pages.find(page => page.slug === this.args[0] && Number(page.enabled) === 1) || null;
    }
    if (sql.includes('select title, seo_description from custom_pages')) {
      return state.pages.find(page => page.slug === this.args[0] && Number(page.enabled) === 1) || null;
    }
    if (sql.includes('select * from custom_pages where id')) {
      return state.pages.find(page => page.id === Number(this.args[0])) || null;
    }
    if (sql.includes('select id from custom_pages where id')) {
      return state.pages.find(page => page.id === Number(this.args[0])) || null;
    }
    if (sql.includes('select id from custom_pages where slug = ? and id <> ?')) {
      return state.pages.find(page => page.slug === this.args[0] && page.id !== Number(this.args[1])) || null;
    }
    if (sql.includes('select id from custom_pages where slug')) {
      return state.pages.find(page => page.slug === this.args[0]) || null;
    }
    return null;
  }
  async all() {
    const sql = this.sql.toLowerCase();
    if (sql.includes('select * from custom_pages order by')) {
      const rows = [...state.pages].sort((a, b) => a.sort_order - b.sort_order || String(b.updated_at).localeCompare(String(a.updated_at)));
      return { results: rows };
    }
    if (sql.includes('select slug, title from custom_pages')) {
      const rows = state.pages
        .filter(page => Number(page.enabled) === 1 && Number(page.show_in_nav) === 1)
        .sort((a, b) => a.sort_order - b.sort_order)
        .map(row => ({ slug: row.slug, title: row.title }));
      return { results: rows };
    }
    if (sql.includes('select slug, updated_at from custom_pages')) {
      return { results: state.pages.filter(page => Number(page.enabled) === 1).map(row => ({ slug: row.slug, updated_at: row.updated_at })) };
    }
    if (sql.includes('select slug, title, seo_description from custom_pages')) {
      return { results: state.pages.filter(page => Number(page.enabled) === 1).map(row => ({ slug: row.slug, title: row.title, seo_description: row.seo_description })) };
    }
    return { results: [] };
  }
  async run() {
    const sql = this.sql;
    const lower = sql.toLowerCase();
    if (lower.startsWith('insert into custom_pages')) {
      captured.push({ sql, args: this.args });
      const row = {
        id: state.nextId++, slug: this.args[0], title: this.args[1], content: this.args[2],
        enabled: this.args[3], show_in_nav: this.args[4], sort_order: this.args[5],
        seo_description: this.args[6], created_by: this.args[7], created_at: CREATED_AT, updated_at: CREATED_AT,
      };
      state.pages.push(row);
      return { meta: { last_row_id: row.id } };
    }
    if (lower.startsWith('update custom_pages set')) {
      captured.push({ sql, args: this.args });
      const row = state.pages.find(page => page.id === Number(this.args[7]));
      if (row) Object.assign(row, { slug: this.args[0], title: this.args[1], content: this.args[2], enabled: this.args[3], show_in_nav: this.args[4], sort_order: this.args[5], seo_description: this.args[6], updated_at: CREATED_AT });
      return { meta: { changes: row ? 1 : 0 } };
    }
    if (lower.startsWith('delete from custom_pages')) {
      captured.push({ sql, args: this.args });
      const before = state.pages.length;
      state.pages = state.pages.filter(page => page.id !== Number(this.args[0]));
      return { meta: { changes: before - state.pages.length } };
    }
    throw new Error(`Unhandled SQL: ${sql}`);
  }
}

const indexHtml = `<!doctype html><html lang="zh-CN"><head>
<title>极简朋友圈</title>
<meta name="description" content="默认描述">
<meta name="keywords" content="默认关键词">
<meta property="og:site_name" content="极简朋友圈">
<meta property="og:type" content="website">
<meta property="og:title" content="极简朋友圈">
<meta property="og:description" content="默认描述">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="极简朋友圈">
<meta name="twitter:description" content="默认描述">
</head><body></body></html>`;

const env = {
  JWT_SECRET,
  DB: {
    prepare(sql) { return new Statement(sql); },
    async batch(statements) {
      for (const statement of statements) await statement.run();
      return { results: [] };
    },
  },
  ASSETS: { fetch: async () => new Response(indexHtml, { headers: { 'content-type': 'text/html' } }) },
};

const adminToken = await signJwt({ sub: '1', tv: 0, exp: Math.floor(Date.now() / 1000) + 60 }, JWT_SECRET);
const userToken = await signJwt({ sub: '2', tv: 0, exp: Math.floor(Date.now() / 1000) + 60 }, JWT_SECRET);
const post = (path, body = {}, token = '') => worker.fetch(new Request(`https://moments.example${path}`, {
  method: 'POST',
  headers: token ? { 'content-type': 'application/json', 'x-api-token': token } : { 'content-type': 'application/json' },
  body: JSON.stringify(body),
}), env);
const insertCount = () => captured.filter(entry => entry.sql.toLowerCase().startsWith('insert into custom_pages')).length;
const updateCount = () => captured.filter(entry => entry.sql.toLowerCase().startsWith('update custom_pages set')).length;

// 1) 鉴权：管理接口未登录 code 3（401）、普通用户 code 4（403）
const adminPaths = ['/api/admin/page/list', '/api/admin/page/get', '/api/admin/page/save', '/api/admin/page/remove'];
for (const path of adminPaths) {
  const anonymous = await post(path, {});
  assert.equal(anonymous.status, 401, `${path} 未登录必须 401`);
  assert.equal((await anonymous.json()).code, 3, `${path} 未登录必须 code=3`);
  const forbidden = await post(path, {}, userToken);
  assert.equal(forbidden.status, 403, `${path} 普通用户必须 403`);
  assert.equal((await forbidden.json()).code, 4, `${path} 普通用户必须 code=4`);
}
assert.equal(captured.length, 0, '鉴权失败不得产生任何写库语句');

// 2) 管理员 save 合法建页：断言 INSERT SQL 与全部参数
const saveHello = await post('/api/admin/page/save', {
  slug: 'hello', title: '页面标题', content: '# 正文', enabled: true, showInNav: true, sortOrder: 3, seoDescription: '自定义页描述',
}, adminToken);
assert.equal(saveHello.status, 200, (await saveHello.clone().json()).message);
const helloBody = await saveHello.json();
assert.equal(helloBody.code, 0);
const helloId = helloBody.data.id;
assert.equal(Number.isInteger(helloId) && helloId > 0, true, '新建必须返回自增 id');
const insert = captured.find(entry => entry.sql.toLowerCase().startsWith('insert into custom_pages'));
assert.ok(insert, '必须执行 INSERT INTO custom_pages');
assert.match(insert.sql, /^INSERT INTO custom_pages \(slug, title, content, enabled, show_in_nav, sort_order, seo_description, created_by, created_at, updated_at\)/);
assert.deepEqual(insert.args, ['hello', '页面标题', '# 正文', 1, 1, 3, '自定义页描述', 1], 'INSERT 绑定参数必须完整');

// 停用页（enabled:false）：布尔归一为 0，缺省字段落默认值
const saveDraft = await post('/api/admin/page/save', { slug: 'draft', title: '草稿页', content: '草稿内容', enabled: false }, adminToken);
assert.equal(saveDraft.status, 200);
const draftId = (await saveDraft.json()).data.id;
const draftInsert = captured.filter(entry => entry.sql.toLowerCase().startsWith('insert into custom_pages'))[1];
assert.deepEqual(draftInsert.args, ['draft', '草稿页', '草稿内容', 0, 0, 0, '', 1], 'enabled:false 必须落 0，缺省 showInNav/sortOrder/seoDescription 落默认值');

// 3) 非法输入逐个 400：大写 slug、61 字标题、保留词 rss 与 x-media、带点 slug、41 字 slug
const invalidBodies = [
  { slug: 'Hello', title: '大写' },
  { slug: 'ok', title: '标'.repeat(61) },
  { slug: 'rss', title: '保留词' },
  { slug: 'x-media', title: '保留词' },
  { slug: 'sitemap.xml', title: '带点' },
  { slug: 'a'.repeat(41), title: '超长' },
];
for (const body of invalidBodies) {
  const response = await post('/api/admin/page/save', body, adminToken);
  assert.equal(response.status, 400, `${body.slug} 必须拒绝`);
  assert.notEqual((await response.json()).code, 0);
}
assert.equal(insertCount(), 2, '非法输入不得落库');

// 4) slug 全站唯一：新建撞 slug 409；更新为他人 slug 也 409
const duplicateCreate = await post('/api/admin/page/save', { slug: 'hello', title: '另一个标题' }, adminToken);
assert.equal(duplicateCreate.status, 409);
assert.equal((await duplicateCreate.json()).code, 1, 'HTTP 409 时 body code 仍为 1（信封约定）');
const duplicateUpdate = await post('/api/admin/page/save', { id: draftId, slug: 'hello', title: '草稿改' }, adminToken);
assert.equal(duplicateUpdate.status, 409, '更新为已占用 slug 必须 409');
assert.equal((await duplicateUpdate.json()).code, 1, 'HTTP 409 时 body code 仍为 1（信封约定）');
assert.equal(updateCount(), 0, '409 时不得执行 UPDATE');

// 5) 公开 get：启用页返回四字段且不含内部 enabled；停用/不存在 404
const getHello = await post('/api/page/get?slug=hello');
assert.equal(getHello.status, 200, (await getHello.clone().json()).message);
const hello = await getHello.json();
assert.equal(hello.code, 0);
assert.deepEqual([...Object.keys(hello.data)].sort(), ['content', 'seoDescription', 'slug', 'title'], '公开视图只暴露四个字段');
assert.deepEqual(hello.data, { slug: 'hello', title: '页面标题', content: '# 正文', seoDescription: '自定义页描述' });
const getDraft = await post('/api/page/get?slug=draft');
assert.equal(getDraft.status, 404, '停用页必须 404');
const getGhost = await post('/api/page/get?slug=ghost');
assert.equal(getGhost.status, 404, '不存在的页面必须 404');
assert.equal((await post('/api/page/get?slug=')).status, 400, '空 slug 必须 400');
// 读参兼容（body 优先）：body 规范路径与空 body 双形态锁定
const getHelloByBody = await post('/api/page/get', { slug: 'hello' });
assert.equal(getHelloByBody.status, 200, (await getHelloByBody.clone().json()).message, 'body.slug 必须命中（body 规范路径）');
assert.deepEqual(await getHelloByBody.json(), { code: 0, data: { slug: 'hello', title: '页面标题', content: '# 正文', seoDescription: '自定义页描述' } }, 'body 路径必须返回完整四字段');
assert.equal((await post('/api/page/get')).status, 400, '空 body（无 query）必须 400：任何形态都拿不到 slug');

// 6) nav：只含启用且 show_in_nav 的行，按 sort_order 升序；条目只含 slug/title
for (const body of [
  { slug: 'z-early', title: '导航一', showInNav: true, sortOrder: 1 },
  { slug: 'm-nav', title: '导航二', showInNav: true, sortOrder: 2 },
  { slug: 'hidden-page', title: '隐藏页', showInNav: false },
  { slug: 'plain', title: '简单页', content: '简单内容' },
]) {
  const saved = await post('/api/admin/page/save', body, adminToken);
  assert.equal(saved.status, 200, (await saved.clone().json()).message);
  await saved.json();
}
const navResponse = await post('/api/page/nav');
assert.equal(navResponse.status, 200);
const navBody = await navResponse.json();
assert.equal(navBody.code, 0);
assert.deepEqual(navBody.data.list.map(item => item.slug), ['z-early', 'm-nav', 'hello'], 'nav 必须按 sort_order 升序');
assert.deepEqual(navBody.data.list.map(item => item.title), ['导航一', '导航二', '页面标题']);
for (const item of navBody.data.list) {
  assert.deepEqual([...Object.keys(item)].sort(), ['slug', 'title'], 'nav 条目只含 slug/title');
}
assert.equal(navBody.data.list.some(item => item.slug === 'draft'), false, '停用页不得进 nav');
assert.equal(navBody.data.list.some(item => item.slug === 'hidden-page'), false, 'show_in_nav=false 不得进 nav');

// 7) 管理端 list/get 回 camelCase 视图（含停用页），remove 后公开 get 404
const listResponse = await post('/api/admin/page/list', {}, adminToken);
assert.equal(listResponse.status, 200, (await listResponse.clone().json()).message);
const listBody = await listResponse.json();
assert.deepEqual(listBody.data.list.map(page => page.slug).sort(), ['draft', 'hello', 'hidden-page', 'm-nav', 'plain', 'z-early'], '管理列表必须含停用页');
assert.deepEqual(listBody.data.list.find(page => page.slug === 'hello'), {
  id: helloId, slug: 'hello', title: '页面标题', content: '# 正文', enabled: true, showInNav: true,
  sortOrder: 3, seoDescription: '自定义页描述', createdAt: CREATED_AT, updatedAt: CREATED_AT,
});
const adminGet = await post(`/api/admin/page/get?id=${helloId}`, {}, adminToken);
assert.equal((await adminGet.json()).data.slug, 'hello');
assert.equal((await post('/api/admin/page/get?id=9999', {}, adminToken)).status, 404);
assert.equal((await post('/api/admin/page/get', {}, adminToken)).status, 400, '缺 id 必须 400');
// 读参兼容：body 驱动的 adminPageGet（body.id 规范路径）
const adminGetByBody = await post('/api/admin/page/get', { id: helloId }, adminToken);
assert.equal((await adminGetByBody.json()).data.slug, 'hello', 'body.id 必须命中（body 规范路径）');

const saveTemp = await post('/api/admin/page/save', { slug: 'temp', title: '标'.repeat(60) }, adminToken);
assert.equal(saveTemp.status, 200, (await saveTemp.clone().json()).message, '60 字标题为合法上界');
const tempId = (await saveTemp.json()).data.id;
const removeTemp = await post(`/api/admin/page/remove?id=${tempId}`, {}, adminToken);
assert.equal(removeTemp.status, 200, (await removeTemp.clone().json()).message);
assert.equal((await removeTemp.json()).code, 0);
const removeSql = captured.filter(entry => entry.sql.toLowerCase().startsWith('delete from custom_pages')).pop();
assert.match(removeSql.sql, /^DELETE FROM custom_pages WHERE id = \?$/);
assert.deepEqual(removeSql.args, [tempId], 'remove 必须按 id 物理删除');
assert.equal((await post('/api/page/get?slug=temp')).status, 404, '删除后公开 get 必须 404');
assert.equal((await post(`/api/admin/page/get?id=${tempId}`, {}, adminToken)).status, 404);
// 读参兼容：body 驱动的 adminPageRemove（body.id 规范路径，行为与 query 形态一致）
const saveTemp2 = await post('/api/admin/page/save', { slug: 'temp-body', title: 'body 删除用例' }, adminToken);
assert.equal(saveTemp2.status, 200, (await saveTemp2.clone().json()).message);
const temp2Id = (await saveTemp2.json()).data.id;
const removeByBody = await post('/api/admin/page/remove', { id: temp2Id }, adminToken);
assert.equal(removeByBody.status, 200, (await removeByBody.clone().json()).message, 'body.id 必须删除成功（body 规范路径）');
assert.equal((await removeByBody.json()).code, 0);
assert.equal((await post('/api/page/get?slug=temp-body')).status, 404, 'body 路径删除后公开 get 必须 404');

// 8) 根级 /<slug> SEO：启用页注入「页面标题 - 站点标题」+ seo_description；停用/不存在 noindex
const pageHtmlResponse = await worker.fetch(new Request('https://seo.example/hello'), env);
assert.equal(pageHtmlResponse.status, 200);
assert.match(pageHtmlResponse.headers.get('content-type') || '', /text\/html/, '根级 slug 必须返回 HTML');
const pageHtml = await pageHtmlResponse.text();
assert.match(pageHtml, /<title>页面标题 - 站点<\/title>/, '启用页标题必须为「页面标题 - 站点标题」');
assert.match(pageHtml, /<meta name="description" content="自定义页描述">/, 'description 必须用页面 seo_description');
assert.match(pageHtml, /<meta property="og:title" content="页面标题 - 站点">/);
assert.match(pageHtml, /<meta property="og:type" content="website">/);
assert.match(pageHtml, /<link rel="canonical" href="https:\/\/seo\.example\/hello">/);
assert.doesNotMatch(pageHtml, /noindex/, '启用页不得 noindex');
assert.match(queries.find(sql => sql.includes('SELECT title, seo_description FROM custom_pages')) || '', /enabled = 1/, 'SEO 查询只允许启用页');

const plainHtml = await (await worker.fetch(new Request('https://seo.example/plain'), env)).text();
assert.match(plainHtml, /<title>简单页 - 站点<\/title>/);
assert.match(plainHtml, /<meta name="description" content="站点描述">/, 'seo_description 为空时回退站点级描述');

for (const slug of ['draft', 'ghost']) {
  const html = await (await worker.fetch(new Request(`https://seo.example/${slug}`), env)).text();
  assert.match(html, /<meta name="robots" content="noindex, nofollow">/, `${slug} 根级路径必须 noindex`);
}

// 9) sitemap：含启用页根级路径（monthly/0.5/lastmod=updated_at），不含停用页
const sitemapResponse = await worker.fetch(new Request('https://seo.example/sitemap.xml'), env);
assert.equal(sitemapResponse.status, 200);
const xml = await sitemapResponse.text();
assert.match(xml, /<url><loc>https:\/\/seo\.example\/hello<\/loc><lastmod>2026-03-01T08:00:00Z<\/lastmod><changefreq>monthly<\/changefreq><priority>0\.5<\/priority><\/url>/);
assert.match(xml, /<loc>https:\/\/seo\.example\/plain<\/loc>/);
assert.doesNotMatch(xml, /<loc>https:\/\/seo\.example\/draft<\/loc>/, '停用页不得进 sitemap');
assert.doesNotMatch(xml, /<loc>https:\/\/seo\.example\/temp<\/loc>/, '已删除页不得进 sitemap');
assert.match(queries.find(sql => sql.includes('SELECT slug, updated_at FROM custom_pages')) || '', /enabled = 1/, 'sitemap 查询只允许启用页');

console.log('Custom pages integration tests: PASS');
