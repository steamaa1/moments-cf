// 关于页（/about）长文体排版回归。
// 背景：关于页正文容器沿用时间线的 `.markdown-content` 紧凑样式
// （`p { margin-bottom: .1rem }`、`h1 { font-size: 16px }`），长文里段落空行与标题层级
// 被压平，用户看到的就是「打了回车/空行也不换行」。换行本身由 markdown-it 的
// breaks:true 渲染成 <br>，所以修复只能落在关于页自身的排印覆盖上。
// 另一处坑：Vue 3.5.13 的 scoped 编译会把 `:global(.dark) X` 的后代选择器丢掉，
// 只剩裸 `.dark`（因此深色规则必须写成 `.dark .about-content`）。
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const aboutRaw = await readFile(new URL('../../front/pages/about.vue', import.meta.url), 'utf8')
const markdownScss = await readFile(new URL('../../front/assets/simple-markdown.scss', import.meta.url), 'utf8')
// 注释里会引用被禁用的写法，断言分别在「去代码注释」与「去块注释」的文本上做。
const code = aboutRaw.replace(/<!--[\s\S]*?-->/g, '').replace(/^\s*\/\/.*$/gm, '')
const css = aboutRaw.replace(/\/\*[\s\S]*?\*\//g, '')

// 1) 渲染层：换行能力保留，且不得用 white-space 绕行
assert.match(code, /markdownit\(\{[^}]*breaks:\s*true/, '关于页必须保留 markdown-it 的 breaks: true（单换行渲染为 <br>）')
// 卡片规则的类名挂在 <article> 上，模板换元素会让卡片样式整体失效，这里把元素也锚住。
assert.match(aboutRaw, /<article class="markdown-content about-content"/, '关于页正文必须是 <article class="markdown-content about-content">')
assert.match(code, /v-html="content"/, '关于页正文仍由 v-html 渲染')
assert.doesNotMatch(css, /white-space:\s*pre-line/, '不得用 white-space: pre-line 冒充换行')

// 2) 深色模式：本页不得出现任何 :global(...)（会丢掉后代选择器），且卡片必须显式给文字色
assert.doesNotMatch(css, /:global\(/, ':global(...) 的后代选择器会被 Vue scoped 编译丢弃，请写 .dark .about-content')
const darkCard = css.match(/\.dark \.about-content\s*\{([^}]*)\}/)
assert.ok(darkCard, '关于卡片必须有编译正确的深色规则')
assert.match(darkCard[1], /color:\s*#/, '深色卡片必须显式给文字色，不能只靠 color-scheme 继承')

// 3) 长文体排印覆盖：每条规则都必须真的存在（漏写 :deep( 会静默失效）
const selectorEscaped = (selector) => selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const ruleOf = (selector) => {
  const match = css.match(new RegExp(`${selectorEscaped(selector)}[^{}]*\\{([^}]*)\\}`))
  assert.ok(match, `缺少规则：${selector}`)
  return match[1]
}
for (const selector of [
  '.about-content {',
  '.about-content :deep(p)',
  '.about-content :deep(ul)',
  '.about-content :deep(ol)',
  '.about-content :deep(li)',
  '.about-content :deep(li p)',
  '.about-content :deep(> :first-child)',
  '.about-content :deep(> :last-child)',
  '.about-content :deep(h1)',
  '.about-content :deep(h2)',
  '.about-content :deep(h3)',
  '.about-content :deep(h4)',
  '.about-content :deep(h5)',
  '.about-content :deep(h6)',
  '.about-content :deep(blockquote)',
  '.about-content :deep(blockquote p)',
  '.about-content :deep(hr)',
  '.about-content :deep(th)',
  '.about-content :deep(td)',
  '.about-content :deep(p > code)',
  '.about-content :deep(li > code)',
  '.about-content :deep(pre:not(.shiki))',
  '.dark .about-content :deep(blockquote)',
  '.dark .about-content :deep(th)',
  '.dark .about-content :deep(td)',
  '.dark .about-content :deep(p > code)',
  '.dark .about-content :deep(pre:not(.shiki))',
]) {
  if (selector === '.about-content {') assert.match(css, /\.about-content\s*\{/, '缺少卡片规则：.about-content')
  else ruleOf(selector)
}
// v-html 注入的子元素不带 scope 属性，`标签` 必须包在 :deep(...) 里才能命中
assert.doesNotMatch(css, /\.about-content\s+[a-zA-Z][\w-]*/, '子元素选择器必须写成 :deep(标签)，否则编译成 ... 标签[data-v-*] 永远匹配不到')

// 4) 数值下限
const declOf = (body, property) => {
  const match = body.match(new RegExp(`(?:^|;)\\s*${property}:\\s*([^;]+)`))
  assert.ok(match, `规则缺少 ${property}：${body.trim()}`)
  return match[1].trim()
}
/** 取带 em/rem 的最后一个值，兼容 margin 简写（如 `0 0 1em 1rem`）。 */
const lengthIn = (body, property) => {
  const raw = declOf(body, property)
  const values = [...raw.matchAll(/([\d.]+)(em|rem)/g)]
  assert.ok(values.length > 0, `${property} 应使用 em/rem 单位：${raw}`)
  const last = values[values.length - 1]
  return { value: Number(last[1]), unit: last[2] }
}
const unitlessIn = (body, property) => {
  const raw = declOf(body, property)
  const match = raw.match(/^([\d.]+)$/)
  assert.ok(match, `${property} 应为无单位数值：${raw}`)
  return Number(match[1])
}

const pRule = ruleOf('.about-content :deep(p)')
const pMargin = lengthIn(pRule, 'margin')
assert.equal(pMargin.unit, 'em', '段落下间距应用 em，随字号缩放')
assert.ok(pMargin.value >= 0.6, `段落空行必须看得出来（>= .6em），实际 ${pMargin.value}em`)

// 列表左缩进必须沿用 simple-markdown.scss 的 margin-left: 1rem
const listIndent = lengthIn(ruleOf('.about-content :deep(ul)'), 'margin')
assert.equal(listIndent.unit, 'rem', '列表缩进应为 rem')
assert.ok(listIndent.value >= 1, `列表左缩进不得被清零（>= 1rem），实际 ${listIndent.value}rem`)

const heading = (tag, minRem) => {
  const body = ruleOf(`.about-content :deep(${tag})`)
  const size = lengthIn(body, 'font-size')
  assert.equal(size.unit, 'rem', `${tag} 字号应为 rem`)
  assert.ok(size.value >= minRem, `${tag} 字号应 >= ${minRem}rem，实际 ${size.value}rem`)
  const lineHeight = unitlessIn(body, 'line-height')
  assert.ok(lineHeight >= 1.25, `${tag} 行高应 >= 1.25，实际 ${lineHeight}`)
}
heading('h1', 1.25)
heading('h2', 1.1)
heading('h3', 1)
heading('h4', 0.95)
heading('h5', 0.9)
heading('h6', 0.9)

// 5) 修复必须局限在关于页：时间线共用的紧凑样式保持原样
assert.match(
  markdownScss,
  /\.markdown-content\s*\{[\s\S]*?\n\s*p\s*\{\s*margin-bottom:\s*0\.1rem/,
  'simple-markdown.scss 是时间线共用样式，段落下间距必须保持 0.1rem 未被改动',
)
assert.match(markdownScss, /h1\s*\{\s*font-size:\s*16px/, 'simple-markdown.scss 的标题字号不应被改动')

console.log('about-prose-typography: PASS')
