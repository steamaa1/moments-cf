import assert from 'node:assert/strict';
import worker from '../../worker/src/index.js';

/**
 * Sitemap 可见性与增强：
 * - 不收录未来定时发布动态（show_type=1 AND created_at<=CURRENT_TIMESTAMP）
 * - Google 图片站点地图扩展（xmlns:image / image:image）
 * - 首页 lastmod 取最新公开动态
 * - 自定义图集页与标签聚合页收录（默认图集除外，标签按用户+标签去重）
 * - 允许缓存；D1 未配置时 503
 */
const memosRows = [{ id: 1, created_at: '2026-08-01 00:00:00', imgs: '/upload/a.jpg,/upload/b.jpg' }];
const usersRows = [{ id: 1, updated_at: '2026-07-01 00:00:00' }];
const tagRows = [{ username: 'admin', tags: '日常,生活' }, { username: 'admin', tags: '日常' }];
const albumRows = [{ id: 3, updated_at: '2026-06-01 00:00:00' }];

const queries = [];
const env = {
  DB: {
    prepare(sql) {
      queries.push(sql);
      const statement = {
        bind(...args) { return statement; },
        async all() {
          if (sql.includes('JOIN users u')) return { results: tagRows };
          if (sql.includes('FROM memos')) return { results: memosRows };
          if (sql.includes('FROM users')) return { results: usersRows };
          if (sql.includes('photo_albums')) return { results: albumRows };
          return { results: [] };
        },
        async first() {
          if (sql.includes('FROM sys_config')) return { content: JSON.stringify({ enableAbout: false, siteUrl: '' }) };
          return null;
        },
      };
      return statement;
    },
  },
};

const response = await worker.fetch(new Request('https://moments.example/sitemap.xml'), env);
const xml = await response.text();
assert.equal(response.status, 200);
assert.match(response.headers.get('content-type') || '', /application\/xml/);
assert.match(response.headers.get('cache-control') || '', /max-age=3600/, 'sitemap 允许缓存');
assert.match(xml, /https:\/\/moments\.example\/memo\/1/);
const memoQuery = queries.find(sql => sql.includes('FROM memos') && !sql.includes('JOIN users u')) || '';
assert.match(memoQuery, /show_type=1 AND created_at<=CURRENT_TIMESTAMP/, 'Sitemap 不得收录未来定时发布动态');
// Google 图片站点地图扩展：配图绝对地址
assert.match(xml, /xmlns:image="http:\/\/www\.google\.com\/schemas\/sitemap-image\/1\.1"/);
assert.match(xml, /<image:image><image:loc>https:\/\/moments\.example\/upload\/a\.jpg<\/image:loc><\/image:image>/);
assert.match(xml, /<image:image><image:loc>https:\/\/moments\.example\/upload\/b\.jpg<\/image:loc><\/image:image>/);
// 首页 lastmod 取最新公开动态时间
assert.match(xml, /<url><loc>https:\/\/moments\.example\/<\/loc><lastmod>2026-08-01T00:00:00Z<\/lastmod>/);
// 自定义图集页收录
assert.match(xml, /<loc>https:\/\/moments\.example\/photos\/album\/3<\/loc>/);
// 标签聚合页收录，按用户+标签去重（「日常」重复出现只收一次）
assert.match(xml, /<loc>https:\/\/moments\.example\/tags\/admin\/%E6%97%A5%E5%B8%B8<\/loc>/);
assert.match(xml, /<loc>https:\/\/moments\.example\/tags\/admin\/%E7%94%9F%E6%B4%BB<\/loc>/);
assert.equal((xml.match(/\/tags\/admin\//g) || []).length, 2, '标签页去重');

// D1 未配置 → 503
const noDb = await worker.fetch(new Request('https://moments.example/sitemap.xml'), {});
assert.equal(noDb.status, 503);

console.log('Sitemap visibility tests: PASS');
