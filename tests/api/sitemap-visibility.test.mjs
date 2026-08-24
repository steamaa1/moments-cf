import assert from 'node:assert/strict';
import worker from '../../worker/src/index.js';

const queries = [];
const env = {
  DB: {
    prepare(sql) {
      queries.push(sql);
      return {
        async all() {
          if (sql.includes('FROM memos')) return { results: [{ id: 1, created_at: '2026-08-01 00:00:00' }] };
          if (sql.includes('FROM users')) return { results: [] };
          return { results: [] };
        },
        async first() {
          if (sql.includes('FROM sys_config')) return { content: JSON.stringify({ enableAbout: false, siteUrl: '' }) };
          return null;
        },
      };
    },
  },
};

const response = await worker.fetch(new Request('https://moments.example/sitemap.xml'), env);
const xml = await response.text();
assert.equal(response.status, 200);
assert.match(response.headers.get('content-type') || '', /application\/xml/);
assert.match(xml, /https:\/\/moments\.example\/memo\/1/);
const memoQuery = queries.find(sql => sql.includes('FROM memos')) || '';
assert.match(memoQuery, /show_type=1 AND created_at<=CURRENT_TIMESTAMP/, 'Sitemap 不得收录未来定时发布动态');

console.log('Sitemap visibility tests: PASS');
