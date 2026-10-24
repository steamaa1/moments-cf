/**
 * 自定义页面组件块注册表：块编辑器（Gutenberg-lite）的 schema 数据源。
 *
 * 注册表 kind 与 front/utils/pageBlocks.js 的 SUPPORTED_UI_KINDS 逐字一致，
 * 数据协议与 front/components/page-ui/ 各组件 props 契约严格对齐：
 * 每个顶层标量字段与列表项字段都标注 key / label / type（string / number /
 * textarea / select）/ placeholder / optional，通用表单按它渲染输入项，
 * 块编辑器按它组装 data。select 额外带 options（{ value, label }），字段可带
 * default（新增块时由 createPageBlockData 写入初始值）。
 *
 * 字段 optional 语义 = 数据协议里该字段可省略（组件按空值容错），并非「无意义」：
 * 必填字段（如 gallery 的 src、music 的 url/name）缺失时组件渲染空容器。
 *
 * 说明：本文件用 .js + JSDoc 而非 .ts，是为了让 `node --test` 能在任意 Node 版本
 * 直接导入并真实执行（与 pageBlocks.js 同理）；Nuxt 侧 allowJs 已开启。
 * icon 名必须真实存在于 carbon 图标集（tests/source/icon-names.test.mjs 自动校验）。
 */

/**
 * @typedef {'string' | 'number' | 'textarea' | 'select' | 'image' | 'icon' | 'datetime'} BlockFieldType
 */

