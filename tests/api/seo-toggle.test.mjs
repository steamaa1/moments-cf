import assert from 'node:assert/strict';
import worker from '../../worker/src/index.js';

/**
 * SEO 总开关（sys_config.enableSeo，默认开）：
 * - 开启：页面级 meta/JSON-LD、sitemap、robots（含 Sitemap 行）、llms 摘要全部正常
 * - 关闭：所有页面注入 noindex 且不再输出 canonical/JSON-LD；robots 全站禁止抓取；
 *         sitemap.xml 与 llms.txt / llms-full.txt 返回 404
 * - 老配置缺该字段时必须视为开启，保证升级后行为不变
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

const memoRow = {
  id: 7, content: '公开动态的正文内容', imgs: '/upload/pic.jpg', user_id: 1, username: 'admin',
  nickname: '小明', avatar_url: '', slogan: '', cover_url: '', created_at: '2026-01-01 00:00:00',
  updated_at: '2026-01-02 00:00:00', location: '', external_url: '', external_title: '',
  external_favicon: '', pinned: 0, ext: '{}', show_type: 1, tags: '日常', fav_count: 0, comment_count: 0,
};

const makeEnv = enableSeo => {
  const config = { title: '站点', seoDescription: '站点描述', siteUrl: 'https://seo.example' };
  // enableSeo === undefined 时 JSON 不含该键，用于验证老配置的兼容行为
  if (enableSeo !== undefined) config.enableSeo = enableSeo;
  return {
    DB: {
      prepare(sql) {
        const statement = {
          bind() { return statement; },
          async all() {
            if (sql.includes('u.tags')) return { results: [{ username: 'admin', tags: '日常' }] };
            if (sql.includes('FROM memos')) return { results: [memoRow] };
            if (sql.includes('FROM users')) return { results: [{ id: 1, updated_at: '2026-01-02 00:00:00' }] };
            return { results: [] };
          },
          async first() {
            if (sql.includes('FROM sys_config')) return { content: JSON.stringify(config) };
            if (sql.includes('WHERE m.id = ?')) return memoRow;
            return null;
          },
        };
        return statement;
      },
    },
    ASSETS: { fetch: async () => new Response(indexHtml, { headers: { 'content-type': 'text/html' } }) },
  };
};

const htmlOf = async (path, env) => await (await worker.fetch(new Request(`https://seo.example${path}`), env)).text();
const statusOf = async (path, env) => (await worker.fetch(new Request(`https://seo.example${path}`), env)).status;

// 1) 开启（显式 true）：SEO 全链路正常
{
  const env = makeEnv(true);
  const memoHtml = await htmlOf('/memo/7', env);
  assert.doesNotMatch(memoHtml, /noindex/, '开启时不得注入 noindex');
  assert.match(memoHtml, /<link rel="canonical" href="https:\/\/seo\.example\/memo\/7">/, '开启时必须输出 canonical');
  assert.match(memoHtml, /application\/ld\+json/, '开启时必须输出 JSON-LD');
  assert.equal(await statusOf('/sitemap.xml', env), 200);
  assert.match(await htmlOf('/sitemap.xml', env), /<urlset/);
  const robots = await htmlOf('/robots.txt', env);
  assert.match(robots, /Allow: \//, '开启时 robots 允许抓取公开页');
  assert.match(robots, /Sitemap: https:\/\/seo\.example\/sitemap\.xml/, '开启时 robots 指向 sitemap');
  assert.equal(await statusOf('/llms.txt', env), 200);
  assert.match(await htmlOf('/llms.txt', env), /# 站点/);
}

// 2) 关闭：全站 noindex、robots 全禁、sitemap 与 llms 404
{
  const env = makeEnv(false);
  const memoHtml = await htmlOf('/memo/7', env);
  assert.match(memoHtml, /<meta name="robots" content="noindex, nofollow">/, '关闭时动态页必须 noindex');
  assert.doesNotMatch(memoHtml, /rel="canonical"/, '关闭时不得再输出 canonical');
  assert.doesNotMatch(memoHtml, /application\/ld\+json/, '关闭时不得再输出 JSON-LD');
  assert.match(await htmlOf('/', env), /noindex/, '关闭时首页同样 noindex');
  assert.match(await htmlOf('/about', env), /noindex/, '关闭时其余公开页同样 noindex');
  assert.equal(await statusOf('/sitemap.xml', env), 404, '关闭时 sitemap 必须 404');
  const robots = await htmlOf('/robots.txt', env);
  assert.match(robots, /User-agent: \*\nDisallow: \/\n/, '关闭时 robots 必须全站禁止');
  assert.doesNotMatch(robots, /Sitemap:/, '关闭时 robots 不得再指向 sitemap');
  assert.equal(await statusOf('/llms.txt', env), 404, '关闭时 llms.txt 必须 404');
  assert.equal(await statusOf('/llms-full.txt', env), 404, '关闭时 llms-full.txt 必须 404');
}

// 3) 老配置缺 enableSeo：视为开启，行为与升级前一致
{
  const env = makeEnv(undefined);
  const memoHtml = await htmlOf('/memo/7', env);
  assert.doesNotMatch(memoHtml, /noindex/, '缺省时必须按开启处理');
  assert.match(memoHtml, /rel="canonical"/);
  assert.equal(await statusOf('/sitemap.xml', env), 200);
  assert.match(await htmlOf('/robots.txt', env), /Sitemap:/);
}

console.log('seo-toggle: PASS');
