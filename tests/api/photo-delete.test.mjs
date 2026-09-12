import assert from 'node:assert/strict';
import worker, { signJwt } from '../../worker/src/index.js';

const JWT_SECRET = 'photo-delete-test-secret-at-least-32-chars';
const users = {
  1: { id: 1, username: 'admin', nickname: 'Admin', token_version: 0, password_hash: 'x' },
  2: { id: 2, username: 'user', nickname: 'User', token_version: 0, password_hash: 'x' },
};
const album = { id: 7, is_default: 0 };
const item = { id: 21, album_id: 7, source_type: 'upload', source_ref: '/upload/media/2026/a.jpg', image_url: '/upload/media/2026/a.jpg' };
const mediaRow = { id: 5, owner_id: 1, r2_key: 'media/2026/a.jpg', trashed_at: null };
const state = { deleted: 0, trashed: 0, album, item, media: mediaRow, memos: [], otherAlbumItems: [] };

class Statement {
  constructor(sql) { this.sql = sql; this.args = []; }
  bind(...args) { this.args = args; return this; }
  async first() {
    const sql = this.sql.toLowerCase();
    if (sql.includes('select * from users where id')) return users[Number(this.args[0])] || null;
    if (sql.includes('select id,is_default from photo_albums')) return state.album ? { ...state.album } : null;
    if (sql.includes('select id,album_id,source_type,source_ref,image_url from photo_album_items')) {
      return state.item && Number(this.args[0]) === state.item.id && Number(this.args[1]) === state.item.album_id ? { ...state.item } : null;
    }
    if (sql.includes('select count(*) as total from photo_album_items')) {
      const url = this.args[0];
      return { total: state.otherAlbumItems.filter(entry => entry.image_url === url && entry.id !== Number(this.args[1])).length };
    }
    if (sql.includes('select id, owner_id from media')) {
      return state.media && state.media.r2_key === this.args[0] && state.media.trashed_at === null ? { ...state.media } : null;
    }
    return null;
  }
  async all() {
    const sql = this.sql.toLowerCase();
    if (sql.includes('select imgs from memos')) {
      const key = String(this.args[0] || '').slice(1, -1);
      return { results: state.memos.filter(memo => String(memo.imgs || '').includes(key)) };
    }
    return { results: [] };
  }
  async run() {
    const sql = this.sql.toLowerCase();
    if (sql.startsWith('delete from photo_album_items')) { state.deleted++; state.item = null; return { meta: { changes: 1 } }; }
    if (sql.startsWith('update media set trashed_at=current_timestamp')) { state.trashed++; return { meta: { changes: 1 } }; }
    throw new Error(`Unhandled SQL: ${this.sql}`);
  }
}

const env = { JWT_SECRET, DB: { prepare(sql) { return new Statement(sql); } } };
const token = await signJwt({ sub: '1', tv: 0, exp: Math.floor(Date.now() / 1000) + 60 }, JWT_SECRET);
const headers = { 'content-type': 'application/json', 'x-api-token': token };

const call = (body, authHeaders = headers) => worker.fetch(new Request('https://moments.example/api/admin/photo/delete', {
  method: 'POST', headers: authHeaders, body: JSON.stringify(body),
}), env);

// 1. 未登录拒绝
const anonymous = await call({ albumId: 7, id: 21 }, { 'content-type': 'application/json' });
assert.equal(anonymous.status, 401);

// 2. 非管理员拒绝
const userToken = await signJwt({ sub: '2', tv: 0, exp: Math.floor(Date.now() / 1000) + 60 }, JWT_SECRET);
const forbidden = await call({ albumId: 7, id: 21 }, { 'content-type': 'application/json', 'x-api-token': userToken });
assert.equal(forbidden.status, 403);

// 3. 参数缺失拒绝
const invalid = await call({});
assert.equal(invalid.status, 400);

// 4. 默认图集拒绝
state.album = { id: 1, is_default: 1 };
const defaultAlbum = await call({ albumId: 1, id: 21 });
assert.equal(defaultAlbum.status, 400);
assert.match((await defaultAlbum.json()).message, /默认图集/);
state.album = album;

// 5. 照片项不属于该图集拒绝
const mismatch = await call({ albumId: 9, id: 21 });
assert.equal(mismatch.status, 404);

// 6. 被动态引用：仅移出图集，不回收媒体
state.memos = [{ imgs: '/upload/media/2026/a.jpg' }];
const referenced = await call({ albumId: 7, id: 21 });
assert.equal(referenced.status, 200, (await referenced.clone().json()).message);
const referencedBody = await referenced.json();
assert.equal(referencedBody.data.removed, true);
assert.equal(referencedBody.data.mediaTrashed, false);
assert.equal(state.deleted, 1, '必须删除图集收录记录');
assert.equal(state.trashed, 0, '被动态引用时不得回收媒体');

// 7. 无引用：删除记录并把媒体移入回收站
state.memos = [];
state.item = { ...item, id: 22 };
const orphan = await call({ albumId: 7, id: 22 });
assert.equal(orphan.status, 200);
const orphanBody = await orphan.json();
assert.equal(orphanBody.data.mediaTrashed, true);
assert.equal(state.deleted, 2);
assert.equal(state.trashed, 1, '无引用媒体必须移入回收站');

// 8. 已被删除的照片项再删一次返回 404
const missing = await call({ albumId: 7, id: 22 });
assert.equal(missing.status, 404);

console.log('Photo delete API tests: PASS');
