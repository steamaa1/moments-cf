#!/usr/bin/env node
/** Read-only smoke test for a deployed Moments-CF Worker. */
const base = String(process.env.MOMENTS_BASE_URL || '').replace(/\/$/, '');
if (!base) throw new Error('Set MOMENTS_BASE_URL, for example https://moments-cf.example.workers.dev');
const jsonHeaders = { 'content-type': 'application/json' };
const checks = [
  ['GET /api/health', '/api/health', { method: 'GET' }, 'json'],
  ['POST /api/user/profile', '/api/user/profile', { method: 'POST', headers: jsonHeaders, body: '{}' }, 'json'],
  ['POST /api/sysConfig/get', '/api/sysConfig/get', { method: 'POST', headers: jsonHeaders, body: '{}' }, 'json'],
  ['POST /api/memo/list', '/api/memo/list', { method: 'POST', headers: jsonHeaders, body: '{"page":1,"size":5}' }, 'json'],
  ['POST /api/friend/list', '/api/friend/list', { method: 'POST', headers: jsonHeaders, body: '{}' }, 'json'],
  ['GET /rss', '/rss', { method: 'GET' }, 'rss'],
];
let failed = false;
for (const [name, path, init, type] of checks) {
  try {
    const response = await fetch(`${base}${path}`, { ...init, signal: AbortSignal.timeout(10000) });
    const text = await response.text();
    let valid = response.ok;
    if (type === 'json') valid = valid && JSON.parse(text).code === 0;
    if (type === 'rss') valid = valid && text.includes('<rss');
    console.log(`${valid ? 'PASS' : 'FAIL'} ${name} (${response.status})`);
    if (!valid) failed = true;
  } catch (error) {
    failed = true;
    console.log(`FAIL ${name} - ${error.message}`);
  }
}
// —— SEO / 规范 URL 回归（只读）——
// 背景：Cloudflare Assets 默认 auto-trailing-slash 会把目录页（/photos）307 跳到 /photos/，
// 与 sitemap、canonical 使用的无尾斜杠地址冲突，Google 报「重复网页，Google 选择的规范网页与用户指定的不同」。
// 每次部署后验证：静态页直出 200、sitemap 地址可直取、canonical 自指向且无尾斜杠、未知路径 noindex。
async function seoProblems() {
  const problems = [];
  const get = async (path) => {
    const response = await fetch(`${base}${path}`, { redirect: 'manual', headers: { accept: 'text/html,application/xml,text/plain' }, signal: AbortSignal.timeout(10000) });
    return { status: response.status, location: response.headers.get('location') || '', text: await response.text() };
  };
  const canonicalOf = (text) => text.match(/<link rel="canonical" href="([^"]+)"/)?.[1] || '';
  // 静态目录页必须以无尾斜杠地址直出 200
  for (const path of ['/', '/about', '/friend', '/photos']) {
    const { status } = await get(path);
    if (status !== 200) problems.push(`${path} 应为 200（无尾斜杠规范地址），实际 ${status}`);
  }
  // 带尾斜杠变体应 307 回到无尾斜杠规范地址
  for (const path of ['/photos/', '/about/']) {
    const { status, location } = await get(path);
    if (status !== 307 || !location) problems.push(`${path} 应 307 重定向到无尾斜杠地址，实际 ${status}`);
  }
  // sitemap 地址抽查：直接 200 且页面声明的 canonical 与之一致
  const sitemap = await get('/sitemap.xml');
  const urls = [...sitemap.text.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
  if (sitemap.status !== 200 || !urls.length) problems.push('/sitemap.xml 不可用或没有 <loc>');
  for (const url of urls.slice(0, 10)) {
    const { pathname } = new URL(url);
    const { status, text } = await get(pathname);
    if (status !== 200) { problems.push(`sitemap 地址 ${pathname} 应为 200，实际 ${status}`); continue; }
    const declared = canonicalOf(text);
    if (declared !== url) problems.push(`sitemap 地址 ${pathname} 的 canonical=${declared || '（缺失）'}，应为 ${url}`);
  }
  // SPA 回退的未知路径必须 noindex，否则软 404 会被收录成重复页
  const unknown = await get('/__not-a-real-page__');
  if (!/<meta name="robots" content="noindex/.test(unknown.text)) problems.push('未知路径未注入 noindex（SPA 软 404 会被收录成重复页）');
  const llms = await get('/llms.txt');
  if (llms.status !== 200 || !llms.text.startsWith('#')) problems.push('/llms.txt 不可用');
  return problems;
}
const seoIssues = await seoProblems();
if (seoIssues.length) {
  failed = true;
  for (const issue of seoIssues) console.log(`FAIL SEO - ${issue}`);
} else {
  console.log('PASS SEO 规范 URL 与 canonical 一致性');
}
if (failed) process.exitCode = 1;
