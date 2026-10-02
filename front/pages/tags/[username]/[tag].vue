<template>
  <div>
    <Header :user="user" v-if="user"/>
    <div class="flex flex-col divide-y divide-[#C0BEBF]/20 ">
      <Memo v-bind:memo="m" v-for="m in memos" :key="m.id" />
    </div>
    <div ref="loadMoreEle" class="text-xs text-center text-gray-500 py-2" @click="loadMore" v-if="hasNext">
      点击加载更多
    </div>
    <div class="text-xs text-center text-gray-500 py-2" v-else>
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
const username = computed(() => String(route.params.username || ''))
const tag = computed(() => String(route.params.tag || ''))
const routeKey = computed(() => `${username.value}\u0000${tag.value}`)
const user = ref<UserVO>()
const loadMoreEle = ref(null)
const targetIsVisible = useElementVisibility(loadMoreEle)
const hasNext = ref(false)
const loading = ref(false)
let requestGeneration = 0
const state = reactive({
  page: 1,
  size: 10,
  username: username.value,
  tag: tag.value,
})

const memos = ref<Array<MemoVO>>([])

const mergeMemos = (incoming: MemoVO[]) => {
  const existing = new Set(memos.value.map(memo => memo.id))
  memos.value = [...memos.value, ...incoming.filter(memo => !existing.has(memo.id))]
}

const reload = async () => {
  const generation = ++requestGeneration
  const targetKey = routeKey.value
  const targetUsername = username.value
  const targetTag = tag.value
  state.username = targetUsername
  state.tag = targetTag
  state.page = 1
  user.value = undefined
  memos.value = []
  hasNext.value = false
  loading.value = true
  try {
    const [profile, res] = await Promise.all([
      useMyFetch<UserVO>('/user/profile/' + encodeURIComponent(targetUsername)),
      useMyFetch<{
        list: Array<MemoVO>,
        total: number,
        hasNext: boolean
      }>('/memo/list', { ...state, page: 1 }),
    ])
    // 路由复用时旧 profile 与动态列表响应都不能写入当前 URL。
    if (generation !== requestGeneration || routeKey.value !== targetKey) return
    user.value = profile
    memos.value = res.list
    hasNext.value = res.hasNext
  } catch (error) {
    if (generation !== requestGeneration || routeKey.value !== targetKey) return
    // 页面保持可用，用户可通过再次触发路由或事件重试；避免事件回调产生未处理 Promise。
    console.warn('[tags] 加载失败', error)
  } finally {
    if (generation === requestGeneration) loading.value = false
  }
}

watch(targetIsVisible, visible => {
  if (visible) void loadMore()
})

const loadMore = async () => {
  if (loading.value || !hasNext.value) return
  const generation = requestGeneration
  const targetKey = routeKey.value
  const page = state.page + 1
  loading.value = true
  try {
    const res = await useMyFetch<{
      list: Array<MemoVO>,
      total: number,
      hasNext: boolean
    }>('/memo/list', { ...state, page })
    if (generation !== requestGeneration || routeKey.value !== targetKey) return
    mergeMemos(res.list)
    state.page = page
    hasNext.value = res.hasNext
  } catch (error) {
    if (generation === requestGeneration && routeKey.value === targetKey) console.warn('[tags] 加载更多失败', error)
  } finally {
    if (generation === requestGeneration) loading.value = false
  }
}

const stopMemoReload = memoReloadEvent.on(() => {
  void reload()
})

watch([username, tag], ([nextUsername, nextTag], previous) => {
  if (previous && nextUsername === previous[0] && nextTag === previous[1]) return
  state.username = nextUsername
  state.tag = nextTag
  void reload()
})

const stopMemoChanged = memoChangedEvent.on(async (id: number) => {
  try {
    const res = await useMyFetch<MemoVO>('/memo/get?latest=1&id=' + id)
    const index = memos.value.findIndex(r => r.id === id)
    if (index >= 0) memos.value[index] = res
  } catch {
    // 动态已删除或无权访问时保持当前列表。
  }
})

onMounted(() => { void reload() })
onBeforeUnmount(() => {
  stopMemoReload()
  stopMemoChanged()
})
</script>

<style scoped>

</style>
