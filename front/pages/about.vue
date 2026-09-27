<template>
  <div>
    <Header :user="currentUser"/>
    <main class="about-shell px-5 pb-12 pt-3">
      <div class="about-heading">
        <span class="about-icon"><UIcon name="i-carbon-information" class="h-6 w-6"/></span>
        <div><p class="text-xs font-semibold uppercase tracking-[.18em] text-[#78943f]">About</p><h1 class="mt-1 text-2xl font-bold text-gray-900 dark:text-gray-50">关于</h1></div>
      </div>
      <article class="markdown-content about-content" v-html="content"/>
    </main>
  </div>
</template>

<script setup lang="ts">
import markdownit from 'markdown-it'
import type { SysConfigVO, UserVO } from '~/types'
import site from '~/site.config'

const config = useState<SysConfigVO>('sysConfig')
const currentUser = useState<UserVO>('userinfo')
const publicConfig = await useMyFetch<SysConfigVO>('/sysConfig/get')
Object.assign(config.value, publicConfig)
if (!config.value.enableAbout) await navigateTo('/', { replace: true })
const renderer = markdownit({ html: true, linkify: true, typographer: true, breaks: true })
// 本站媒体（/upload/ 前缀）绝对 URL 规范化为相对路径（防止跨域 CORB）。
const defaultAboutImage = renderer.renderer.rules.image || ((tokens: any, idx: number, options: any, env: any, self: any) => self.renderToken(tokens, idx, options))
renderer.renderer.rules.image = (tokens: any, idx: number, options: any, env: any, self: any) => {
  const src = tokens[idx].attrGet('src') || ''
  if (/^https?:\/\/[^/]+\/upload\//.test(src)) tokens[idx].attrSet('src', src.replace(/^https?:\/\/[^/]+/, ''))
  return defaultAboutImage(tokens, idx, options, env, self)
}
const content = computed(() => renderer.render(config.value.aboutContent || ''))
useHead({ title: `关于 - ${config.value.title || site.title}` })
</script>

<style scoped>
.about-shell { max-width: 48rem; margin-inline: auto; overflow-x: clip; }
.about-heading { display: flex; align-items: center; gap: 14px; margin: 12px 0 24px; }
.about-icon { display: grid; width: 48px; height: 48px; place-items: center; border-radius: 16px; color: #78943f; background: rgba(159,200,74,.14); }
.about-content :deep(*) { max-width: 100%; }
.about-content :deep(img), .about-content :deep(video), .about-content :deep(table), .about-content :deep(pre), .about-content :deep(iframe) { max-width: 100%; height: auto; }
.about-content :deep(pre), .about-content :deep(code) { white-space: pre-wrap; word-break: break-all; }
.about-content :deep(table) { display: block; overflow-x: auto; }
/* 关于页复用 .markdown-content，但那是为时间线短动态调过的紧凑样式
   （`.markdown-content p { margin-bottom: .1rem }`、h1 只有 16px），长文里
   段落空行与标题层级会被压平，看起来像「打了回车/空行也不换行」。
   这里只在关于页内按长文重设层级，不碰时间线共用的 simple-markdown.scss。 */
.about-content { min-height: 180px; padding: clamp(20px, 5vw, 36px); border: 1px solid rgba(161,161,170,.18); border-radius: 20px; background: rgba(255,255,255,.78); box-shadow: 0 16px 50px rgba(24,24,27,.07); line-height: 1.8; overflow-x: hidden; overflow-wrap: anywhere; word-break: break-word; }
/* 段落/列表：空行必须看得出来 */
.about-content :deep(p) { margin: 0 0 1em; }
/* 列表左缩进沿用 simple-markdown.scss 的 margin-left: 1rem，只补段间距 */
.about-content :deep(ul), .about-content :deep(ol) { margin: 0 0 1em 1rem; }
.about-content :deep(li) { margin: .25em 0; }
.about-content :deep(li p) { margin-bottom: .35em; }
.about-content :deep(> :first-child) { margin-top: 0; }
.about-content :deep(> :last-child) { margin-bottom: 0; }
/* 标题层级：覆盖时间线那套 h1=16px / h6=11px */
.about-content :deep(h1) { font-size: 1.5rem; line-height: 1.35; margin: 1.8rem 0 .8rem; }
.about-content :deep(h2) { font-size: 1.25rem; line-height: 1.4; margin: 1.6rem 0 .7rem; }
.about-content :deep(h3) { font-size: 1.1rem; line-height: 1.45; margin: 1.4rem 0 .6rem; }
.about-content :deep(h4) { font-size: 1rem; line-height: 1.5; margin: 1.2rem 0 .5rem; }
.about-content :deep(h5), .about-content :deep(h6) { font-size: .95rem; line-height: 1.5; margin: 1rem 0 .5rem; }
/* 引用 / 分割线 / 表格 / 行内代码 */
.about-content :deep(blockquote) { margin: 1.2rem 0; padding: .5rem .9rem; border-left: 4px solid #9fc84a; border-radius: 8px; background: rgba(159,200,74,.10); }
.about-content :deep(blockquote p) { margin: .25em 0; line-height: 1.75; }
.about-content :deep(hr) { margin: 1.8rem 0; }
.about-content :deep(th), .about-content :deep(td) { border-color: rgba(161,161,170,.28); }
.about-content :deep(p > code), .about-content :deep(li > code) { background: rgba(161,161,170,.16); color: inherit; border-radius: .3rem; }
/* 普通代码块给底色（shiki 自带内联底色，排除掉不与它抢） */
.about-content :deep(pre:not(.shiki)) { margin: 0 0 1em; padding: .7rem .9rem; border-radius: 8px; background: rgba(161,161,170,.14); }
/* 深色模式必须写成 `.dark .about-content`：Vue 3.5 的 scoped 编译会把
   `:global(.dark)` 之后的后代选择器整段丢掉，只剩裸 `.dark`（本页原先即踩此坑）。 */
.dark .about-content { color: #e5e5e5; border-color: rgba(113,113,122,.24); background: rgba(38,38,38,.78); box-shadow: none; }
.dark .about-content :deep(blockquote) { background: rgba(159,200,74,.14); color: #e5e5e5; }
.dark .about-content :deep(th), .dark .about-content :deep(td) { border-color: rgba(113,113,122,.45); }
.dark .about-content :deep(p > code), .dark .about-content :deep(li > code) { background: rgba(255,255,255,.12); color: #e5e5e5; }
.dark .about-content :deep(pre:not(.shiki)) { background: rgba(255,255,255,.10); }
</style>
