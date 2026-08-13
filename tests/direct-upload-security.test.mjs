import assert from 'node:assert/strict';
import worker, { signJwt } from '../worker/src/index.js';

const JWT_SECRET = 'direct-upload-test-secret-at-least-32-chars';
const user = { id: 1, username: 'admin', nickname: 'Admin', token_version: 0, password_hash: 'x' };
let pending = null;

class Statement {
  constructor(sql) { this.sql = sql; this.args = []; }
  bind(...args) { this.args = args; return this; }
  async first() {
    const sql = this.sql.toLowerCase();
    if (sql.includes('select * from users where id')) return user;
    if (sql.includes('select content from sys_config')) return { content: JSON.stringify({ storageType: 'r2' }) };
    if (sql.includes('select r2_key, thumbnail_key from media') && sql.includes('sha256')) return null;
    if (sql.includes('select id from media where owner_id') && sql.includes('r2_key')) return null;
    if (sql.includes("select * from media where owner_id") && sql.includes("upload_state='pending'")) {
      return pending && Number(this.args[0]) === pending.owner_id && this.args[1] === pending.r2_key ? pending : null;
    }
    return null;
  }
  async run() {
    const sql = this.sql.toLowerCase();
    if (sql.startsWith('insert into media') && sql.includes("'pending'")) {
      pending = {
        id: 1,
        owner_id: Number(this.args[0]),
        r2_key: this.args[1],
        original_filename: this.args[2],
        content_type: this.args[3],
        size_bytes: Number(this.args[4]),
        sha256: this.args[5],
        thumbnail_key: this.args[6],
        upload_state: 'pending',
      };
      return { meta: { changes: 1, last_row_id: 1 } };
    }
    if (sql.startsWith("update media set upload_state='ready'")) {
      pending.upload_state = 'ready';
      pending.thumbnail_key = this.args[0];
      return { meta: { changes: 1 } };
    }
    throw new Error(`Unhandled SQL: ${this.sql}`);
  }
}

const objects = new Map();
const env = {
  JWT_SECRET,
  CLOUDFLARE_ACCOUNT_ID: 'account123',
  R2_BUCKET_NAME: 'moments-media',
  R2_ACCESS_KEY_ID: 'access-key',
  R2_SECRET_ACCESS_KEY: 'secret-key',
  DB: { prepare(sql) { return new Statement(sql); } },
  MEDIA: {
    async head(key) { return objects.get(key) || null; },
  },
};
const token = await signJwt({ sub: '1', tv: 0, exp: Math.floor(Date.now() / 1000) + 60 }, JWT_SECRET);
const headers = { 'content-type': 'application/json', 'x-api-token': token };

const initResponse = await worker.fetch(new Request('https://moments.example/api/file/direct/init', {
  method: 'POST', headers,
  body: JSON.stringify({ filename: 'large.png', contentType: 'image/png', size: 25 * 1024 * 1024, sha256: 'a'.repeat(64) }),
}), env);
const initBody = await initResponse.json();
assert.equal(initResponse.status, 200, initBody.message);
assert.ok(initBody.data.thumbnailKey.startsWith('thumbs/'));
assert.equal(pending.thumbnail_key, initBody.data.thumbnailKey, 'init 必须把预期缩略图 Key 保存到 pending 记录');

objects.set(initBody.data.key, { size: 25 * 1024 * 1024, httpMetadata: { contentType: 'image/png' } });
objects.set(initBody.data.thumbnailKey, { size: 100, httpMetadata: { contentType: 'image/webp' } });
objects.set('thumbs/other-user.webp', { size: 100, httpMetadata: { contentType: 'image/webp' } });

const forgedResponse = await worker.fetch(new Request('https://moments.example/api/file/direct/complete', {
  method: 'POST', headers,
  body: JSON.stringify({ key: initBody.data.key, thumbnailKey: 'thumbs/other-user.webp' }),
}), env);
const forgedBody = await forgedResponse.json();
assert.equal(forgedResponse.status, 403);
assert.match(forgedBody.message, /缩略图标识不匹配/);
assert.equal(pending.upload_state, 'pending', '伪造缩略图不得完成上传');

const completeResponse = await worker.fetch(new Request('https://moments.example/api/file/direct/complete', {
  method: 'POST', headers,
  body: JSON.stringify({ key: initBody.data.key, thumbnailKey: initBody.data.thumbnailKey }),
}), env);
assert.equal(completeResponse.status, 200, (await completeResponse.clone().json()).message);
assert.equal(pending.upload_state, 'ready');
assert.equal(pending.thumbnail_key, initBody.data.thumbnailKey);

console.log('Direct upload thumbnail ownership tests: PASS');
