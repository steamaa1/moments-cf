<template>
  <Header v-bind:user="currentUser"/>
  <div class="flex flex-col divide-y divide-[#C0BEBF]/20 ">
    <Memo v-bind:memo="m" v-for="m in memos" :key="m.id" />
  </div>
  <div v-if="loading" class="text-xs text-center text-gray-500 py-2">客官勿急 正在加载中…</div>
  <div ref="loadMoreEle" class="text-xs text-center text-gray-500 py-2 cursor-pointer" @click="loadMore" v-else-if="hasNext">点击加载更多</div>
  <div class="text-xs text-center text-gray-500 py-2" v-else>已经到底啦</div>
</template>

<script setup lang="ts">
import type {MemoVO, SysConfigVO, UserVO} from "~/types";
import Memo from "~/components/Memo.vue";
import {memoChangedEvent, memoReloadEvent} from "~/event";
import {useElementVisibility} from '@vueuse/core'

const currentUser = useState<UserVO>('userinfo')
const sysConfig = useState<SysConfigVO>('sysConfig')

const loadMoreEle = ref(null)
const targetIsVisible = useElementVisibility(loadMoreEle)
watch(targetIsVisible, async (visible) => {
  if (visible && sysConfig.value.enableAutoLoadNextPage) {
    await loadMore()
  }
})
const hasNext = ref(false)
const loading = ref(false)
const state = reactive({
  page: 1,
  size: 10,
})

const memos = ref<Array<MemoVO>>([])
onMounted(async () => {
  await reload()
})

const reload = async () => {
  if (loading.value) return
  loading.value = true
  state.page = 1
  try {
    const res = await useMyFetch<{
      list: Array<MemoVO>,
      total: number,
      hasNext: boolean
    }>('/memo/list', state)
    memos.value = res.list
    hasNext.value = res.hasNext
  } finally {
    loading.value = false
  }
}

const loadMore = async () => {
  if (loading.value) return
  loading.value = true
  state.page = state.page + 1
  try {
    const res = await useMyFetch<{
      list: Array<MemoVO>,
      total: number,
      hasNext: boolean
    }>('/memo/list', state)
    memos.value = [...memos.value, ...res.list]
    hasNext.value = res.hasNext
  } finally {
    loading.value = false
  }
}

const stopMemoReload = memoReloadEvent.on(async () => {
  await reload()
})

const stopMemoChanged = memoChangedEvent.on(async (id: number) => {
  const res = await useMyFetch<MemoVO>('/memo/get?latest=1&id=' + id)
  const index = memos.value.findIndex(r => r.id === id)
  if (index >= 0) {
    memos.value[index] = res
  }
})

onBeforeUnmount(() => {
  stopMemoReload()
  stopMemoChanged()
})
</script>

<style scoped>

</style>