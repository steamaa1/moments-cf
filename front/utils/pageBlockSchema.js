/**
 * 自定义页面组件块注册表：块编辑器（Gutenberg-lite）的 schema 数据源。
 *
 * 七种 kind 与 front/utils/pageBlocks.js 的 SUPPORTED_UI_KINDS 逐字一致，
 * 数据协议与 front/components/page-ui/ 七个组件的 props 契约严格对齐：
 * 每个顶层标量字段与列表项字段都标注 key / label / type（string 或 number）/
 * placeholder / optional，通用表单按它渲染输入项，块编辑器按它组装 data。
 *
 * 字段 optional 语义 = 数据协议里该字段可省略（组件按空值容错），并非「无意义」：
 * 必填字段（如 gallery 的 src、music 的 url/name）缺失时组件渲染空容器。
 *
 * 说明：本文件用 .js + JSDoc 而非 .ts，是为了让 `node --test` 能在任意 Node 版本
 * 直接导入并真实执行（与 pageBlocks.js 同理）；Nuxt 侧 allowJs 已开启。
 * icon 名必须真实存在于 carbon 图标集（tests/source/icon-names.test.mjs 自动校验）。
 */

/**
 * @typedef {'string' | 'number'} BlockFieldType
 */

/**
 * 单个标量字段描述（顶层 fields 与列表项 itemFields 同构）。
 * @typedef {Object} BlockField
 * @property {string} key data 对象上的字段名
 * @property {string} label 表单显示名（中文）
 * @property {BlockFieldType} type 标量类型：string 或 number
 * @property {string} [placeholder] 输入框占位提示
 * @property {boolean} [optional] 可省略（缺省视为必填，表单侧据此标注）
 */

/**
 * 列表字段描述。
 * @typedef {Object} BlockListField
 * @property {string} key data 对象上的数组字段名
 * @property {string} label 列表显示名（中文）
 * @property {Array<BlockField>} itemFields 列表项字段（与 BlockField 同构）
 */

/**
 * 单个组件块的 schema。
 * @typedef {Object} BlockSchema
 * @property {string} kind 组件类型（与 SUPPORTED_UI_KINDS 一致）
 * @property {string} label 中文名（块面板与表单标题用）
 * @property {string} category 分组：交互 / 展示 / 媒体
 * @property {string} icon 块面板图标（carbon 图标名，必须真实存在）
 * @property {Array<BlockField>} fields 顶层标量字段（可为空数组）
 * @property {Array<BlockListField>} [lists] 列表字段（无列表的 kind 不写）
 */

/** 组件块注册表：kind → schema。键集合必须与 SUPPORTED_UI_KINDS 双向一致（单元测试兜底） */
export const PAGE_BLOCK_REGISTRY = {
  button: {
    kind: 'button',
    label: '按钮组',
    category: '交互',
    icon: 'i-carbon-link',
    fields: [],
    lists: [
      {
        key: 'items',
        label: '按钮',
        itemFields: [
          { key: 'label', label: '文字', type: 'string', placeholder: '首页' },
          { key: 'href', label: '链接', type: 'string', placeholder: '/' },
          { key: 'icon', label: '图标', type: 'string', placeholder: 'i-carbon-home', optional: true },
        ],
      },
    ],
  },
  card: {
    kind: 'card',
    label: '卡片网格',
    category: '展示',
    icon: 'i-carbon-grid',
    fields: [
      { key: 'columns', label: '列数', type: 'number', placeholder: '2', optional: true },
    ],
    lists: [
      {
        key: 'items',
        label: '卡片',
        itemFields: [
          { key: 'icon', label: '图标', type: 'string', placeholder: 'i-carbon-star', optional: true },
          { key: 'title', label: '标题', type: 'string', placeholder: '收藏' },
          { key: 'desc', label: '描述', type: 'string', placeholder: '我的书签', optional: true },
          { key: 'href', label: '链接', type: 'string', placeholder: '/tags', optional: true },
        ],
      },
    ],
  },
  countdown: {
    kind: 'countdown',
    label: '倒计时',
    category: '展示',
    icon: 'i-carbon-timer',
    fields: [
      { key: 'target', label: '目标时间', type: 'string', placeholder: '2027-01-01 00:00:00' },
      { key: 'label', label: '前缀文案', type: 'string', placeholder: '距离新年还有', optional: true },
      { key: 'doneText', label: '完成文案', type: 'string', placeholder: '已结束', optional: true },
    ],
  },
  timeline: {
    kind: 'timeline',
    label: '时间线',
    category: '展示',
    icon: 'i-carbon-event',
    fields: [],
    lists: [
      {
        key: 'items',
        label: '节点',
        itemFields: [
          { key: 'time', label: '时间', type: 'string', placeholder: '2026-10-01', optional: true },
          { key: 'title', label: '标题', type: 'string', placeholder: '项目启动' },
          { key: 'desc', label: '描述', type: 'string', placeholder: '第一版上线', optional: true },
        ],
      },
    ],
  },
  gallery: {
    kind: 'gallery',
    label: '图片网格',
    category: '媒体',
    icon: 'i-carbon-image',
    fields: [],
    lists: [
      {
        key: 'items',
        label: '图片',
        itemFields: [
          { key: 'src', label: '图片地址', type: 'string', placeholder: '/upload/media/2026/10/01/a.jpg' },
          { key: 'caption', label: '说明文字', type: 'string', placeholder: '日出', optional: true },
        ],
      },
    ],
  },
  music: {
    kind: 'music',
    label: '音乐播放器',
    category: '媒体',
    icon: 'i-carbon-music',
    fields: [
      { key: 'url', label: '音频地址', type: 'string', placeholder: '/upload/media/2026/10/01/a.mp3' },
      { key: 'name', label: '歌曲名', type: 'string', placeholder: '晴天' },
      { key: 'artist', label: '歌手', type: 'string', placeholder: '周杰伦', optional: true },
      { key: 'cover', label: '封面地址', type: 'string', placeholder: '/upload/media/2026/10/01/cover.jpg', optional: true },
    ],
  },
  icons: {
    kind: 'icons',
    label: '图标网格',
    category: '交互',
    icon: 'i-carbon-category',
    fields: [],
    lists: [
      {
        key: 'items',
        label: '图标',
        itemFields: [
          { key: 'icon', label: '图标', type: 'string', placeholder: 'i-carbon-home 或 emoji' },
          { key: 'label', label: '文字', type: 'string', placeholder: '首页', optional: true },
          { key: 'href', label: '链接', type: 'string', placeholder: '/', optional: true },
        ],
      },
    ],
  },
}

/**
 * 按 kind 取组件块 schema。
 * @param {string | null | undefined} kind 组件类型
 * @returns {BlockSchema | null} 未注册的 kind 返回 null
 */
export function getPageBlockSchema(kind) {
  return PAGE_BLOCK_REGISTRY[kind] || null
}
