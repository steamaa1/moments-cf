<template>
  <div>
    <Header :user="currentUser"/>

    <div class="p-4 space-y-4">
      <UFormGroup label="日期范围" name="contentContains" :ui="{label:{base:'font-bold'}}">
        <UPopover :popper="{ placement: 'bottom-start' }">
          <UButton icon="i-heroicons-calendar-days-20-solid" color="white" variant="solid" class="w-full">
            从 {{ format(state.range.start, 'yyy-MM-dd') }} 到 {{ format(state.range.end, 'yyy-MM-dd') }}
          </UButton>

          <template #panel="{ close }">
            <div class="flex flex-col items-center sm:divide-x divide-gray-200 dark:divide-gray-800">
              <div class="hidden sm:flex flex-row py-4">
                <UButton
                    v-for="(range, index) in ranges"
                    :key="index"
                    :label="range.label"
                    color="gray"
                    variant="ghost"
                    class="rounded-none px-6"
                    :class="[isRangeSelected(range.duration) ? 'bg-gray-100 dark:bg-gray-800' : 'hover:bg-gray-50 dark:hover:bg-gray-800/50']"
                    truncate
                    @click="selectRange(range.duration)"
                />
              </div>
              <DatePicker v-model="state.range" @close="close"/>
            </div>
          </template>
        </UPopover>
      </UFormGroup>

      <UFormGroup label="包含内容" name="contentContains" :ui="{label:{base:'font-bold'}}">
        <UInput v-model="state.contentContains"/>
      </UFormGroup>
      <UFormGroup label="包含标签" name="tagContains" :ui="{label:{base:'font-bold'}}">
        <USelectMenu multiple v-model="state.tags" searchable :options="tags">
          <template #label>
            <span v-if="state.tags.length" class="truncate">{{ state.tags.join(', ') }}</span>
            <span v-else>选择标签</span>
          </template>
        </USelectMenu>
      </UFormGroup>
      <UFormGroup label="可见性" name="showType" :ui="{label:{base:'font-bold'}}">
        <USelectMenu v-model="state.showType"
                     :options="[{value:-1,label:'所有的'},{value:1,label:'公开的'},{value:0,label:'自己可见'}]"
                     option-attribute="label" value-attribute="value"/>
      </UFormGroup>
      <div class="flex items-center justify-between gap-3">
        <UButton class="my-2" @click="reload">搜索</UButton>
        <div class="inline-flex rounded-xl bg-gray-100 p-1 dark:bg-gray-800" role="group" aria-label="排列方式">
          <button class="view-button" :class="{active:viewMode==='cards'}" @click="viewMode='cards'"><UIcon name="i-carbon-list"/>普通排列</button>
          <button class="view-button" :class="{active:viewMode==='timeline'}" @click="viewMode='timeline'"><UIcon name="i-carbon-list-boxes"/>时间轴排列</button>
        </div>
      </div>
    </div>

    <TimelineList v-if="viewMode === 'timeline'" :memos="memos"/>
    <div v-else class="flex flex-col divide-y divide-[#C0BEBF]/20 ">
      <Memo v-bind:memo="m" v-for="m in memos" :key="m.id"/>
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
import {add, format, isSameDay, sub} from "date-fns";
import Memo from "~/components/Memo.vue";
import {memoChangedEvent, memoReloadEvent} from "~/event";
import {useElementVisibility} from '@vueuse/core'

const ranges = [
  {label: '一周内', duration: {days: 7}},
  {label: '一月内', duration: {days: 31}},
  {label: '三月内', duration: {days: 90}},
  {label: '本年', duration: {months: 12}},
  {label: '近三年', duration: {years: 3}},
]
const tags = ref<string[]>([])
const viewMode = ref<'cards' | 'timeline'>('cards')
const currentUser = useState<UserVO>('userinfo')
const state = reactive({
  page: 1,
  size: 10,
  contentContains: "",
  tags: [],
  showType: -1,
  range: {
    start: sub(new Date(), {days: 31}),
    end: add(new Date(), {days: 1})
  }
})

function isRangeSelected(duration: Duration) {
  return isSameDay(state.range.start, sub(new Date(), duration)) && isSameDay(state.range.end, new Date())
}

function selectRange(duration: Duration) {
  state.range = {start: sub(new Date(), duration), end: new Date()}
}

const loadTags = async () => {
  const res = await useMyFetch<{
    tags: string[]
  }>("/tag/list")
  tags.value = res.tags
}


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


const memos = ref<Array<MemoVO>>([])
onMounted(async () => {
  await loadTags()
  await reload()
})

const listRequest = (page: number) => ({
  page,
  size: state.size,
  start: state.range.start,
  end: state.range.end,
  contentContains: state.contentContains,
  showType: state.showType,
  tag: state.tags.join(','),
})
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
    }>('/memo/list', listRequest(1))
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
    }>('/memo/list', listRequest(page))
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
.view-button { display:inline-flex; min-height:36px; align-items:center; gap:5px; border-radius:9px; padding:0 10px; color:#71717a; font-size:.75rem; font-weight:650; transition:all 160ms ease; }
.view-button.active { color:#3f4f2c; background:#fff; box-shadow:0 2px 8px rgba(24,24,27,.08); }
:global(.dark) .view-button.active { color:#e4e4e7; background:#3f3f46; }
.view-button:focus-visible { outline:2px solid #9fc84a; outline-offset:2px; }
@media (max-width:420px) { .view-button { padding-inline:8px; } }
</style>