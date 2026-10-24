/**
 * 自定义页面正文的 Markdown 渲染器（展示侧共用）。
 *
 * 为什么单独抽出来：P1 只有 PageRenderer 一处需要渲染 markdown；P2 新增的
 * columns / accordion / callout 三个块内部也允许写 markdown（分栏正文、折叠正文、
 * 提示正文）。如果各自 new 一个 markdown-it，图片绝对地址归一化等规则会各写一份，
 * 迟早漂移。这里收敛成唯一实例，PageRenderer 与 page-ui 组件都从这里取。
 *
 * 配置与 about.vue 一致：html 开启（管理员内容，允许内联 HTML）、linkify、typographer、
 * breaks。图片规则把本站 /upload/ 的绝对 URL 归一化为相对路径——避免跨域被 CORB 拦，
 * 与 PageRenderer 原实现逐字一致。
 *
 * 安全边界：html: true 意味着管理员正文里的原始 HTML 会进入 v-html（innerHTML 插入，
 * <script> 不执行，但 onerror 之类事件属性仍可能触发）。custom_pages 只有管理员能写，
 * 与既有 markdown 正文同一威胁模型；embed 块不引入新的攻击面。
 */
import markdownit from 'markdown-it'

const renderer = markdownit({ html: true, linkify: true, typographer: true, breaks: true })

const defaultImage = renderer.renderer.rules.image
  || ((tokens, idx, options, env, self) => self.renderToken(tokens, idx, options))

renderer.renderer.rules.image = (tokens, idx, options, env, self) => {
  const src = tokens[idx].attrGet('src') || ''
  if (/^https?:\/\/[^/]+\/upload\//.test(src)) tokens[idx].attrSet('src', src.replace(/^https?:\/\/[^/]+/, ''))
  return defaultImage(tokens, idx, options, env, self)
}

/**
 * 渲染一段 markdown 为 HTML。非字符串一律按空串处理（坏数据不抛错）。
 * @param {unknown} value 正文片段
 * @returns {string} HTML
 */
export function renderPageMarkdown(value) {
  return renderer.render(typeof value === 'string' ? value : '')
}
