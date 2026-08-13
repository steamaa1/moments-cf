<template>
  <Header v-if="memo && memo.user" v-bind:user="memo.user"/>

  <Memo v-if="memo" v-bind:memo="memo"/>

</template>

<script setup lang="ts">
import type {MemoVO} from "~/types";
import {memoChangedEvent} from "~/event";

const route = useRoute()
const id = computed(() => Number(route.params.id))
const memo = ref<MemoVO>()
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

// SEO：动态标题/摘要/首图/规范化链接
const seoHost = typeof window !== 'undefined' ? window.location.origin : ''
watch(memo, (value) => {
  if (!value) return
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
    link: [{ rel: 'canonical', href: `${seoHost}/memo/${value.id}` }],
  })
}, { immediate: false })


</script>

<style scoped>

</style>