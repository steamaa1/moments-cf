<template>
  <div class="px-4 space-y-2">
    <div class="flex justify-between items-center pt-4 text-gray-600">
      <NuxtLink class="flex items-center" title="返回主页">
        <UIcon @click="navigateTo('/')" name="i-carbon-chevron-left" class="w-5 h-5 cursor-pointer mr-4"/>
        <span v-if="$route.path==='/new'">新增内容</span>
        <span v-else>修改内容</span>
      </NuxtLink>
      <UButton @click="saveMemo" :loading="memoSaving" :disabled="memoSaving">发表</UButton>
    </div>
    <div class="flex gap-2 text-lg text-gray-600 pt-4 ">
      <ExternalUrl v-model:favicon="state.externalFavicon" v-model:title="state.externalTitle"
                   v-model:url="state.externalUrl"/>

      <upload-image v-model:imgs="state.imgs"/>
      <upload-attachment v-model:attachments="state.attachments"/>
      <music v-bind="state.music" @confirm="updateMusic"/>
      <x-embed v-bind="state.x" @confirm="updateX"/>
      <git-embed v-bind="state.git" @confirm="updateGit"/>
      <memo-ref-embed v-bind="state.memoRef" @confirm="updateMemoRef"/>
      <upload-video @confirm="handleVideo" v-bind="state.video"/>
      <douban-edit v-model:books="doubanBooks" v-model:movies="doubanMovies"/>
      <UPopover :popper="{ arrow: true }" mode="click">
        <UIcon name="i-carbon-calendar" class="w-6 h-6" title="自定义时间"/>
        <template #panel="{close}">
          <DatePicker
            v-model="state.createdAt"
            mode="datetime"
            is24hr
            :time-accuracy="2"
            :rules="{ seconds: 0 }"
            @close="close"
          />
        </template>
      </UPopover>
      <UIcon name="i-carbon-text-clear-format" @click="reset" class="w-6 h-6 cursor-pointer" title="清空"></UIcon>
    </div>

    <div class="w-full" @contextmenu.prevent="onContextMenu">
      <div class="relative">
        <UTextarea ref="contentRef" v-model="state.content" :rows="8" autoresize padded autofocus/>
        <UIcon class="text-[#9fc84a] w-6 h-6 animate-bounce absolute right-2 bottom-1 cursor-pointer select-none" name="i-carbon-face-satisfied" @click="toggleEmoji"/>
      </div>

      <Emoji v-if="emojiShow" @selected="emojiSelected" @close="emojiShow=false"/>

      <USelectMenu v-model="selectedLabel" :options="existTags" show-create-option-when="always"
                   multiple searchable creatable placeholder="选择标签" class="my-2" >
        <template #label>
          <span v-if="selectedLabel.length" class="truncate">{{ selectedLabel.join(',') }}</span>
          <span v-else>选择标签</span>
        </template>
      </USelectMenu>

      <UContextMenu v-model="isOpen" :virtual-element="virtualElement">
        <div class="px-2 py-1 flex flex-col gap-2 text-xs">
          <div class="mb-2 text-gray-300" tabindex="0">点击标签插入</div>
          <div v-if="!existTags.length" class="text-gray-400" tabindex="0">暂无标签</div>
          <div v-for="(tag,index) in existTags" :key="index" class="cursor-pointer" role="button" tabindex="0" @click="clickTag(tag)" @keydown.enter.prevent="clickTag(tag)">
            <UBadge size="xs" color="gray" variant="solid">{{ tag }}</UBadge>
          </div>
        </div>
      </UContextMenu>
    </div>

    <div class="flex justify-between items-center">
      <div class="flex flex-row gap-1 items-center text-[#576b95] text-sm cursor-pointer">
        <UPopover :popper="{ arrow: true }" mode="click">
          <div class="flex items-center gap-1">
            <UIcon name="i-carbon-location"/>
            <span>{{ state.location ? locationLabel : '自定义位置' }}</span>
          </div>
          <template #panel="{close}">
            <div class="p-4">
              <UButtonGroup>
                <UInput v-model="state.location" placeholder="自定义位置,空格分隔"/>
                <UButton @click="close" color="white" variant="solid">关闭</UButton>
              </UButtonGroup>
            </div>
          </template>
        </UPopover>
      </div>

      <div class="flex gap-1 text-gray-500 items-center">
          <span>{{ state.showType ? '公开' : '私密' }}</span>
          <UToggle v-model="state.showType"/>
        </div>
      </div>

    <div ref="blocksEl" class="flex flex-col gap-2">
      <div
        v-for="block in sortableBlocks"
        :key="block.key"
        :data-block-key="block.key"
        class="relative pl-6"
      >
        <!-- 排序控件：手柄拖拽 + 上移/下移按钮（触屏拖拽易误触，按钮是稳妥兜底） -->
        <div class="absolute left-0 top-1 flex flex-col items-center gap-0.5 text-gray-400">
          <button type="button" class="block-handle cursor-grab touch-none rounded p-0.5 hover:text-gray-600 dark:hover:text-gray-200" aria-label="拖动排序" title="拖动排序"><UIcon name="i-carbon-drag-vertical" class="h-4 w-4"/></button>
          <button type="button" class="rounded p-0.5 hover:text-gray-600 dark:hover:text-gray-200" aria-label="上移" title="上移" @click="moveBlock(block.key, -1)"><UIcon name="i-carbon-arrow-up" class="h-4 w-4"/></button>
          <button type="button" class="rounded p-0.5 hover:text-gray-600 dark:hover:text-gray-200" aria-label="下移" title="下移" @click="moveBlock(block.key, 1)"><UIcon name="i-carbon-arrow-down" class="h-4 w-4"/></button>
        </div>

        <external-url-preview v-if="block.kind === 'external'" :favicon="state.externalFavicon" :title="state.externalTitle" :url="state.externalUrl"/>
        <upload-image-preview v-else-if="block.kind === 'images'" :imgs="state.imgs" @remove-image="handleRemoveImage" @drag-image="handleDragImage"/>
        <div v-else-if="block.kind === 'attachment'" class="flex items-center gap-2">
          <attachment-preview :attachment="block.attachment" class="flex-1 min-w-0"/>
          <UButton size="xs" color="red" variant="soft" icon="i-carbon-close" aria-label="移除附件" title="移除附件" @click="removeAttachment(block.index)"/>
        </div>
        <music-preview v-else-if="block.kind === 'music'" v-bind="state.music"/>
        <div v-else-if="block.kind === 'git'" class="relative">
          <git-preview v-if="state.git.title" v-bind="state.git"/>
          <p v-else class="rounded-lg bg-gray-100 px-3 py-2 text-sm text-gray-500 dark:bg-gray-800">Git 链接将在发表时抓取并保存为静态卡片。</p>
          <UButton size="xs" color="red" variant="soft" icon="i-carbon-close" class="absolute right-2 top-2" aria-label="移除 Git 嵌入" @click="updateGit({})"/>
        </div>
        <div v-else-if="block.kind === 'x'" class="relative">
          <x-preview v-if="state.x.text" v-bind="state.x"/>
          <p v-else class="rounded-lg bg-gray-100 px-3 py-2 text-sm text-gray-500 dark:bg-gray-800">X 原帖将在发表时抓取并保存为静态卡片。</p>
          <UButton size="xs" color="red" variant="soft" icon="i-carbon-close" class="absolute right-2 top-2" aria-label="移除 X 嵌入" @click="updateX({})"/>
        </div>
        <div v-else-if="block.kind === 'memoRef'" class="relative">
          <memo-ref-preview v-bind="state.memoRef"/>
          <UButton size="xs" color="red" variant="soft" icon="i-carbon-close" class="absolute right-2 top-2" aria-label="移除站内动态引用" @click="updateMemoRef({ id: 0 } as MemoRef)"/>
        </div>
        <div v-else-if="block.kind === 'doubanBook'" class="relative">
          <douban-book-preview :book="block.book"/>
          <UButton size="xs" color="red" variant="soft" icon="i-carbon-close" class="absolute right-1 top-1" @click="removeDouban('book', block.index)"/>
        </div>
        <div v-else-if="block.kind === 'doubanMovie'" class="relative">
          <douban-movie-preview :movie="block.movie"/>
          <UButton size="xs" color="red" variant="soft" icon="i-carbon-close" class="absolute right-1 top-1" @click="removeDouban('movie', block.index)"/>
        </div>
        <video-preview-iframe v-else-if="block.kind === 'video' && ['bilibili', 'youtube'].includes(state.video.type)" :url="state.video.value"/>
        <video-preview v-else-if="block.kind === 'video'" :url="state.video.value"/>
      </div>
    </div>
  </div>


