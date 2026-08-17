<template>
  <Header v-if="memo && memo.user" v-bind:user="memo.user"/>

  <Memo v-if="memo" v-bind:memo="memo"/>

</template>

<script setup lang="ts">
import type {MemoVO, SysConfigVO} from "~/types";
import {memoChangedEvent} from "~/event";

const route = useRoute()
const id = computed(() => Number(route.params.id))
const memo = ref<MemoVO>()
const sysConfig = useState<SysConfigVO>('sysConfig')
const reload = async () => {
  memo.value = await useMyFetch<MemoVO>('/memo/get?id=' + id.value)
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
  const text = String(value.content || '').replace(/[#*`>\[\]]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120)
  const firstImage = String(value.imgs || '').split(',')[0] || ''
  const ogImage = firstImage ? (firstImage.startsWith('http') ? firstImage : seoHost + firstImage) : ''
  useHead({
    title: value.user?.nickname ? `${value.user.nickname} 的动态` : '动态',
    meta: [
      { name: 'description', content: text || `${value.user?.nickname || '有人'} 发布了一条动态` },
      { property: 'og:title', content: value.user?.nickname ? `${value.user.nickname} 的动态` : '动态' },
      { property: 'og:description', content: text },
      { property: 'og:type', content: 'article' },
      ...(ogImage ? [{ property: 'og:image', content: ogImage }] : []),
    ],
  })
}, { immediate: false })


</script>

<style scoped>

</style>