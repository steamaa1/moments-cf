import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { injectSeoMeta } from '../../worker/src/index.js';

/**
 * SEO Meta 回归：
 * - Worker 把后台配置（title/seoDescription/seoKeywords/slogan）动态注入
 *   SPA index.html，让不执行 JS 的爬虫读到；默认值兜底与 HTML 转义。
 * - 系统设置页提供 SEO 描述/关键词配置项。
 */
const html = `<!doctype html><html><head>
<title>极简朋友圈</title>
<meta name="description" content="极简朋友圈 - 记录生活的每个瞬间，分享日常、心情与见闻的个人博客。">
<meta name="keywords" content="朋友圈, 动态, 博客, 极简朋友圈, 个人博客, 生活记录">
<meta property="og:site_name" content="极简朋友圈">
<meta property="og:type" content="website">
<meta property="og:title" content="极简朋友圈">
<meta property="og:description" content="极简朋友圈 - 记录生活的每个瞬间，分享日常、心情与见闻的个人博客。">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="极简朋友圈">
<meta name="twitter:description" content="极简朋友圈 - 记录生活的每个瞬间，分享日常、心情与见闻的个人博客。">
</head><body></body></html>`;

// 1. 无配置（undefined）→ 全部回退默认值，输出可解析
{
  const out = injectSeoMeta(html, {});
  assert.match(out, /<title>极简朋友圈<\/title>/);
  assert.match(out, /<meta name="description" content="极简朋友圈 - 记录生活的每个瞬间/);
  assert.match(out, /<meta name="keywords" content="朋友圈, 动态, 博客/);
}

// 2. 后台配置 seoDescription/seoKeywords/title → 动态注入
{
  const out = injectSeoMeta(html, { title: '我的朋友圈', seoDescription: '这是我的站点描述', seoKeywords: 'a, b, c' });
  assert.match(out, /<title>我的朋友圈<\/title>/);
  assert.match(out, /<meta name="description" content="这是我的站点描述">/);
  assert.match(out, /<meta name="keywords" content="a, b, c">/);
  assert.match(out, /<meta property="og:title" content="我的朋友圈">/);
  assert.match(out, /<meta name="twitter:description" content="这是我的站点描述">/);
}

// 3. 未配置 seoDescription 时回退 slogan · title 拼接
{
  const out = injectSeoMeta(html, { title: '站点A', slogan: '签名B' });
  assert.match(out, /<meta name="description" content="签名B · 站点A">/);
}

// 3.1 siteUrl 配置后按当前路径注入 canonical 与 og:url；未配置时不注入
{
  const out = injectSeoMeta(html, { siteUrl: 'https://wb.me-i.top' }, '/memo/123');
  assert.match(out, /<link rel="canonical" href="https:\/\/wb\.me-i\.top\/memo\/123">/);
  assert.match(out, /<meta property="og:url" content="https:\/\/wb\.me-i\.top\/memo\/123">/);
  const withoutSiteUrl = injectSeoMeta(html, {}, '/memo/123');
  assert.doesNotMatch(withoutSiteUrl, /rel="canonical"/);
  assert.doesNotMatch(withoutSiteUrl, /property="og:url"/);
}

// 4. HTML 转义（& < " 不得破坏 meta 结构）
{
  const out = injectSeoMeta(html, { title: 'A&B', seoDescription: '<b>"x"</b>' });
  assert.match(out, /<title>A&amp;B<\/title>/);
  assert.match(out, /content="&lt;b&gt;&quot;x&quot;&lt;\/b&gt;"/);
}

// 5. 缺失的 meta 不注入空内容，原 HTML 保留
{
  const out = injectSeoMeta('<html><head><title>t</title></head></html>', {});
  assert.match(out, /<title>极简朋友圈<\/title>/);
}

// 静态断言：配置保存、公开配置、设置页、运行时回退
const source = await readFile(new URL('../../worker/src/index.js', import.meta.url), 'utf8');
assert.match(source, /config\.seoDescription = String\(body\.seoDescription/);
assert.match(source, /'seoDescription', 'seoKeywords'/);
assert.match(source, /injectSeoMeta\(await assetsResponse\.text\(\), config, url\.pathname\)/);
const settings = await readFile(new URL('../../front/pages/sys/settings.vue', import.meta.url), 'utf8');
assert.match(settings, /v-model="state\.seoDescription"/);
assert.match(settings, /v-model="state\.seoKeywords"/);
assert.match(settings, /v-model="state\.siteUrl"/);
assert.match(settings, /SEO 描述/);
assert.match(settings, /SEO 关键词/);
assert.match(settings, /站点规范域名/);
const layoutDefault = await readFile(new URL('../../front/layouts/default.vue', import.meta.url), 'utf8');
assert.match(layoutDefault, /sysConfigVO\.seoDescription \|\|/);
assert.match(layoutDefault, /sysConfigVO\.seoKeywords \|\|/);
assert.match(layoutDefault, /sysConfigVO\.siteUrl/);

console.log('SEO meta injection regression tests: PASS');
