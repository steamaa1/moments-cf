/**
 * 自定义页面正文的块解析器：把「markdown + 组件围栏」的混合文本拆成有序块数组。
 *
 * 落盘位置 `custom_pages.content`：一段 UTF-8 文本，编辑器用三反引号围栏嵌入组件：
 *   ```ui:button
 *   { "items": [{ "label": "首页", "href": "/" }] }
 *   ```
 * 围栏开头行的 kind 决定组件类型（见 SUPPORTED_UI_KINDS），内部是一段 JSON。
 *
 * 解析规则（有单元测试兜底，见 tests/unit/page-blocks.test.mjs）：
 *   1. 逐行扫描，围栏外的一切行按原顺序累积为 type: 'markdown' 的块（空片段不输出）
 *   2. kind 属于 SUPPORTED_UI_KINDS 且内部 JSON.parse 成功 → 输出 type: 'ui' 的块（带 kind 与 data）
 *   3. 未知 kind、坏 JSON、未闭合围栏 → 整块按原文并入 markdown 流，绝不丢弃用户文字
 *   4. 任何输入（null / 非字符串 / 空串）都不抛错，最坏返回空数组
 *
 * 反向 serializePageBlocks（块编辑器落盘用）：把块数组拼回同构文本，与
 * parsePageBlocks 互为逆操作——parse(serialize(blocks)) 与 blocks deepEqual。
 * markdown 块的 value 逐字原样输出（含普通代码围栏、未知 kind 围栏、坏 JSON
 * 围栏的原文），块之间用单个换行连接；ui 块输出三行围栏。
 *
 * 说明：本文件用 .js + JSDoc 而非 .ts，是为了让 `node --test` 能在任意 Node 版本
 * 直接导入并真实执行（.ts 依赖 Node 22.18+/24 的类型剥离）；Nuxt 侧 allowJs 已开启。
 */

/** 根级路由保留字：这些路径已被现有页面/接口占用，自定义页面不得使用（与 worker/src/index.js 保持逐字一致同序） */
export const RESERVED_PAGE_SLUGS = ['about', 'friend', 'photos', 'new', 'edit', 'user', 'sys', 'memo', 'tags', 'api', 'upload', 'rss', 'x-media', 'douban-cover', 'page']

/** slug 约束：小写字母、数字、连字符，1 到 40 位。刻意不加 g 标志，避免复用同一正则时的 lastIndex 陷阱 */
export const SLUG_PATTERN = /^[a-z0-9-]{1,40}$/

/** 支持的组件 kind：与 PageRenderer 的分发集合一致（tests/source 契约测试会比对两侧） */
export const SUPPORTED_UI_KINDS = ['button', 'card', 'countdown', 'timeline', 'gallery', 'music', 'icons']

/** 围栏开头行：三反引号 + ui: + kind（容忍少量前导/尾随空白） */
const FENCE_OPEN_RE = /^\s*```\s*ui:([A-Za-z0-9_-]+)\s*$/

/** 围栏闭合行：整行内容恰为三反引号 */
const FENCE_CLOSE_RE = /^\s*```\s*$/

/**
 * 把自定义页面正文解析成有序块数组。
 * @param {string | null | undefined} content custom_pages.content 原文
 * @returns {Array<{ type: 'markdown', value: string } | { type: 'ui', kind: string, data: any }>}
 */
export function parsePageBlocks(content) {
  const lines = typeof content === 'string' ? content.split('\n') : []
  /** @type {Array<{ type: 'markdown', value: string } | { type: 'ui', kind: string, data: any }>} */
  const blocks = []
  /** @type {string[]} */
  let text = []
  const flushText = () => {
    const value = text.join('\n')
    if (value.trim()) blocks.push({ type: 'markdown', value })
    text = []
  }
  let i = 0
  while (i < lines.length) {
    const open = FENCE_OPEN_RE.exec(lines[i])
    if (!open) {
      text.push(lines[i])
      i += 1
      continue
    }
    // 向后寻找闭合围栏；找不到视为未闭合，开头行按普通文本处理，后续行照常累积
    let close = -1
    for (let j = i + 1; j < lines.length; j += 1) {
      if (FENCE_CLOSE_RE.test(lines[j])) {
        close = j
        break
      }
    }
    if (close < 0) {
      text.push(lines[i])
      i += 1
      continue
    }
    const kind = open[1]
    // JSON.parse 失败时置 undefined（它本身永远不会返回 undefined，可安全当失败标记）
    let data
    try {
      data = JSON.parse(lines.slice(i + 1, close).join('\n'))
    } catch {
      data = undefined
    }
    if (SUPPORTED_UI_KINDS.includes(kind) && data !== undefined) {
      flushText()
      blocks.push({ type: 'ui', kind, data })
    } else {
      // 未知 kind 或坏 JSON：整块（含首尾围栏行）原文并入 markdown 流
      for (let j = i; j <= close; j += 1) text.push(lines[j])
    }
    i = close + 1
  }
  flushText()
  return blocks
}

/**
 * 把有序块数组序列化回「markdown + 组件围栏」的落盘文本（parsePageBlocks 的逆操作）。
 *
 * 规则：
 *   1. markdown 块：value 逐字原样输出，不做任何加工（trim/转义/换行重排都会破坏往返）。
 *      未知 kind、坏 JSON 在 parse 时已按原文并入 markdown 块，这里原样写回即天然保真。
 *   2. ui 块：输出三行围栏——首行 ```ui:<kind>，中间一行 JSON.stringify(data)，末行 ```。
 *      kind 里的非 [A-Za-z0-9_-] 字符会被剔除（防注入额外行破坏围栏结构）；
 *      data 不可序列化（undefined / 循环引用等）时写 'null'，保证输出永远可被 parse 收回。
 *   3. 纯空白的 markdown 片段跳过不输出（与 parse 的 flushText 语义对称：空片段不产块）。
 *   4. 块与块之间用单个换行连接：markdown value 自带的行首/行尾空行会与分隔换行自然
 *      合并，保证 parse(serialize(blocks)) 与 blocks deepEqual。
 *   5. 任何输入不抛错：非数组（null / undefined / 对象等）返回空串。
 *
 * @param {Array<{ type: 'markdown', value: string } | { type: 'ui', kind: string, data: any } | null | undefined>} blocks
 * @returns {string}
 */
export function serializePageBlocks(blocks) {
  if (!Array.isArray(blocks)) return ''
  /** @type {string[]} */
  const parts = []
  for (const block of blocks) {
    if (!block || typeof block !== 'object') continue
    if (block.type === 'ui') {
      const kind = String(block.kind || '').replace(/[^A-Za-z0-9_-]/g, '')
      // JSON.stringify 对 undefined / function 返回 undefined，对循环引用抛错——都收敛为 'null'
      let json
      try {
        json = JSON.stringify(block.data)
      } catch {
        json = undefined
      }
      parts.push('```ui:' + kind + '\n' + (json === undefined ? 'null' : json) + '\n```')
    } else {
      const value = typeof block.value === 'string' ? block.value : String(block.value ?? '')
      if (!value.trim()) continue
      parts.push(value)
    }
  }
  return parts.join('\n')
}
