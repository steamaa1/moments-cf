<template>
  <div>
    <Header :user="user" v-if="user"/>
    <div class="flex flex-col divide-y divide-[#C0BEBF]/20 ">
      <Memo v-bind:memo="m" v-for="m in memos" :key="m.id" />
    </div>
    <div ref="loadMoreEle" class="text-xs text-center text-gray-500 py-2" @click="loadMore" v-if="hasNext">
      点击加载更多
    </div>
    <div class="text-xs text-center text-gray-500 py-2" @click="loadMore" v-else>
      已经到底啦
    </div>
  </div>
</template>

<script setup lang="ts">
import type {MemoVO, UserVO} from "~/types";
import Memo from "~/components/Memo.vue";
import {useElementVisibility} from "@vueuse/core";
import {memoChangedEvent, memoReloadEvent} from "~/event";

const route = useRoute()
const username = route.params.username
const tag = route.params.tag
const user = ref<UserVO>()

onMounted(async ()=>{
  user.value = await useMyFetch<UserVO>('/user/profile/' + username)
  await reload()
})

const loadMoreEle = ref(null)
const targetIsVisible = useElementVisibility(loadMoreEle)
watch(targetIsVisible, async (visible) => {
  if (visible) {
    await loadMore()
  }
})
const hasNext = ref(false)
const loading = ref(false)
let requestGeneration = 0
const state = reactive({
  page: 1,
  size: 10,
  username,
  tag,
})

const memos = ref<Array<MemoVO>>([])

const mergeMemos = (incoming: MemoVO[]) => {
  const existing = new Set(memos.value.map(memo => memo.id))
  memos.value = [...memos.value, ...incoming.filter(memo => !existing.has(memo.id))]
}

const reload = async () => {
  const generation = ++requestGeneration
  loading.value = true
  try {
    const res = await useMyFetch<{
      list: Array<MemoVO>,
      total: number,
      hasNext: boolean
    }>('/memo/list', { ...state, page: 1 })
    if (generation !== requestGeneration) return
    state.page = 1
    memos.value = res.list
    hasNext.value = res.hasNext
  } finally {
    if (generation === requestGeneration) loading.value = false
  }
}

const loadMore = async () => {
  if (loading.value || !hasNext.value) return
  const generation = requestGeneration
  const page = state.page + 1
  loading.value = true
  try {
    const res = await useMyFetch<{
      list: Array<MemoVO>,
      total: number,
      hasNext: boolean
    }>('/memo/list', { ...state, page })
    if (generation !== requestGeneration) return
    mergeMemos(res.list)
    state.page = page
    hasNext.value = res.hasNext
  } finally {
    if (generation === requestGeneration) loading.value = false
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