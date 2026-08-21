import assert from 'node:assert/strict';
import worker, { signJwt } from '../worker/src/index.js';
import { encryptConfigSecret } from '../worker/src/phase7.js';

const JWT_SECRET = 'media-routing-secret-at-least-32-characters';
const user = { id: 1, username: 'admin', nickname: 'Admin', token_version: 0, password_hash: 'x' };
const media = { id: 7, owner_id: 1, r2_key: 'media/legacy.webp', thumbnail_key: null, storage_backend: 'r2', upload_state: 'ready', trashed_at: null };
const deletedRows = [];
const r2Calls = { head: [], get: [], delete: [] };
const s3FetchCalls = [];
const encryptedS3Secret = await encryptConfigSecret('s3-secret', JWT_SECRET);
const config = {
  storageType: 's3',
  s3Storage: { endpoint: 'https://s3.example.com', region: 'auto', bucket: 'bucket', accessKeyId: 'key', secretAccessKeyEncrypted: encryptedS3Secret },
};

class Statement {
  constructor(sql) { this.sql = sql; this.args = []; }
  bind(...args) { this.args = args; return this; }
  async first() {
    const sql = this.sql.toLowerCase();
    if (sql.includes('select * from users where id')) return user;
    if (sql.includes('select content from sys_config')) return { content: JSON.stringify(config) };
    if (sql.includes('from media where (r2_key=? or thumbnail_key=?)')) {
      // 与 serveMedia 新语义一致：回收站原图 404，回收站缩略图放行。
      if (!this.args.includes(media.r2_key)) return null;
      return { id: media.id, storage_backend: media.storage_backend, r2_key: media.r2_key, thumbnail_key: media.thumbnail_key, trashed_at: media.trashed_at };
    }
    if (sql.includes('select id, r2_key, thumbnail_key, storage_backend from media')) {
      return Number(this.args[0]) === media.id && Number(this.args[1]) === media.owner_id && media.trashed_at ? media : null;
    }
    return null;
  }
  async run() {
    const sql = this.sql.toLowerCase();
    if (sql.startsWith('delete from media')) { deletedRows.push(Number(this.args[0])); return { meta: { changes: 1 } }; }
    throw new Error(`Unhandled SQL: ${this.sql}`);
  }
}

const env = {
  JWT_SECRET,
  DB: { prepare(sql) { return new Statement(sql); } },
  MEDIA: {
    async head(key) {
      r2Calls.head.push(key);
      if (key !== media.r2_key) return null;
      return {
        size: 4,
        httpEtag: '"etag"',
        httpMetadata: { contentType: 'image/webp' },
        writeHttpMetadata(headers) { headers.set('content-type', 'image/webp'); },
      };
    },
    async get(key) {
      r2Calls.get.push(key);
      return key === media.r2_key ? { body: new Uint8Array([1, 2, 3, 4]) } : null;
    },
    async delete(key) { r2Calls.delete.push(key); },
  },
};
const originalFetch = globalThis.fetch;
globalThis.fetch = async (url) => { s3FetchCalls.push(String(url)); return new Response(null, { status: 404 }); };
try {
  const read = await worker.fetch(new Request(`https://moments.example/upload/${media.r2_key}`), env);
  assert.equal(read.status, 200);
  assert.deepEqual(r2Calls.head, [media.r2_key], '历史 R2 媒体读取应按行记录走 R2');
  assert.deepEqual(r2Calls.get, [media.r2_key]);
  assert.equal(s3FetchCalls.length, 0, '历史 R2 媒体不得因当前设置为 S3 而访问 S3');

  media.trashed_at = '2026-08-01 00:00:00';
  const token = await signJwt({ sub: '1', tv: 0, exp: Math.floor(Date.now() / 1000) + 60 }, JWT_SECRET);
  const purge = await worker.fetch(new Request(`https://moments.example/api/file/trash/purge?id=${media.id}`, { method: 'POST', headers: { 'x-api-token': token } }), env);
  assert.equal(purge.status, 200, (await purge.clone().json()).message);
  assert.deepEqual(r2Calls.delete, [media.r2_key], '永久删除应按行记录删除 R2 对象');
  assert.deepEqual(deletedRows, [media.id]);
  assert.equal(s3FetchCalls.length, 0, '永久删除不得误删当前 S3 后端对象');
} finally {
  globalThis.fetch = originalFetch;
}

console.log('Media storage backend routing tests: PASS');
