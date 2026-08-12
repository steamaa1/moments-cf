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
.about-content { min-height: 180px; padding: clamp(20px, 5vw, 36px); border: 1px solid rgba(161,161,170,.18); border-radius: 20px; background: rgba(255,255,255,.78); box-shadow: 0 16px 50px rgba(24,24,27,.07); line-height: 1.8; overflow-x: hidden; overflow-wrap: anywhere; word-break: break-word; }
.about-content :deep(*) { max-width: 100%; }
.about-content :deep(img), .about-content :deep(video), .about-content :deep(table), .about-content :deep(pre), .about-content :deep(iframe) { max-width: 100%; height: auto; }
.about-content :deep(pre), .about-content :deep(code) { white-space: pre-wrap; word-break: break-all; }
.about-content :deep(table) { display: block; overflow-x: auto; }
:global(.dark) .about-content { border-color: rgba(113,113,122,.24); background: rgba(38,38,38,.78); box-shadow: none; }
</style>
