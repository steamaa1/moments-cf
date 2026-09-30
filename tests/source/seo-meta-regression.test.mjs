import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { injectSeoMeta, buildJsonLd } from '../../worker/src/index.js';

/**
 * SEO Meta 回归：
 * - Worker 把后台配置（title/seoDescription/seoKeywords/slogan）动态注入
 *   SPA index.html，让不执行 JS 的爬虫读到；默认值兜底与 HTML 转义。
 * - 页面级 SEO（/memo/:id、/user/:id）：title/描述/og:type/og:image/noindex/JSON-LD 覆盖。
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

// 6. 页面级 meta（page 参数）：title/描述/og:type/og:image/JSON-LD 覆盖站点级
{
  const out = injectSeoMeta(html, { siteUrl: 'https://wb.me-i.top' }, '/memo/9', {
    title: '小明 的动态',
    description: '动态摘要',
    ogType: 'article',
    ogImage: 'https://wb.me-i.top/upload/p.jpg',
    jsonLd: '{"@type":"SocialMediaPosting"}',
  });
  assert.match(out, /<title>小明 的动态<\/title>/);
  assert.match(out, /<meta name="description" content="动态摘要">/);
  assert.match(out, /<meta property="og:type" content="article">/);
  assert.match(out, /<meta property="og:image" content="https:\/\/wb\.me-i\.top\/upload\/p\.jpg">/);
  assert.match(out, /<meta name="twitter:card" content="summary_large_image">/);
  assert.match(out, /<script type="application\/ld\+json">\{"@type":"SocialMediaPosting"\}<\/script>/);
}

// 7. 页面级 noindex：有 robots 标签时替换，缺失时插入
{
  const out = injectSeoMeta(html, {}, '/', { noindex: true });
  assert.match(out, /<meta name="robots" content="noindex, nofollow">/);
  const without = injectSeoMeta('<html><head><title>t</title></head></html>', {}, '/', { noindex: true });
  assert.match(without, /<meta name="robots" content="noindex, nofollow">/);
}

// 8. 相对 og:image 绝对化（有规范域名时）
{
  const htmlWithOg = html.replace('<meta property="og:title"', '<meta property="og:image" content="/cover.webp">\n<meta property="og:title"');
  const out = injectSeoMeta(htmlWithOg, { siteUrl: 'https://wb.me-i.top' }, '/');
  assert.match(out, /<meta property="og:image" content="https:\/\/wb\.me-i\.top\/cover\.webp">/);
  assert.match(out, /<meta name="twitter:card" content="summary_large_image">/);
  // 页面级 og:image 优先于生成 HTML 里的相对值
  const overridden = injectSeoMeta(htmlWithOg, { siteUrl: 'https://wb.me-i.top' }, '/memo/1', { ogImage: 'https://wb.me-i.top/upload/pic.jpg' });
  assert.match(overridden, /<meta property="og:image" content="https:\/\/wb\.me-i\.top\/upload\/pic\.jpg">/);
}

// 9. buildJsonLd：JSON-LD 序列化转义 <，防止 </script> 注入
{
  const ld = buildJsonLd('WebSite', { description: '</script><b>x</b>' });
  assert.match(ld, /\\u003c/);
  assert.doesNotMatch(ld, /<\/script>/);
  assert.equal(buildJsonLd('WebSite', null), null);
  assert.equal(buildJsonLd('', { a: 1 }), null);
  // JSON.stringify 后仍是合法 JSON
  assert.deepEqual(JSON.parse(ld), { '@context': 'https://schema.org', '@type': 'WebSite', description: '</script><b>x</b>' });
}

// 10. canonical/og:url 去尾斜杠（除根路径），与 sitemap 及 Assets 的 drop-trailing-slash 一致
{
  const trailing = injectSeoMeta(html, { siteUrl: 'https://wb.me-i.top' }, '/memo/91/');
  assert.equal(trailing.match(/<link rel="canonical" href="([^"]+)"/)?.[1], 'https://wb.me-i.top/memo/91');
  assert.equal(trailing.match(/<meta property="og:url" content="([^"]+)"/)?.[1], 'https://wb.me-i.top/memo/91');
  const root = injectSeoMeta(html, { siteUrl: 'https://wb.me-i.top' }, '/');
  assert.equal(root.match(/<link rel="canonical" href="([^"]+)"/)?.[1], 'https://wb.me-i.top/');
  const noLeading = injectSeoMeta(html, { siteUrl: 'https://wb.me-i.top' }, 'memo/91');
  assert.equal(noLeading.match(/<link rel="canonical" href="([^"]+)"/)?.[1], 'https://wb.me-i.top/memo/91');
}

// 静态断言：配置保存、公开配置、设置页、运行时回退、GEO 能力
const source = await readFile(new URL('../../worker/src/index.js', import.meta.url), 'utf8');
assert.match(source, /config\.seoDescription = String\(body\.seoDescription/);
assert.match(source, /'seoDescription', 'seoKeywords'/);
assert.match(source, /injectSeoMeta\(await assetsResponse\.text\(\), config, url\.pathname, page\)/);
assert.match(source, /export function buildJsonLd/);
assert.match(source, /async function pageSeo/);
assert.match(source, /function memoSeoTitle\(content, fallback\)/, '动态 SEO 标题必须由正文生成');
assert.match(source, /const pageTitle = memoSeoTitle\(view\.content, fallbackTitle\)/, 'Worker 页面级标题必须使用动态正文');
assert.match(source, /normalizedPath === '\/llms\.txt'/);
// robots.txt：搜索引用类 AI 爬虫放行、训练类屏蔽、图片/社交爬虫取图
assert.match(source, /OAI-SearchBot/);
assert.match(source, /PerplexityBot/);
assert.match(source, /ClaudeBot/);
assert.match(source, /Applebot/);
assert.match(source, /GPTBot/);
assert.match(source, /Google-Extended/);
assert.match(source, /Googlebot-Image/);
assert.match(source, /facebookexternalhit/);
const settings = await readFile(new URL('../../front/pages/sys/settings.vue', import.meta.url), 'utf8');
assert.match(settings, /v-model="state\.seoDescription"/);
assert.match(settings, /v-model="state\.seoKeywords"/);
assert.match(settings, /v-model="state\.siteUrl"/);
assert.match(settings, /SEO 描述/);
assert.match(settings, /SEO 关键词/);
assert.match(settings, /站点规范域名/);
const memoPage = await readFile(new URL('../../front/pages/memo/[id].vue', import.meta.url), 'utf8');
assert.match(memoPage, /const pageTitle = text \? \(text\.length > 40 \? `\$\{text\.slice\(0, 40\)}…` : text\) : fallbackTitle/, '前端动态页标题必须使用正文并限制长度');
assert.match(memoPage, /title: pageTitle/);
assert.match(memoPage, /property: 'og:title', content: pageTitle/);
const layoutDefault = await readFile(new URL('../../front/layouts/default.vue', import.meta.url), 'utf8');
assert.match(layoutDefault, /sysConfigVO\.seoDescription \|\|/);
assert.match(layoutDefault, /sysConfigVO\.seoKeywords \|\|/);
assert.match(layoutDefault, /sysConfigVO\.siteUrl/);
assert.match(layoutDefault, /og:image/, 'layouts 输出 og:image');
assert.match(layoutDefault, /summary_large_image/, 'twitter:card 升级大图卡');
const nuxtConfig = await readFile(new URL('../../front/nuxt.config.ts', import.meta.url), 'utf8');
assert.match(nuxtConfig, /lang: 'zh-CN'/, 'html lang 声明中文');
// 规范 URL 统一无尾斜杠：Worker 注入值与前端运行时值必须一致，
// 否则 unhead 接管 canonical 标签后会把注入值改回带尾斜杠的版本（Search Console 报规范网页不同）
const wrangler = await readFile(new URL('../../worker/wrangler.toml', import.meta.url), 'utf8');
assert.match(wrangler, /html_handling = "drop-trailing-slash"/, 'wrangler.toml 声明无尾斜杠为规范地址');
const wranglerTemplate = await readFile(new URL('../../worker/wrangler.toml.template', import.meta.url), 'utf8');
assert.match(wranglerTemplate, /html_handling = "drop-trailing-slash"/, '部署模板同样声明尾斜杠策略');
assert.match(layoutDefault, /canonicalPath = computed\(\(\) => route\.path\.replace/, 'layouts canonical 去尾斜杠');
assert.match(layoutDefault, /canonicalBase \+ canonicalPath\.value/, 'layouts 用规范化路径拼 canonical');

// 11. SEO 总开关：默认开启、保存写入、四处闸门、公开配置暴露、前端运行时同步
assert.match(source, /enableSeo: true/, '配置默认必须为开启');
assert.match(source, /config\.enableSeo = body\.enableSeo !== false/, '保存时必须写入开关（缺省视为开启）');
assert.match(source, /if \(config\?\.enableSeo === false\) return \{ noindex: true \}/, 'pageSeo 必须按开关让全站 noindex');
assert.match(source, /if \(config\?\.enableSeo === false\) return new Response\('Not Found', \{ status: 404 \}\)/, 'sitemap 与 llms 关闭时必须 404');
assert.match(source, /Disallow: \/\\n'/, 'robots 关闭时必须全站禁止抓取');
assert.match(source, /'siteUrl', 'enableSeo',/, '公开配置必须暴露 enableSeo，前端才能同步');
assert.match(source, /const canonical = siteUrl && seoEnabled \?/, '关闭时必须不输出 canonical');
assert.match(layoutDefault, /sysConfigVO\.enableSeo === false/, 'layout 必须按开关同步 noindex（Googlebot 会执行 JS，否则运行时覆盖注入值）');
assert.match(settings, /v-model="state\.enableSeo"/, '系统设置必须有 SEO 总开关');
assert.match(settings, /启用 SEO/, '开关必须有明确标签');

console.log('SEO meta injection regression tests: PASS');
