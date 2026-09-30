<template>
  <Header v-if="memo && memo.user" v-bind:user="memo.user"/>

  <Memo v-if="memo" v-bind:memo="memo"/>

  <div v-if="loadError" class="flex flex-col items-center justify-center gap-3 py-24">
    <p class="text-7xl font-bold text-gray-300 dark:text-gray-600">404</p>
    <p class="text-gray-500">你无权访问该动态，该动态可能删除或设为隐私</p>
    <UButton to="/" color="white">返回首页</UButton>
  </div>
</template>

<script setup lang="ts">
import type {MemoVO, SysConfigVO} from "~/types";
import {memoChangedEvent} from "~/event";

const route = useRoute()
const id = computed(() => Number(route.params.id))
const memo = ref<MemoVO>()
const loadError = ref(false)
const sysConfig = useState<SysConfigVO>('sysConfig')
const reload = async () => {
  try {
    memo.value = await useMyFetch<MemoVO>('/memo/get?id=' + id.value)
    loadError.value = false
  } catch {
    // 不存在（404）与无权限（403，私密/定时未发布且非作者）统一呈现，避免向访客泄露动态是否存在
    memo.value = undefined
    loadError.value = true
  }
}

const stopMemoChanged = memoChangedEvent.on(async () => {
  await reload()
})
onBeforeUnmount(() => stopMemoChanged())
onMounted(async () => {
  await reload()
})
watch(id, async (value, previous) => {
  if (value > 0 && value !== previous) await reload()
})

// SEO：动态标题/摘要/首图；canonical/og:url 由 layouts/default.vue 统一输出
watch(memo, (value) => {
  if (!value) return
  const seoHost = ((sysConfig.value?.siteUrl || (typeof window !== 'undefined' ? window.location.origin : '')) || '').replace(/\/+$/, '')
  const text = String(value.content || '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[>#*_`~]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const fallbackTitle = value.user?.nickname ? `${value.user.nickname} 的动态` : '动态'
  const pageTitle = text ? (text.length > 40 ? `${text.slice(0, 40)}…` : text) : fallbackTitle
  const firstImage = String(value.imgs || '').split(',')[0] || ''
  const ogImage = firstImage ? (firstImage.startsWith('http') ? firstImage : seoHost + firstImage) : ''
  useHead({
    title: pageTitle,
    meta: [
      { name: 'description', content: text.slice(0, 120) || `${value.user?.nickname || '有人'} 发布了一条动态` },
      { property: 'og:title', content: pageTitle },
      { name: 'twitter:title', content: pageTitle },
      { property: 'og:description', content: text },
      { property: 'og:type', content: 'article' },
      ...(ogImage ? [{ property: 'og:image', content: ogImage }] : []),
    ],
  })
}, { immediate: false })

// 加载失败时同步 noindex 与标题，与 worker 侧 pageSeo 的私密动态 noindex 策略一致
watch(loadError, (value) => {
  if (!value) return
  useHead({ title: '动态不可访问' })
  useHead({ meta: [{ name: 'robots', content: 'noindex, nofollow' }] })
})
</script>

<style scoped>

</style>