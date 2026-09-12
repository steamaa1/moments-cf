import assert from 'node:assert/strict';
import worker from '../../worker/src/index.js';

/**
 * 页面级 SEO 注入（/memo/:id、/user/:id）：
 * - Worker 对不执行 JS 的爬虫注入该页专属 title/描述/og:image 与 JSON-LD 结构化数据
 * - 私密/定时未发布/不存在的动态与用户页注入 noindex
 * - D1 未配置时回退站点级 meta
 */
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

const config = { title: '站点', seoDescription: '站点描述', siteUrl: 'https://seo.example' };
const publicMemo = { id: 7, content: '公开动态的正文内容', imgs: '/upload/pic.jpg', user_id: 1, username: 'admin', nickname: '小明', avatar_url: '', slogan: '', cover_url: '', created_at: '2026-01-01 00:00:00', updated_at: '2026-01-02 00:00:00', location: '', external_url: '', external_title: '', external_favicon: '', pinned: 0, ext: '{}', show_type: 1, tags: '日常', fav_count: 0, comment_count: 0 };
const privateMemo = { ...publicMemo, id: 8, show_type: 0 };
const futureMemo = { ...publicMemo, id: 9, created_at: '2999-01-01 00:00:00' };
const userRow = { id: 1, username: 'admin', nickname: '小明', avatar_url: '/upload/avatar.jpg', slogan: '个人签名' };

const makeDb = (memo, user) => ({
  prepare(sql) {
    const statement = {
      bind() { return statement; },
      async all() { return { results: [] }; },
      async first() {
        if (sql.includes('FROM sys_config')) return { content: JSON.stringify(config) };
        if (sql.includes('WHERE m.id = ?')) return memo;
        if (sql.includes('FROM users WHERE id = ?')) return user;
        return null;
      },
    };
    return statement;
  },
});
const assets = { fetch: async () => new Response(indexHtml, { headers: { 'content-type': 'text/html' } }) };

// 1) 公开动态页：页面级 meta + JSON-LD
{
  const response = await worker.fetch(new Request('https://seo.example/memo/7'), { DB: makeDb(publicMemo, userRow), ASSETS: assets });
  const html = await response.text();
  assert.equal(response.status, 200);
  assert.match(html, /<title>小明 的动态<\/title>/);
  assert.match(html, /<meta name="description" content="公开动态的正文内容">/);
  assert.match(html, /<meta property="og:type" content="article">/);
  assert.match(html, /<meta property="og:image" content="https:\/\/seo\.example\/upload\/pic\.jpg">/);
  assert.match(html, /<meta name="twitter:card" content="summary_large_image">/);
  assert.match(html, /<link rel="canonical" href="https:\/\/seo\.example\/memo\/7">/);
  const ld = html.match(/<script type="application\/ld\+json">([^<]*)<\/script>/)?.[1] || '';
  assert.match(ld, /SocialMediaPosting/);
  assert.match(ld, /"datePublished":"2026-01-01T00:00:00Z"/);
  assert.match(ld, /"dateModified":"2026-01-02T00:00:00Z"/);
  assert.match(ld, /"author":\{"@type":"Person","name":"小明"\}/);
  assert.match(ld, /"inLanguage":"zh-CN"/);
  assert.doesNotMatch(html, /noindex/, '公开动态不注入 noindex');
}

// 2) 私密动态（show_type=0）→ noindex
{
  const response = await worker.fetch(new Request('https://seo.example/memo/8'), { DB: makeDb(privateMemo, userRow), ASSETS: assets });
  const html = await response.text();
  assert.match(html, /<meta name="robots" content="noindex, nofollow">/);
}

// 3) 定时未发布动态（未来时间）→ noindex
{
  const response = await worker.fetch(new Request('https://seo.example/memo/9'), { DB: makeDb(futureMemo, userRow), ASSETS: assets });
  const html = await response.text();
  assert.match(html, /<meta name="robots" content="noindex, nofollow">/);
}

// 4) 动态不存在 → noindex
{
  const response = await worker.fetch(new Request('https://seo.example/memo/999'), { DB: makeDb(null, userRow), ASSETS: assets });
  const html = await response.text();
  assert.match(html, /<meta name="robots" content="noindex, nofollow">/);
}

// 5) 用户主页：ProfilePage JSON-LD + profile og:type
{
  const response = await worker.fetch(new Request('https://seo.example/user/1'), { DB: makeDb(null, userRow), ASSETS: assets });
  const html = await response.text();
  assert.match(html, /<title>小明 的主页<\/title>/);
  assert.match(html, /<meta property="og:type" content="profile">/);
  const ld = html.match(/<script type="application\/ld\+json">([^<]*)<\/script>/)?.[1] || '';
  assert.match(ld, /ProfilePage/);
  assert.match(ld, /"@type":"Person"/);
  assert.match(ld, /"url":"https:\/\/seo\.example\/user\/1"/);
  assert.match(ld, /"image":"https:\/\/seo\.example\/upload\/avatar\.jpg"/);
}

// 6) 用户不存在 → noindex
{
  const response = await worker.fetch(new Request('https://seo.example/user/999'), { DB: makeDb(null, null), ASSETS: assets });
  const html = await response.text();
  assert.match(html, /<meta name="robots" content="noindex, nofollow">/);
}

// 7) 首页：WebSite JSON-LD + 相对 og:image 绝对化
{
  const response = await worker.fetch(new Request('https://seo.example/'), { DB: makeDb(null, null), ASSETS: assets });
  const html = await response.text();
  const ld = html.match(/<script type="application\/ld\+json">([^<]*)<\/script>/)?.[1] || '';
  assert.match(ld, /"@type":"WebSite"/);
  assert.match(ld, /"inLanguage":"zh-CN"/);
  assert.match(html, /<meta property="og:type" content="website">/);
  assert.doesNotMatch(html, /noindex/, '首页不注入 noindex');
}

// 8) D1 未配置：回退站点级 meta，不注入页面级内容
{
  const response = await worker.fetch(new Request('https://seo.example/memo/7'), { ASSETS: assets });
  const html = await response.text();
  assert.match(html, /<title>极简朋友圈<\/title>/, '无 DB 无配置源，回退默认文案');
  assert.doesNotMatch(html, /站点描述/, '无 DB 读不到后台 SEO 配置');
  assert.doesNotMatch(html, /ld\+json/, '无 DB 不注入 JSON-LD');
  assert.doesNotMatch(html, /noindex/);
}

console.log('SEO page-level meta injection tests: PASS');