</template>

<script setup lang="ts">
import {useMouse, useWindowScroll} from '@vueuse/core'
import type {
  AttachmentVO,
  DoubanBook,
  DoubanMovie,
  ExtDTO,
  MemoVO,
  MetingMusicServer,
  MetingMusicType,
  MusicDTO,
  Video,
  VideoType,
  XEmbed,
  GitEmbed,
  MemoRef
} from "~/types";
import {useSortable} from '@vueuse/integrations/useSortable'
import {orderMemoBlocks, moveMemoBlock, attachmentBlockKey, doubanBookBlockKey, doubanMovieBlockKey} from '~/utils/memoBlocks'
import {toast} from "vue-sonner";
import UploadImage from "~/components/UploadImage.vue";
import Emoji from "~/components/Emoji.vue";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
dayjs.extend(utc);

const doubanBooks = ref<DoubanBook[]>([])
const doubanMovies = ref<DoubanMovie[]>([])
const contentRef = ref(null)
const props = defineProps<{ id?: number }>()
const defaultState = {
  id: props.id || 0,
  createdAt: '' as string,
  content: "",
  ext: "",
  pinned: false,
  showType: true,
  location: "",
  externalFavicon: "",
  externalTitle: "",
  externalUrl: "",
  imgs: "",
  music: {
    mode: 'platform' as const,
    id: '',
    url: '',
    name: '',
    artist: 'Audio artist',
    cover: '',
    lrc: '',
    api: 'https://api.i-meto.com/meting/api?server=:server&type=:type&id=:id&r=:r',
    server: 'netease' as MetingMusicServer,
    type: 'song' as MetingMusicType
  },
  x: { url: '', id: '' } as XEmbed,
  git: { url: '' } as GitEmbed,
  memoRef: { id: 0 } as MemoRef,
  video: {
    type: 'youtube' as VideoType,
    value: ""
  },
  doubanBook: {} as DoubanBook,
  doubanMovie: {} as DoubanMovie,
  attachments: Array<AttachmentVO>(),
  // 内容块顺序（ext.order）：空数组表示尚未自定义，按默认顺序渲染
  order: Array<string>(),
  tags: Array<string>(),
}
const selectedTags = ref<Array<string>>([])
const selectedLabel = computed({
  get:()=>selectedTags.value,
  set:(labels:Array<string>)=>{
    const tempLabels = Array<string>()
    labels.map(label=>{
      // @ts-ignore
      if(typeof  label !== 'string'){
        // @ts-ignore
        label = label.label
      }
      tempLabels.push(label)
      if(!existTags.value.includes(label)){
        existTags.value.push(label)
      }
    })
    selectedTags.value = [...tempLabels]
    console.log('selectedTags',selectedTags.value)
  }
})
const state = reactive({
  ...defaultState
})
const existTags = ref<string[]>([])
const reset = () => {
  Object.assign(state, defaultState)
}