/**
 * 单个标量字段描述（顶层 fields 与列表项 itemFields 同构）。
 * @typedef {Object} BlockField
 * @property {string} key data 对象上的字段名
 * @property {string} label 表单显示名（中文）
 * @property {BlockFieldType} type 类型：string / number / textarea / select / image / icon / datetime
 * @property {string} [placeholder] 输入框占位提示
 * @property {boolean} [optional] 可省略（缺省视为必填，表单侧据此标注）
 * @property {Array<{ value: string, label: string }>} [options] select 的选项
 * @property {string | number} [default] 新增块时的默认值（仅顶层字段生效）
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
 * @property {string} category 分组：交互 / 展示 / 媒体 / 高级
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
          { key: 'icon', label: '图标', type: 'icon', placeholder: 'i-carbon-home', optional: true },
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
          { key: 'icon', label: '图标', type: 'icon', placeholder: 'i-carbon-star', optional: true },
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
      { key: 'target', label: '目标时间', type: 'datetime' },
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
          { key: 'src', label: '图片地址', type: 'image', placeholder: '/upload/media/2026/10/01/a.jpg' },
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
      { key: 'cover', label: '封面地址', type: 'image', placeholder: '/upload/media/2026/10/01/cover.jpg', optional: true },
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
          { key: 'icon', label: '图标', type: 'icon', placeholder: 'i-carbon-home 或 emoji' },
          { key: 'label', label: '文字', type: 'string', placeholder: '首页', optional: true },
          { key: 'href', label: '链接', type: 'string', placeholder: '/', optional: true },
        ],
      },
    ],
  },
  callout: {
    kind: 'callout',
    label: '提示框',
    category: '展示',
    icon: 'i-carbon-notification',
    fields: [
      {
        key: 'tone',
        label: '样式',
        type: 'select',
        options: [
          { value: 'info', label: '提示（蓝）' },
          { value: 'warning', label: '警告（黄）' },
          { value: 'success', label: '成功（绿）' },
          { value: 'danger', label: '危险（红）' },
        ],
        default: 'info',
      },
      { key: 'title', label: '标题', type: 'string', placeholder: '注意', optional: true },
      { key: 'text', label: '正文', type: 'textarea', placeholder: '支持 markdown，如 **加粗**', optional: true },
      { key: 'icon', label: '图标', type: 'icon', placeholder: 'i-carbon-information-filled', optional: true },
    ],
  },
  accordion: {
    kind: 'accordion',
    label: '折叠面板',
    category: '展示',
    icon: 'i-carbon-chevron-down',
    fields: [],
    lists: [
      {
        key: 'items',
        label: '条目',
        itemFields: [
          { key: 'title', label: '标题', type: 'string', placeholder: '如何投稿' },
          { key: 'text', label: '正文', type: 'textarea', placeholder: '支持 markdown', optional: true },
        ],
      },
    ],
  },
  video: {
    kind: 'video',
    label: '视频',
    category: '媒体',
    icon: 'i-carbon-video',
    fields: [
      { key: 'src', label: '视频地址', type: 'string', placeholder: '/upload/media/…/a.mp4 或 https://…' },
      { key: 'poster', label: '封面地址', type: 'image', placeholder: '/upload/media/…/cover.jpg', optional: true },
      { key: 'caption', label: '说明文字', type: 'string', placeholder: '片头', optional: true },
      {
        key: 'ratio',
        label: '宽高比',
        type: 'select',
        options: [
          { value: '16:9', label: '16:9（宽屏）' },
          { value: '4:3', label: '4:3' },
          { value: '1:1', label: '1:1（方形）' },
          { value: '21:9', label: '21:9（超宽）' },
          { value: '9:16', label: '9:16（竖屏）' },
        ],
        default: '16:9',
        optional: true,
      },
    ],
  },
  links: {
    kind: 'links',
    label: '链接列表',
    category: '交互',
    icon: 'i-carbon-link',
    fields: [],
    lists: [
      {
        key: 'items',
        label: '链接',
        itemFields: [
          { key: 'name', label: '名称', type: 'string', placeholder: '友链 A' },
          { key: 'href', label: '地址', type: 'string', placeholder: 'https://example.com' },
          { key: 'desc', label: '描述', type: 'string', placeholder: '一句话介绍', optional: true },
          { key: 'icon', label: '图标', type: 'icon', placeholder: 'i-carbon-link', optional: true },
        ],
      },
    ],
  },
  stats: {
    kind: 'stats',
    label: '数据统计',
    category: '展示',
    icon: 'i-carbon-chart-line',
    fields: [
      { key: 'columns', label: '列数', type: 'number', placeholder: '3', default: 3, optional: true },
    ],
    lists: [
      {
        key: 'items',
        label: '数据项',
        itemFields: [
          { key: 'value', label: '数值', type: 'string', placeholder: '128' },
          { key: 'label', label: '标签', type: 'string', placeholder: '篇动态', optional: true },
          { key: 'unit', label: '单位', type: 'string', placeholder: '万', optional: true },
        ],
      },
    ],
  },
  columns: {
    kind: 'columns',
    label: '分栏',
    category: '展示',
    icon: 'i-carbon-column',
    fields: [],
    lists: [
      {
        key: 'items',
        label: '栏',
        itemFields: [
          { key: 'title', label: '小标题', type: 'string', placeholder: '关于我', optional: true },
          { key: 'text', label: '正文', type: 'textarea', placeholder: '支持 markdown' },
        ],
      },
    ],
  },
  embed: {
    kind: 'embed',
    label: 'HTML 嵌入',
    category: '高级',
    icon: 'i-carbon-code',
    fields: [
      { key: 'html', label: 'HTML', type: 'textarea', placeholder: '<div class="p-4">任意 HTML</div>' },
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

/**
 * 新建块时的初始 data：顶层字段取 schema.default，列表字段初始化为空数组。
 *
 * 为什么要有它：没有默认值时新增 callout 会得到 {}，tone 的 select 显示空白；
 * video 的 ratio 也一样。默认值写在 schema 一处，编辑器（块模式 / 源码模式插入模态）
 * 共用这个函数，避免两边各写一份初始化分支。未注册 kind 返回空对象。
 *
 * 注意：default 只对顶层字段生效——列表项没有「默认行」，由用户点「加一行」创建。
 * @param {string} kind 组件类型
 * @returns {Record<string, any>} 可直接作为块 data 的对象
 */
export function createPageBlockData(kind) {
  const schema = getPageBlockSchema(kind)
  if (!schema) return {}
  const data = {}
  for (const field of schema.fields || []) {
    if (field.default !== undefined) data[field.key] = field.default
  }
  for (const list of schema.lists || []) data[list.key] = []
  return data
}
