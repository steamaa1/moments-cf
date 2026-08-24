import assert from 'node:assert/strict';
import { createD1Backup, restoreD1Backup, storeD1Backup } from '../../worker/src/phase7.js';

const stored = new Map();
const env = {
  CLOUDFLARE_ACCOUNT_ID: 'account', D1_DATABASE_ID: 'database', D1_BACKUP_API_TOKEN: 'token',
  MEDIA: {
    async put(key, body) { stored.set(key, new Uint8Array(await new Response(body).arrayBuffer())); },
    async get(key) { const value=stored.get(key); return value ? { async arrayBuffer(){return value.buffer}, body:value } : null; },
    async list() { return { objects: [...stored].map(([key,value]) => ({key,size:value.length,uploaded:new Date()})) }; },
    async delete(key) { stored.delete(key); },
  },
};
let exportCalls=0;
const backupFetch = async (url, init={}) => {
  if (String(url).includes('/export')) { exportCalls+=1; return new Response(JSON.stringify({success:true,result: exportCalls===1 ? {at_bookmark:'bookmark'} : {at_bookmark:'bookmark',status:'complete',signed_url:'https://download.test/dump',filename:'dump.sql'}}),{status:200}); }
  if (url==='https://download.test/dump') return new Response('CREATE TABLE test(id INTEGER);',{status:200});
  throw new Error(`unexpected ${url} ${init.body||''}`);
};
const created = await createD1Backup(env,{fetch:backupFetch,sleep:async()=>{}});
assert.match(created.key,/^backups\/d1\/.+\.sql$/); assert.ok(stored.has(created.key));

const storedDirect = new Map();
const directEnv = {
  ...env,
  MEDIA: {
    async put(key, body) { storedDirect.set(key, new Uint8Array(await new Response(body).arrayBuffer())); },
    async list() { return { objects: [...storedDirect].map(([key, value]) => ({ key, size: value.length, uploaded: new Date() })) }; },
    async delete(key) { storedDirect.delete(key); },
  },
};
const direct = await storeD1Backup(directEnv, { signed_url: 'https://download.test/direct' }, 90, async url => {
  assert.equal(url, 'https://download.test/direct');
  return new Response('DIRECT BACKUP', { status: 200 });
}, 'r2', null);
assert.ok(storedDirect.has(direct.key), 'storeD1Backup writes the downloaded backup');

let importStep=0;
const restoreFetch = async (url, init={}) => {
  if (String(url).includes('/import')) {
    const body=JSON.parse(init.body); importStep+=1;
    if(body.action==='init') return new Response(JSON.stringify({success:true,result:{upload_url:'https://upload.test/sql',filename:'restore.sql'}}),{status:200});
    if(body.action==='ingest') return new Response(JSON.stringify({success:true,result:{at_bookmark:'restore-bookmark',status:'active'}}),{status:200});
    if(body.action==='poll') return new Response(JSON.stringify({success:true,result:{status:'complete',result:{num_queries:1}}}),{status:200});
  }
  if(url==='https://upload.test/sql') return new Response('',{status:200});
  throw new Error(`unexpected ${url}`);
};
const restored=await restoreD1Backup(env,created.key,{fetch:restoreFetch,sleep:async()=>{}});
assert.equal(restored.num_queries,1); assert.ok(importStep>=3);

// S3/WebDAV get() 返回 { body, ... } 包装对象，恢复必须从 body 读取 SQL，而不是假设对象自带 arrayBuffer()。
for (const [target, storageConfig] of [
  ['s3', { s3Storage: { endpoint: 'https://s3.example.com', region: 'auto', bucket: 'bucket', accessKeyId: 'AK', secretAccessKey: 'SK' } }],
  ['webdav', { webdavStorage: { url: 'https://dav.example.com/root', username: 'u', password: 'p' } }],
]) {
  let uploadedSql = '';
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const text = String(url);
    if (text.startsWith('https://s3.example.com/') || text.startsWith('https://dav.example.com/root/')) {
      return new Response(`-- ${target} BACKUP\nCREATE TABLE restored(id INTEGER);`, { status: 200, headers: { 'content-type': 'application/sql', 'content-length': '52' } });
    }
    throw new Error(`unexpected storage fetch ${text} ${init.method || 'GET'}`);
  };
  let step = 0;
  const importFetch = async (url, init = {}) => {
    if (String(url).includes('/import')) {
      const body = JSON.parse(init.body); step += 1;
      if (body.action === 'init') return Response.json({ success: true, result: { upload_url: 'https://upload.test/non-r2', filename: 'restore.sql' } });
      if (body.action === 'ingest') return Response.json({ success: true, result: { at_bookmark: `${target}-bookmark`, status: 'active' } });
      if (body.action === 'poll') return Response.json({ success: true, result: { status: 'complete', result: { target } } });
    }
    if (url === 'https://upload.test/non-r2') {
      uploadedSql = new TextDecoder().decode(init.body);
      return new Response('', { status: 200 });
    }
    throw new Error(`unexpected import fetch ${url}`);
  };
  try {
    const value = await restoreD1Backup(env, 'backups/d1/non-r2.sql', { fetch: importFetch, sleep: async () => {} }, target, storageConfig);
    assert.equal(value.target, target);
    assert.match(uploadedSql, new RegExp(`${target} BACKUP`));
    assert.ok(step >= 3);
  } finally {
    globalThis.fetch = originalFetch;
  }
}
console.log('Phase 7 backup tests: PASS');
