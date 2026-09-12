import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import worker from '../../worker/src/index.js';

/**
 * GEO 端点（llms.txt / llms-full.txt）：
 * - llmstxt.org 格式：H1 站点名 + blockquote 简介 + 页面链接 + 最近动态
 * - 只收录公开动态（show_type=1 且未到定时发布时间）
 * - llms-full.txt 附正文原文（截断），llms.txt 只列链接
 * - 允许缓存；D1 未配置时 503
 */
const config = { title: '测试站', slogan: '', seoDescription: '测试站描述文案', siteUrl: 'https://seo.example', enableAbout: true };
const memosRows = [
  { id: 2, content: '第一条动态正文，包含 **加粗** 与链接', imgs: '/upload/a.jpg', user_id: 1, username: 'admin', nickname: '管理员', avatar_url: '', slogan: '', cover_url: '', created_at: '2026-01-02 00:00:00', updated_at: '2026-01-02 00:00:00', location: '', external_url: '', external_title: '', external_favicon: '', pinned: 0, ext: '{}', show_type: 1, tags: '日常,测试', fav_count: 0, comment_count: 0 },
  { id: 1, content: '更早的一条动态', imgs: '', user_id: 1, username: 'admin', nickname: '管理员', avatar_url: '', slogan: '', cover_url: '', created_at: '2026-01-01 00:00:00', updated_at: '2026-01-01 00:00:00', location: '', external_url: '', external_title: '', external_favicon: '', pinned: 0, ext: '{}', show_type: 1, tags: '', fav_count: 0, comment_count: 0 },
];

const state = {};
const env = {
  DB: {
    prepare(sql) {
      state.sql = sql;
      const statement = {
        bind(...args) { state.bindArgs = args; return statement; },
        async all() {
          if (sql.includes('JOIN users u')) return { results: memosRows };
          return { results: [] };
        },
        async first() {
          if (sql.includes('FROM sys_config')) return { content: JSON.stringify(config) };
          return null;
        },
      };
      return statement;
    },
  },
};

// 1) /llms.txt：结构与内容
{
  const response = await worker.fetch(new Request('https://seo.example/llms.txt'), env);
  const text = await response.text();
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type') || '', /text\/plain/);
  assert.match(response.headers.get('cache-control') || '', /max-age=3600/, 'llms.txt 允许缓存');
  assert.match(text, /^# 测试站\n/);
  assert.match(text, /^> 测试站描述文案$/m);
  assert.match(text, /\[首页\]\(https:\/\/seo\.example\/\)/);
  assert.match(text, /\[照片墙\]\(https:\/\/seo\.example\/photos\)/);
  assert.match(text, /\[关于\]\(https:\/\/seo\.example\/about\)/, 'enableAbout 开启时收录关于页');
  assert.match(text, /\[RSS 订阅\]\(https:\/\/seo\.example\/rss\)/);
  assert.match(text, /## 最近动态/);
  assert.match(text, /\[2026-01-02 [^\]]+\]\(https:\/\/seo\.example\/memo\/2\)/);
  assert.match(text, /第一条动态正文/, '摘要来自动态正文');
  assert.doesNotMatch(text, /最近动态（全文）/, '/llms.txt 不附正文');
  assert.match(state.sql, /show_type=1/, '不收录私密动态');
  assert.match(state.sql, /created_at<=CURRENT_TIMESTAMP/, '不收录定时未发布动态');
  assert.deepEqual(state.bindArgs, [50], 'llms.txt 列出最近 50 条');
}

// 2) /llms-full.txt：附正文原文
{
  const response = await worker.fetch(new Request('https://seo.example/llms-full.txt'), env);
  const text = await response.text();
  assert.equal(response.status, 200);
  assert.match(text, /最近动态（全文）/);
  assert.match(text, /第一条动态正文，包含 \*\*加粗\*\* 与链接/, '全文保留 markdown 原文');
  assert.deepEqual(state.bindArgs, [100], 'llms-full.txt 列出最近 100 条');
}

// 3) 站点页链接不含 /api、/upload 等私有路径
{
  const response = await worker.fetch(new Request('https://seo.example/llms.txt'), env);
  const text = await response.text();
  assert.doesNotMatch(text, /\]\(https:\/\/seo\.example\/api/);
  assert.doesNotMatch(text, /\]\(https:\/\/seo\.example\/upload/);
}

// 4) D1 未配置 → 503
const noDb = await worker.fetch(new Request('https://seo.example/llms.txt'), {});
assert.equal(noDb.status, 503);

// 静态断言：路由已挂载
const source = await readFile(new URL('../../worker/src/index.js', import.meta.url), 'utf8');
assert.match(source, /normalizedPath === '\/llms\.txt'/);
assert.match(source, /normalizedPath === '\/llms-full\.txt'/);

console.log('GEO endpoints (llms.txt) tests: PASS');
