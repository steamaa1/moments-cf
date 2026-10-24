/**
 * 块参数表单常用图标清单（PageBlockField 的图标选择器与编辑器「插入图标」共用）。
 *
 * 约束：每一项都必须是 @iconify-json/carbon 里真实存在的图标名。@nuxt/icon 对不存在的
 * 名字既不报错也不告警，只渲染空白（见 AGENTS.md Pitfalls），因此清单只增不减地维护，
 * 且 tests/source/icon-names.test.mjs 会扫描 front 全部源码里的 i-carbon-* 名字做校验。
 */
export const ICON_PRESETS = [
  'i-carbon-home', 'i-carbon-star', 'i-carbon-favorite', 'i-carbon-user', 'i-carbon-image',
  'i-carbon-camera', 'i-carbon-music', 'i-carbon-video', 'i-carbon-email', 'i-carbon-link',
  'i-carbon-calendar', 'i-carbon-location', 'i-carbon-search', 'i-carbon-settings', 'i-carbon-download',
]
