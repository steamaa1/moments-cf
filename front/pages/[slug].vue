<script setup lang="ts">
/**
 * 根级自定义页面路由（/<slug>，单段动态路由）。
 *
 * 路由优先级说明：
 * - vue-router 中静态路由（/about、/photos、/friend、/user/…、/sys/… 等）的匹配优先级
 *   高于单段动态路由，已有静态页面完全不受影响；自定义页面只能使用未被保留的单段路径。
 * - 两段及以上的路径（如 /foo/bar）不会匹配本页，归通配 404 页 pages/[...slug].vue。
 *
 * 数据流：POST /api/page/get（body: { slug }）→ 失败（不存在/停用/网络）进 404 分支；
 * 成功则正文经 parsePageBlocks 拆块后交给 PageRenderer 渲染（markdown + 组件围栏）。
 */
import type { SysConfigVO, UserVO } from '~/types'
import site from '~/site.config'
import { parsePageBlocks } from '~/utils/pageBlocks'

/** /api/page/get 公开接口返回的四字段（见 worker/src/index.js 的 pageGet） */
type CustomPageVO = { slug: string, title: string, content: string, seoDescription: string }

const config = useState<SysConfigVO>('sysConfig')
const currentUser = useState<UserVO | null>('userinfo')
const route = useRoute()

const page = ref<CustomPageVO | null>(null)

const loadPage = async () => {
  const slug = String(route.params.slug || '')
  try {
    page.value = await useMyFetch<CustomPageVO>('/page/get', { slug })
  } catch {
    // 不存在、已停用或网络失败：统一按 404 分支渲染，不抛错打断路由
    page.value = null
  }
}

await loadPage()

// Nuxt 会在同一路由组件间复用实例（自定义页 /a 跳 /b 时 setup 不会重跑），
// 必须监听 slug 变化重新拉取，否则展示的是上一个自定义页面的内容
watch(() => route.params.slug, () => { loadPage() })

const blocks = computed(() => parsePageBlocks(page.value?.content))

useHead({
  // 与 worker 注入的服务端 meta 同规则：「页面标题 - 站点标题」
  title: () => (page.value ? `${page.value.title} - ${config.value.title || site.title}` : '页面不存在'),
  // 404 分支加 noindex，避免爬虫收录无效路径
  meta: () => (page.value ? [] : [{ name: 'robots', content: 'noindex, nofollow' }]),
})
</script>

<template>
  <div>
    <Header :user="currentUser"/>
    <main v-if="page" class="custom-page-shell px-5 pb-12 pt-3">
      <h1 class="mb-6 text-2xl font-bold text-gray-900 dark:text-gray-50">{{ page.title }}</h1>
      <PageRenderer :blocks="blocks"/>
    </main>
    <div v-else class="flex flex-col items-center justify-center gap-3 py-24">
      <p class="text-7xl font-bold text-gray-300 dark:text-gray-600">404</p>
      <p class="text-gray-500">页面不存在</p>
      <UButton to="/" color="white">返回首页</UButton>
    </div>
  </div>
</template>

<style scoped>
/* 48rem 居中容器与 about.vue 同宽；正文排印（含深色规则）由 PageRenderer 的 .page-markdown 负责 */
.custom-page-shell { max-width: 48rem; margin-inline: auto; overflow-x: clip; }
</style>
