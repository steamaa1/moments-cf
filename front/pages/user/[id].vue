<template>
  <Header v-if="profile" :user="profile"/>
  <div v-if="profileError" class="flex flex-col items-center justify-center gap-3 py-24" role="alert">
    <p class="text-5xl font-bold text-gray-300 dark:text-gray-600">{{ userId === null ? '400' : '404' }}</p>
    <p class="text-gray-500">{{ profileError }}</p>
    <UButton color="white" @click="reload">重新加载</UButton>
  </div>
  <template v-else>
    <div class="flex justify-end px-4 pb-2">
      <div class="inline-flex rounded-xl bg-gray-100 p-1 dark:bg-gray-800" role="group" aria-label="排列方式">
        <button class="view-button" :class="{active:viewMode==='timeline'}" @click="viewMode='timeline'"><UIcon name="i-carbon-list-boxes"/>时间轴</button>
        <button class="view-button" :class="{active:viewMode==='cards'}" @click="viewMode='cards'"><UIcon name="i-carbon-list"/>普通</button>
      </div>
    </div>
    <TimelineList v-if="viewMode === 'timeline'" :memos="memos"/>
    <div v-else class="flex flex-col divide-y divide-[#C0BEBF]/20"><Memo v-for="memo in memos" :key="memo.id" :memo="memo"/></div>
    <div v-if="paginationError" class="load-more pagination-error" role="alert">
      <span>{{ paginationError }}</span>
      <UButton size="xs" color="gray" variant="soft" @click="loadMore">重试</UButton>
    </div>
    <button v-else-if="hasNext" ref="loadMoreEle" class="load-more" @click="loadMore">点击加载更多</button>
    <div v-else class="load-more">已经到底啦</div>
  </template>
</template>

<script setup lang="ts">
import type { MemoVO, UserVO } from '~/types'
import { memoChangedEvent, memoReloadEvent } from '~/event'
import { useElementVisibility } from '@vueuse/core'

const route = useRoute()
const userId = computed<number | null>(() => {
  const raw = Array.isArray(route.params.id) ? route.params.id[0] : route.params.id
  const value = String(raw || '')
  if (!/^[1-9]\d*$/.test(value)) return null
  const number = Number(value)
  return Number.isSafeInteger(number) && number > 0 ? number : null
})
const state = reactive({ page: 1, size: 10, userId: 0 })
const memos = ref<MemoVO[]>([])
const profile = ref<UserVO | null>(null)
const profileError = ref('')
const paginationError = ref('')
const hasNext = ref(false)
const loading = ref(false)
let requestGeneration = 0
const viewMode = ref<'timeline' | 'cards'>('timeline')
const loadMoreEle = ref<HTMLElement | null>(null)
const targetIsVisible = useElementVisibility(loadMoreEle)
watch(targetIsVisible, visible => { if (visible && hasNext.value) void loadMore() })

const mergeMemos = (incoming: MemoVO[]) => {
  const existing = new Set(memos.value.map(memo => memo.id))
  memos.value.push(...incoming.filter(memo => !existing.has(memo.id)))
}

const reload = async () => {
  const generation = ++requestGeneration
  const targetId = userId.value
  loading.value = true
  profileError.value = ''
  paginationError.value = ''
  if (targetId === null) {
    profile.value = null
    memos.value = []
    hasNext.value = false
    profileError.value = '用户编号无效，请从用户列表重新进入'
    loading.value = false
    return
  }
  state.userId = targetId
  try {
    const [res, user] = await Promise.all([
      useMyFetch<{list:MemoVO[];total:number;hasNext:boolean}>('/memo/list', { ...state, page: 1 }),
      useMyFetch<UserVO>(`/user/profileById?id=${targetId}`),
    ])
    if (generation !== requestGeneration || userId.value !== targetId) return
    state.page = 1
    memos.value = res.list
    profile.value = user
    hasNext.value = res.hasNext
  } catch (error: any) {
    if (generation !== requestGeneration || userId.value !== targetId) return
    profile.value = null
    memos.value = []
    hasNext.value = false
    profileError.value = error?.message || '用户不存在或暂时无法加载，请重试'
  } finally {
    if (generation === requestGeneration) loading.value = false
  }
}
const loadMore = async () => {
  if (loading.value || !hasNext.value || userId.value === null) return
  const generation = requestGeneration
  const targetId = userId.value
  const page = state.page + 1
  paginationError.value = ''
  loading.value = true
  try {
    const res = await useMyFetch<{list:MemoVO[];total:number;hasNext:boolean}>('/memo/list', { ...state, page })
    if (generation !== requestGeneration || userId.value !== targetId) return
    mergeMemos(res.list)
    paginationError.value = ''
    state.page = page
    hasNext.value = res.hasNext
  } catch (error: any) {
    if (generation === requestGeneration && userId.value === targetId) paginationError.value = error?.message || '动态加载失败，请重试'
  } finally {
    if (generation === requestGeneration) loading.value = false
  }
}

// SEO：昵称 + 签名；canonical/og:url 由 layouts/default.vue 统一输出
watch(profile, (value) => {
  if (!value?.nickname) return
  const slogan = String(value.slogan || '').slice(0, 120)
  useHead({
    title: `${value.nickname} 的空间`,
    meta: [
      { name: 'description', content: slogan || `${value.nickname} 的空间` },
      { property: 'og:title', content: `${value.nickname} 的空间` },
      { property: 'og:description', content: slogan },
    ],
  })
}, { immediate: false })

onMounted(() => { void reload() })
watch(userId, async (value, previous) => {
  if (value === previous) return
  profile.value = null
  memos.value = []
  hasNext.value = false
  await reload()
})
const stopMemoReload = memoReloadEvent.on(() => { void reload() })
const stopMemoChanged = memoChangedEvent.on(async id => {
  try {
    const value = await useMyFetch<MemoVO>('/memo/get?latest=1&id='+id)
    const index = memos.value.findIndex(item => item.id===id)
    if(index>=0)memos.value[index]=value
  } catch { /* 动态已删除或无权访问时保持当前列表 */ }
})
onBeforeUnmount(() => {
  stopMemoReload()
  stopMemoChanged()
})
</script>

<style scoped>
.view-button { display:inline-flex; min-height:36px; align-items:center; gap:6px; border-radius:9px; padding:0 12px; color:#71717a; font-size:.78rem; font-weight:650; transition:all 160ms ease; }
.view-button.active { color:#3f4f2c; background:#fff; box-shadow:0 2px 8px rgba(24,24,27,.08); }
:global(.dark) .view-button.active { color:#e4e4e7; background:#3f3f46; }
.view-button:focus-visible { outline:2px solid #9fc84a; outline-offset:2px; }
.load-more { display:block; width:100%; padding:12px; text-align:center; color:#71717a; font-size:.75rem; }
.pagination-error { display:flex; align-items:center; justify-content:center; gap:8px; }
</style>
