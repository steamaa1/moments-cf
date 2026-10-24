<script setup>
/**
 * 自定义页面渲染器：把 parsePageBlocks 的输出渲染成「markdown + 组件」混合视图。
 *
 * 数据协议见 front/utils/pageBlocks.js：
 *   [{ type: 'markdown', value: '原文' }, { type: 'ui', kind: 'button', data: {...} }]
 * markdown 片段交给 front/utils/pageMarkdown.js 的共享渲染器（与 about.vue 同配置：
 * html 开启、breaks、/upload/ 图片绝对地址归一化为相对路径防 CORB），v-html 输出；
 * ui 块按 kind 显式 map 分发到 page-ui 子组件（kind 集合与 SUPPORTED_UI_KINDS 一致，
 * tests/source 契约测试会比对两侧）。
 */
import { renderPageMarkdown } from '~/utils/pageMarkdown'
import PageUiButton from './page-ui/PageUiButton.vue'
import PageUiCard from './page-ui/PageUiCard.vue'
import PageUiCountdown from './page-ui/PageUiCountdown.vue'
import PageUiTimeline from './page-ui/PageUiTimeline.vue'
import PageUiGallery from './page-ui/PageUiGallery.vue'
import PageUiMusic from './page-ui/PageUiMusic.vue'
import PageUiIcons from './page-ui/PageUiIcons.vue'
import PageUiCallout from './page-ui/PageUiCallout.vue'
import PageUiAccordion from './page-ui/PageUiAccordion.vue'
import PageUiVideo from './page-ui/PageUiVideo.vue'
import PageUiLinks from './page-ui/PageUiLinks.vue'
import PageUiStats from './page-ui/PageUiStats.vue'
import PageUiColumns from './page-ui/PageUiColumns.vue'
import PageUiEmbed from './page-ui/PageUiEmbed.vue'

const props = defineProps({
  /** parsePageBlocks(content) 的输出数组 */
  blocks: { type: Array, default: () => [] },
})

/**
 * kind → 子组件对象（显式 import，绝不用字符串名）。
 *
 * 坑（已踩，2026-10-06 修）：这里原先是字符串名 + `<component :is="'PageUiButton'">`，
 * 结果组件块完全不渲染（Vue 报 "Failed to resolve component: PageUiButton"）。
 * 两个原因叠加：① Nuxt 3 的组件自动导入是编译期按名注入，并不做全局注册，运行时字符串解析不到；
 * ② `components/page-ui/` 是嵌套目录，Nuxt 默认 pathPrefix: true，实际注册名是 PageUiPageUiButton。
 * 显式 import 拿到组件对象再交给 :is，是唯一稳的写法。
 */
const KIND_COMPONENTS = {
  button: PageUiButton,
  card: PageUiCard,
  countdown: PageUiCountdown,
  timeline: PageUiTimeline,
  gallery: PageUiGallery,
  music: PageUiMusic,
  icons: PageUiIcons,
  callout: PageUiCallout,
  accordion: PageUiAccordion,
  video: PageUiVideo,
  links: PageUiLinks,
  stats: PageUiStats,
  columns: PageUiColumns,
  embed: PageUiEmbed,
}

const safeBlocks = computed(() => (Array.isArray(props.blocks) ? props.blocks : []))
</script>

<template>
  <div class="page-renderer">
    <template v-for="(block, index) in safeBlocks" :key="index">
      <div v-if="block.type === 'markdown'" class="markdown-content page-markdown" v-html="renderPageMarkdown(block.value)"/>
      <component :is="KIND_COMPONENTS[block.kind]" v-else-if="block.type === 'ui' && KIND_COMPONENTS[block.kind]" :data="block.data"/>
    </template>
  </div>
</template>

<style scoped>
/* 长文排印覆盖：.markdown-content 全局样式是为时间线短动态调的（段落 .1rem、标题 11–16px），
   这里只在 .page-markdown 内按长文重设层级，不碰 simple-markdown.scss */
.page-renderer { line-height: 1.8; overflow-wrap: anywhere; word-break: break-word; }
.page-markdown { min-width: 0; }
.page-markdown :deep(*) { max-width: 100%; }
.page-markdown :deep(img),
.page-markdown :deep(video),
.page-markdown :deep(table),
.page-markdown :deep(pre),
.page-markdown :deep(iframe) { max-width: 100%; height: auto; }
.page-markdown :deep(pre),
.page-markdown :deep(code) { white-space: pre-wrap; word-break: break-all; }
.page-markdown :deep(table) { display: block; overflow-x: auto; }
.page-markdown :deep(p) { margin: 0 0 1em; }
.page-markdown :deep(ul),
.page-markdown :deep(ol) { margin: 0 0 1em 1rem; }
.page-markdown :deep(li) { margin: .25em 0; }
.page-markdown :deep(li p) { margin-bottom: .35em; }
.page-markdown :deep(> :first-child) { margin-top: 0; }
.page-markdown :deep(> :last-child) { margin-bottom: 0; }
.page-markdown :deep(h1) { font-size: 1.5rem; line-height: 1.35; margin: 1.8rem 0 .8rem; }
.page-markdown :deep(h2) { font-size: 1.25rem; line-height: 1.4; margin: 1.6rem 0 .7rem; }
.page-markdown :deep(h3) { font-size: 1.1rem; line-height: 1.45; margin: 1.4rem 0 .6rem; }
.page-markdown :deep(h4) { font-size: 1rem; line-height: 1.5; margin: 1.2rem 0 .5rem; }
.page-markdown :deep(h5) { font-size: .9rem; line-height: 1.5; margin: 1rem 0 .5rem; }
.page-markdown :deep(h6) { font-size: .8rem; line-height: 1.5; margin: 1rem 0 .5rem; }
.page-markdown :deep(blockquote) { border-left: 4px solid #9fc84a; background: rgba(159, 200, 74, .08); padding: .6rem .9rem; border-radius: 8px; margin: 1rem 0; }
.dark .page-renderer .page-markdown :deep(blockquote) { background: rgba(255, 255, 255, .06); }
</style>