const locationLabel = computed(() => {
  return state.location.split(" ").join(" · ")
})

const handleDragImage = (imgs: string[]) => {
  state.imgs = imgs.filter(Boolean).join(",")
}

const updateMusic = (music: MusicDTO) => {
  Object.assign(state.music, {
    mode: 'platform', id: '', url: '', name: '', artist: 'Audio artist', cover: '', lrc: '',
    server: 'netease', type: 'song',
    api: 'https://api.i-meto.com/meting/api?server=:server&type=:type&id=:id&r=:r',
  }, music)
}

const updateX = (x: XEmbed) => {
  state.x = { ...x, url: x.url || '', id: x.id || '' }
}
const updateGit = (git: GitEmbed) => {
  state.git = { ...git, url: git.url || '' }
}
const updateMemoRef = (memoRef: MemoRef) => {
  state.memoRef = memoRef && memoRef.id ? memoRef : { id: 0 } as MemoRef
}

const handleVideo = (video: Video) => {
  state.video = video
}

const {x, y} = useMouse()
const {y: windowY} = useWindowScroll()
const isOpen = ref(false)
const virtualElement = ref({getBoundingClientRect: () => ({})})

const handleRemoveImage = (index: number) => {
  const arr = state.imgs.split(",").filter(Boolean)
  arr.splice(index, 1)
  state.imgs = arr.join(",")
}

