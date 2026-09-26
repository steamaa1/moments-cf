/**
 * 动态内容块的排序契约：编辑态与展示态共用，保证「所见即所得」。
 *
 * 落盘位置 `memos.ext.order`：字符串数组，元素是「块 key」。
 *   - 单块（一个 key 一个位置）：external / images / music / git / x / memoRef / video
 *   - 多条内容逐条占位：attachment:<path> / doubanBook:<id> / doubanMovie:<id>
 *
 * 规则（有单元测试兜底）：
 *   1. 没有 order（历史动态）→ 完全按默认顺序，外观与升级前一致
 *   2. 出现在 order 里的块，按 order 的先后排列
 *   3. 没出现在 order 里的块补在最后，并保持默认顺序（新增内容类型不会被旧 order 挤掉）
 *   4. order 里的未知 key（块已被移除）直接忽略；重复 key 只认第一次出现
 *
 * 说明：本文件用 .js + JSDoc 而非 .ts，是为了让 `node --test` 能在任意 Node 版本
 * 直接导入并真实执行（.ts 依赖 Node 22.18+/24 的类型剥离）；Nuxt 侧 allowJs 已开启。
 */

/** 单块 key：一个 key 对应一个固定类型的内容 */
export const MEMO_SINGLE_BLOCK_KEYS = ['external', 'images', 'music', 'git', 'x', 'memoRef', 'video']

/** @param {string} path @returns {string} */
export const attachmentBlockKey = path => `attachment:${path}`

/** 豆瓣优先用 id（稳定）；缺 id 时退回 `#索引`（删除后会错位，属已知兜底） */
/** @param {{id?: string} | null | undefined} item @param {number} index @returns {string} */
export const doubanBookBlockKey = (item, index) => `doubanBook:${item && item.id ? item.id : `#${index}`}`

/** @param {{id?: string} | null | undefined} item @param {number} index @returns {string} */
export const doubanMovieBlockKey = (item, index) => `doubanMovie:${item && item.id ? item.id : `#${index}`}`

/**
 * 按保存的 order 重排「默认顺序的块列表」。
 * @template {{key: string}} T
 * @param {T[]} blocks 默认顺序的块
 * @param {string[] | null | undefined} order ext.order
 * @returns {T[]}
 */
export function orderMemoBlocks(blocks, order) {
  const list = Array.isArray(blocks) ? blocks : []
  if (!Array.isArray(order) || order.length === 0) return list
  /** @type {Map<string, number>} */
  const rank = new Map()
  for (const raw of order) {
    const key = String(raw || '').trim()
    // 重复 key 只认第一次出现：直接用 Map 构造会保留最后一次，这里显式跳过
    if (key && !rank.has(key)) rank.set(key, rank.size)
  }
  if (!rank.size) return list
  // 未出现在 order 里的块排到最后，并保持默认顺序（index 参与比较即稳定排序）
  const last = Number.MAX_SAFE_INTEGER
  return list
    .map((block, index) => ({ block, index, rank: rank.has(block.key) ? rank.get(block.key) : last }))
    .sort((a, b) => (a.rank === b.rank ? a.index - b.index : a.rank - b.rank))
    .map(entry => entry.block)
}

/**
 * 上移 / 下移一个块，返回新的 key 顺序（越界时原样返回）。
 * @param {string[]} keys @param {string} key @param {number} delta @returns {string[]}
 */
export function moveMemoBlock(keys, key, delta) {
  const list = Array.isArray(keys) ? [...keys] : []
  const from = list.indexOf(key)
  if (from < 0) return list
  const to = from + delta
  if (to < 0 || to >= list.length) return list
  const [moved] = list.splice(from, 1)
  list.splice(to, 0, moved)
  return list
}
