import assert from 'node:assert/strict';
import { orderMemoBlocks, moveMemoBlock, attachmentBlockKey, doubanBookBlockKey, doubanMovieBlockKey, MEMO_SINGLE_BLOCK_KEYS } from '../../front/utils/memoBlocks.js';
import { sanitizeMemoExt } from '../../worker/src/index.js';

/**
 * 动态内容块排序契约（front/utils/memoBlocks.js 为纯 JS，这里真实执行而非正则断言）：
 * - 无 order（历史动态）→ 默认顺序，外观不变
 * - order 内按 order 先后；order 外的块补最后并保持默认相对顺序
 * - order 里的未知 key 忽略；重复 key 只认第一次
 * - 单调的 key 格式由 worker 的 sanitizeMemoExt 兜底校验
 */
const block = key => ({ key, kind: 'x' });
const keysOf = list => list.map(item => item.key);

// 1) 无 order / 空 order → 原样返回（历史动态外观不变）
{
  const list = [block('external'), block('images'), block('music'), block('video')];
  assert.deepEqual(keysOf(orderMemoBlocks(list, undefined)), ['external', 'images', 'music', 'video']);
  assert.deepEqual(keysOf(orderMemoBlocks(list, [])), ['external', 'images', 'music', 'video']);
  assert.deepEqual(keysOf(orderMemoBlocks(list, ['', '   '])), ['external', 'images', 'music', 'video'], '全空 key 视为没有 order');
}

// 2) order 内按 order 排序，order 外的块补到最后并保持默认相对顺序
{
  const list = [block('external'), block('images'), block('music'), block('git'), block('video')];
  assert.deepEqual(keysOf(orderMemoBlocks(list, ['video', 'external'])), ['video', 'external', 'images', 'music', 'git']);
  // 3) 未知 key 忽略；指向已移除块的 key 不影响存在的块
  assert.deepEqual(keysOf(orderMemoBlocks(list, ['attachment:/upload/gone.pdf', 'git', 'nope'])), ['git', 'external', 'images', 'music', 'video']);
  // 4) 重复 key 只认第一次出现的位置
  assert.deepEqual(keysOf(orderMemoBlocks(list, ['video', 'external', 'video'])), ['video', 'external', 'images', 'music', 'git']);
}

// 5) 逐条内容（附件/豆瓣）各占一个 key，可插到任意位置
{
  const a1 = attachmentBlockKey('/upload/media/a.pdf');
  const a2 = attachmentBlockKey('/upload/media/b.zip');
  const list = [block('images'), block(a1), block(a2), block('music')];
  assert.deepEqual(keysOf(orderMemoBlocks(list, [a2, 'images', a1])), [a2, 'images', a1, 'music']);
  assert.equal(attachmentBlockKey('/upload/x.pdf'), 'attachment:/upload/x.pdf');
  assert.equal(doubanBookBlockKey({ id: '123' }, 0), 'doubanBook:123');
  assert.equal(doubanBookBlockKey({}, 2), 'doubanBook:#2', '无 id 时退回索引兜底');
  assert.equal(doubanMovieBlockKey({ id: '456' }, 0), 'doubanMovie:456');
  assert.equal(doubanMovieBlockKey(null, 1), 'doubanMovie:#1');
}

// 6) 上移/下移：越界原样返回，不修改入参
{
  const keys = ['a', 'b', 'c'];
  assert.deepEqual(moveMemoBlock(keys, 'b', -1), ['b', 'a', 'c']);
  assert.deepEqual(moveMemoBlock(keys, 'b', 1), ['a', 'c', 'b']);
  assert.deepEqual(moveMemoBlock(keys, 'a', -1), ['a', 'b', 'c'], '已在顶部时上移无效');
  assert.deepEqual(moveMemoBlock(keys, 'c', 1), ['a', 'b', 'c'], '已在底部时下移无效');
  assert.deepEqual(moveMemoBlock(keys, 'missing', 1), ['a', 'b', 'c']);
  assert.deepEqual(keys, ['a', 'b', 'c'], '不得原地修改传入数组');
}

// 7) 单块 key 清单必须是约定的七种（编辑态与展示态都按它拼默认顺序）
assert.deepEqual(MEMO_SINGLE_BLOCK_KEYS, ['external', 'images', 'music', 'git', 'x', 'memoRef', 'video']);

// 8) worker 侧 order 校验：只留已知格式、去重、封顶 50
{
  const ok = sanitizeMemoExt({ order: ['music', 'external', 'attachment:/upload/a.pdf', 'doubanBook:123', 'doubanMovie:#0'] });
  assert.deepEqual(ok.order, ['music', 'external', 'attachment:/upload/a.pdf', 'doubanBook:123', 'doubanMovie:#0']);
  const dirty = sanitizeMemoExt({ order: ['music', 'music', 'javascript:alert(1)', 'attachment:../../etc/passwd', 'doubanBook:' + 'x'.repeat(40), '<script>', ' video '] });
  assert.deepEqual(dirty.order, ['music', 'video'], '重复项、非法格式与超长 key 一律丢弃，合法 key 去空白后保留');
  const capped = sanitizeMemoExt({ order: Array.from({ length: 80 }, (_, i) => i % 2 ? 'music' : 'images') });
  assert.ok(capped.order.length <= 50, `order 必须封顶（实际 ${capped.order.length}）`);
  assert.deepEqual(sanitizeMemoExt({}).order, [], '无 order 时输出空数组，前端据此回退默认顺序');
}

console.log('memo-block-order: PASS');