function onContextMenu() {
  if (existTags.value.length <= 0) {
    return
  }
  const top = unref(y) - unref(windowY)
  const left = unref(x)

  virtualElement.value.getBoundingClientRect = () => ({
    width: 0,
    height: 0,
    top,
    left
  })

  isOpen.value = true
}

const loadTags = async () => {
  const res = await useMyFetch<{
    tags: string[]
  }>("/tag/list")
  existTags.value = res.tags || []
}

const emojiShow = ref(false)

const toggleEmoji = () => {
  emojiShow.value = !emojiShow.value
}
const emojiSelected = (emoji: string) => {
  state.content = state.content + emoji
}

const clickTag = (tag: string) => {
  isOpen.value = false;
  if (!selectedLabel.value.includes(tag)){
    if (selectedLabel.value) {
      selectedLabel.value = [...selectedLabel.value , tag]
    } else {
      selectedLabel.value = [tag]
    }
  }

  //@ts-ignore
  (contentRef.value?.textarea as HTMLTextAreaElement).focus()
}
const memoSaving = ref(false)
const blocksEl = ref<HTMLElement | null>(null)

onMounted(async () => {
  if (state.id > 0) {
    const res = await useMyFetch<MemoVO>('/memo/get?id=' + state.id)
    Object.assign(state, res)
    state.showType = res.showType === 1
    const ext = (() => { try { return JSON.parse(res.ext) as ExtDTO } catch { return {} as ExtDTO } })()
    updateMusic(ext.music || {})
    updateX(ext.x || {})
    updateGit(ext.git || {})
    updateMemoRef(ext.memoRef || {})
    Object.assign(state.video, ext.video)
    state.attachments = Array.isArray(ext.attachments) ? ext.attachments : []
    state.order = Array.isArray(ext.order) ? ext.order : []
    doubanBooks.value = Array.isArray(ext.doubanBooks) ? ext.doubanBooks : (ext.doubanBook && ext.doubanBook.title ? [ext.doubanBook] : [])
    doubanMovies.value = Array.isArray(ext.doubanMovies) ? ext.doubanMovies : (ext.doubanMovie && ext.doubanMovie.title ? [ext.doubanMovie] : [])
    selectedLabel.value = res.tags ? res.tags.substring(0,res.tags.length-1).split(',') : []
    state.createdAt = dayjs.utc(res.createdAt).local().format()
  }
  await loadTags()
  // 外层块列表的拖拽只允许手柄发起，避免与图片组内部排序、页面纵向滚动打架。
  // 这里刻意不判断「当前块数」：新建动态一开始没有块，若那时不初始化，
  // 等用户添加内容后就再也拖不动了（SortableJS 基于 DOM，动态增删子节点无需重建实例）。
  await nextTick()
  if (blocksEl.value) {
    useSortable(blocksEl.value, sortableBlocks, {
      handle: '.block-handle',
      animation: 150,
      onEnd: () => {
        // 以 DOM 顺序为准写回 order：不依赖 useSortable 对数组的同步行为
        const keys = [...(blocksEl.value?.querySelectorAll('[data-block-key]') || [])]
          .map(node => node.getAttribute('data-block-key') || '')
          .filter(Boolean)
        if (keys.length) state.order = keys
      },
    })
  }
})

// const keydown=(event:KeyboardEvent)=>{
//   if(event.key === '#'){
//     tagPopoverOpen.value = true
//   }
// }

// 附件移除只改本地数组：已上传文件由服务端回收策略处理，与图片移除语义一致
// ---- 内容块排序：默认顺序必须与 Memo.vue 展示态一致（external → images → music → x → git → memoRef → 附件 → 豆瓣书 → 豆瓣影 → 视频）----
type MemoBlock =
  | { kind: 'external' | 'images' | 'music' | 'x' | 'git' | 'memoRef' | 'video'; key: string }
  | { kind: 'attachment'; key: string; attachment: AttachmentVO; index: number }
  | { kind: 'doubanBook'; key: string; book: DoubanBook; index: number }
  | { kind: 'doubanMovie'; key: string; movie: DoubanMovie; index: number }

