import assert from 'node:assert/strict';
import { trashOrphanAlbumMedia } from '../../worker/src/index.js';
import { readFile } from 'node:fs/promises';

// 可配置的 D1 Mock：记录媒体回收 UPDATE 次数与查询
function createEnv({ memos = [], albumItems = [], media = [] } = {}) {
  const calls = { updateMediaTrashed: 0, memosQueried: 0 };
  const env = {
    DB: {
      prepare(sql) {
        const statement = {
          args: [],
          bind(...args) { statement.args = args; return statement; },
          async first() {
            const s = sql.toLowerCase();
            if (s.includes('select count(*) as total from photo_album_items')) {
              const url = statement.args[0];
              const exclude = Number(statement.args[1]);
              return { total: albumItems.filter(item => item.image_url === url && item.id !== exclude).length };
            }
            if (s.includes('select id, owner_id from media')) {
              const key = statement.args[0];
              return media.find(row => row.r2_key === key && row.trashed_at === null) || null;
            }
            return null;
          },
          async all() {
            const s = sql.toLowerCase();
            if (s.includes('select imgs from memos')) {
              calls.memosQueried++;
              const key = String(statement.args[0] || '').slice(1, -1);
              return { results: memos.filter(memo => String(memo.imgs || '').includes(key)) };
            }
            return { results: [] };
          },
          async run() {
            const s = sql.toLowerCase();
            if (s.startsWith('update media set trashed_at=current_timestamp')) calls.updateMediaTrashed++;
            return { meta: { changes: 1 } };
          },
        };
        return statement;
      },
    },
  };
  return { env, calls };
}

const albumItem = { id: 11, source_type: 'upload', source_ref: '/upload/media/2026/a.jpg', image_url: '/upload/media/2026/a.jpg' };
const readyMedia = [{ id: 5, owner_id: 1, r2_key: 'media/2026/a.jpg', trashed_at: null }];

// 1. 无任何引用：媒体移入回收站
{
  const { env, calls } = createEnv({ media: readyMedia });
  assert.equal(await trashOrphanAlbumMedia(env, albumItem, 1), true, '无引用的上传文件应移入回收站');
  assert.equal(calls.updateMediaTrashed, 1);
}

// 2. 被动态以相对路径引用：不动媒体
{
  const { env, calls } = createEnv({ memos: [{ imgs: '/upload/media/2026/a.jpg' }], media: readyMedia });
  assert.equal(await trashOrphanAlbumMedia(env, albumItem, 1), false, '被动态引用的文件不得回收');
  assert.equal(calls.updateMediaTrashed, 0);
}

// 3. 被动态以绝对域名路径引用：规范化后仍算引用
{
  const { env, calls } = createEnv({ memos: [{ imgs: 'https://site.example/upload/media/2026/a.jpg' }], media: readyMedia });
  assert.equal(await trashOrphanAlbumMedia(env, albumItem, 1), false, '绝对路径引用经规范化后仍应视为被引用');
  assert.equal(calls.updateMediaTrashed, 0);
}

// 4. 被其他图集项引用同一文件：不动媒体
{
  const { env, calls } = createEnv({ albumItems: [{ id: 12, image_url: '/upload/media/2026/a.jpg' }], media: readyMedia });
  assert.equal(await trashOrphanAlbumMedia(env, albumItem, 1), false, '被其他图集项共享的文件不得回收');
  assert.equal(calls.updateMediaTrashed, 0);
}

// 5. 媒体属于其他用户：保留文件
{
  const { env, calls } = createEnv({ media: [{ id: 5, owner_id: 2, r2_key: 'media/2026/a.jpg', trashed_at: null }] });
  assert.equal(await trashOrphanAlbumMedia(env, albumItem, 1), false, '不得回收其他用户上传的媒体');
  assert.equal(calls.updateMediaTrashed, 0);
}

// 6. 外链图片或动态来源：无媒体可回收
{
  const { env, calls } = createEnv({ media: readyMedia });
  assert.equal(await trashOrphanAlbumMedia(env, { id: 13, source_type: 'upload', image_url: 'https://images.example/p.jpg' }, 1), false);
  assert.equal(await trashOrphanAlbumMedia(env, { id: 14, source_type: 'memo', source_ref: '7', image_url: '' }, 1), false);
  assert.equal(calls.updateMediaTrashed, 0);
}

// 源码契约：路由、守卫与图集详情 isDefault 规范化
const workerSource = await readFile(new URL('../../worker/src/index.js', import.meta.url), 'utf8');
assert.match(workerSource, /\/api\/admin\/photo\/delete/, '必须注册照片删除路由');
assert.match(workerSource, /默认图集的照片来自动态，不能在此删除/, '默认图集必须拒绝删除');
assert.match(workerSource, /SELECT id,album_id,source_type,source_ref,image_url FROM photo_album_items WHERE id=\? AND album_id=\?/i, '删除前必须校验照片项属于该图集');
assert.match(workerSource, /isDefault: Boolean\(Number\(album\.is_default\)\)/, '图集详情必须返回规范化 isDefault');
assert.match(workerSource, /DELETE FROM photo_album_items WHERE id=\? AND album_id=\?/i, '删除必须限定图集范围');
assert.match(workerSource, /UPDATE media SET trashed_at=CURRENT_TIMESTAMP WHERE id=\? AND owner_id=\? AND trashed_at IS NULL/i, '媒体只能进入回收站而非直接删除');

console.log('Photo delete reference tests: PASS');