const availableBlocks = computed<MemoBlock[]>(() => {
  const blocks: MemoBlock[] = []
  if (state.externalUrl) blocks.push({ kind: 'external', key: 'external' })
  if (state.imgs.split(',').filter(Boolean).length) blocks.push({ kind: 'images', key: 'images' })
  if (state.music?.id || state.music?.url) blocks.push({ kind: 'music', key: 'music' })
  if (state.x?.url && state.x?.id) blocks.push({ kind: 'x', key: 'x' })
  if (state.git?.url) blocks.push({ kind: 'git', key: 'git' })
  if (state.memoRef?.id) blocks.push({ kind: 'memoRef', key: 'memoRef' })
  state.attachments.forEach((attachment, index) => blocks.push({ kind: 'attachment', key: attachmentBlockKey(attachment.path), attachment, index }))
  doubanBooks.value.forEach((book, index) => blocks.push({ kind: 'doubanBook', key: doubanBookBlockKey(book, index), book, index }))
  doubanMovies.value.forEach((movie, index) => blocks.push({ kind: 'doubanMovie', key: doubanMovieBlockKey(movie, index), movie, index }))
  if (state.video?.value) blocks.push({ kind: 'video', key: 'video' })
  return blocks
})
const orderedBlocks = computed(() => orderMemoBlocks(availableBlocks.value, state.order))
// 交给 SortableJS 的数组：拖拽时它按 DOM 顺序改写，因此模板渲染它而不是 computed
const sortableBlocks = ref<MemoBlock[]>([])
watch(orderedBlocks, value => { sortableBlocks.value = [...value] }, { immediate: true })

const moveBlock = (key: string, delta: number) => {
  state.order = moveMemoBlock(orderedBlocks.value.map(block => block.key), key, delta)
}

const removeAttachment = (index: number) => {
  state.attachments = state.attachments.filter((_, i) => i !== index)
}

const removeDouban = (kind: 'book' | 'movie', index: number) => {
  if (kind === 'book') doubanBooks.value = doubanBooks.value.filter((_, i) => i !== index)
  else doubanMovies.value = doubanMovies.value.filter((_, i) => i !== index)
}

const saveMemo = async () => {
  const hasImage = Boolean(state.imgs.split(",").filter(Boolean).length)
  const hasExt = Boolean(
    state.music?.id || state.music?.url || state.x?.url || state.git?.url || state.video?.value || state.memoRef?.id || state.externalUrl
    || state.attachments.length
    || doubanBooks.value.some(book => book?.title) || doubanMovies.value.some(movie => movie?.title)
  )
  if (!state.content.trim() && !hasImage && !hasExt) {
    toast.warning("动态内容不能为空")
    return
  }
  memoSaving.value = true
  try {
    await useMyFetch('/memo/save', {
      id: state.id,
      content: state.content,
      ext: {
        music: state.music.id || state.music.url ? state.music : {},
        x: state.x.url && state.x.id ? state.x : {},
        git: state.git.url ? state.git : {},
        memoRef: state.memoRef.id ? state.memoRef : {},
        doubanBooks: doubanBooks.value.filter(book => book && book.title),
        doubanMovies: doubanMovies.value.filter(movie => movie && movie.title),
        attachments: state.attachments.filter(attachment => attachment && attachment.path),
        order: state.order.filter(key => availableBlocks.value.some(block => block.key === key)),
        video: state.video.value ? state.video : {},
      },
      showType: state.showType ? 1 : 0,
      externalFavicon: state.externalUrl ? state.externalFavicon : "",
      externalTitle: state.externalTitle,
      externalUrl: state.externalUrl,
      imgs: state.imgs.split(",").filter(Boolean),
      location: state.location,
      tags: selectedLabel.value,
      createdAt: state.createdAt || dayjs().format(),
    })
    toast.success("保存成功!")
    await navigateTo('/')
  } catch (error: any) {
    toast.error(error?.message || "发表失败，请稍后再试")
  } finally {
    memoSaving.value = false
  }
}

</script>

<style scoped>

</style>