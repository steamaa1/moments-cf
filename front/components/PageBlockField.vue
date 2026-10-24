<script setup>
/**
 * PageBlockField：块参数表单的字段控件（P2-B schema 字段类型扩展的落点）。
 *
 * 为什么要单独抽一个组件：块表单的控件从 P1 的「string / number 两个 UInput」扩展到
 * textarea / select / image（照片墙选图）/ icon（图标网格）/ datetime（本地时间）之后，
 * 顶层字段与列表行如果继续在 PageBlockForm 模板里各写一遍分支，会长成两套平行逻辑。
 * 这里把「type → 控件」收敛成唯一分支，PageBlockForm 只负责布局与 draft 同步。
 *
 * 数据协议：modelValue 永远是字符串（PageBlockForm 的 draft 就是这样存的），
 * number 的字符串→数字转换仍在 PageBlockForm 的 buildOutput 里完成，本组件不改变
 * 落盘类型语义。datetime 的存储格式是 "YYYY-MM-DD HH:mm:ss"（组件 new Date 可解析），
 * 而 input[type=datetime-local] 要求 "YYYY-MM-DDTHH:mm"，故在 computed 里双向转换。
 *
 * 选图数据源：管理员接口 /api/photo/all（与照片墙管理、发表面板同源），按 url 去重；
 * 选图标用 utils/pageIcons.js 的 ICON_PRESETS + 自定义输入。
 */
import { toast } from 'vue-sonner'
import { ICON_PRESETS } from '~/utils/pageIcons'

/* 组件是多根（控件 + 两个弹窗）：关闭自动透传，把父组件的 aria-label 等显式绑到控件上 */
defineOptions({ inheritAttrs: false })

const props = defineProps({
  /** pageBlockSchema 的 BlockField 条目 */
  field: { type: Object, required: true },
  /** 字段值（draft 里恒为字符串） */
  modelValue: { type: null, default: '' },
  /** 控件尺寸：列表行传 sm，顶层字段用默认 */
  size: { type: String, default: 'md' },
})

const emit = defineEmits(['update:modelValue'])

const toText = value => {
  if (typeof value === 'string') return value
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return value == null ? '' : String(value)
}

/** 所有类型共用的字符串桥：v-model 写回一律 emit 字符串 */
const text = computed({
  get: () => toText(props.modelValue),
  set: value => emit('update:modelValue', String(value ?? '')),
})

/* ---------- datetime：存储 "YYYY-MM-DD HH:mm:ss" ↔ 控件 "YYYY-MM-DDTHH:mm" ---------- */

const pad = value => String(value).padStart(2, '0')

const toDatetimeLocal = (value) => {
  const raw = String(value || '').trim()
  if (!raw) return ''
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(raw)) return raw.slice(0, 16)
  const date = new Date(raw)
  if (Number.isNaN(date.getTime())) return ''
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

const datetime = computed({
  get: () => toDatetimeLocal(text.value),
  set: (value) => {
    const raw = String(value || '')
    if (!raw) return emit('update:modelValue', '')
    const normalized = raw.length === 16 ? `${raw}:00` : raw
    emit('update:modelValue', normalized.replace('T', ' '))
  },
})

/* ---------- 选图：照片墙（管理员接口，按 url 去重） ---------- */

const showPhotos = ref(false)
const photos = ref([])
const photoPage = ref(0)
const photoHasNext = ref(false)
const photoLoading = ref(false)
const photoKeyword = ref('')

const loadPhotos = async (page = 1) => {
  if (photoLoading.value) return
  photoLoading.value = true
  try {
    const result = await useMyFetch('/photo/all', { page, size: 60, keyword: photoKeyword.value.trim() })
    const list = Array.isArray(result?.list) ? result.list : []
    const known = new Set(photos.value.map(photo => photo.url))
    const fresh = list.filter(photo => photo?.url && !known.has(photo.url))
    photos.value = page > 1 ? [...photos.value, ...fresh] : fresh
    photoPage.value = page
    photoHasNext.value = Boolean(result?.hasNext) && fresh.length > 0
  } catch (error) {
    toast.error(error?.message || '照片墙加载失败，请重试')
  } finally {
    photoLoading.value = false
  }
}

const openPhotoPicker = async () => {
  showPhotos.value = true
  if (!photos.value.length) await loadPhotos(1)
}

const searchPhotos = () => {
  photos.value = []
  photoPage.value = 0
  photoHasNext.value = false
  loadPhotos(1)
}

const pickPhoto = (photo) => {
  emit('update:modelValue', photo.url)
  showPhotos.value = false
}

/* ---------- 选图标：常用网格 + 自定义输入 ---------- */

const showIcons = ref(false)
const customIcon = ref('')

const pickIcon = (name) => {
  emit('update:modelValue', name)
  showIcons.value = false
}

const confirmCustomIcon = () => {
  const name = customIcon.value.trim()
  if (!name) return toast.error('请输入图标名')
  customIcon.value = ''
  pickIcon(name)
}
</script>

<template>
  <USelect
    v-if="field.type === 'select'"
    v-model="text"
    :options="field.options"
    value-attribute="value"
    option-attribute="label"
    :placeholder="field.placeholder || '请选择'"
    :size="size"
    v-bind="$attrs"
  />
  <UTextarea
    v-else-if="field.type === 'textarea'"
    v-model="text"
    :rows="size === 'sm' ? 2 : 3"
    :placeholder="field.placeholder"
    :size="size"
    v-bind="$attrs"
  />
  <UInput v-else-if="field.type === 'datetime'" v-model="datetime" type="datetime-local" :size="size" v-bind="$attrs"/>
  <div v-else-if="field.type === 'image'" class="flex items-center gap-2">
    <UInput v-model="text" :placeholder="field.placeholder" :size="size" class="flex-1" v-bind="$attrs"/>
    <UButton size="xs" color="white" icon="i-carbon-image" @click="openPhotoPicker">选图</UButton>
  </div>
  <div v-else-if="field.type === 'icon'" class="flex items-center gap-2">
    <UInput v-model="text" :placeholder="field.placeholder" :size="size" class="flex-1" v-bind="$attrs"/>
    <UButton size="xs" color="white" icon="i-carbon-star" @click="showIcons = true">选图标</UButton>
  </div>
  <UInput
    v-else
    v-model="text"
    :type="field.type === 'number' ? 'number' : 'text'"
    :placeholder="field.placeholder"
    :size="size"
    v-bind="$attrs"
  />

  <!-- 选图：照片墙网格 + 关键词搜索 + 加载更多 -->
  <UModal v-model="showPhotos" :ui="{ container: 'flex justify-center items-center backdrop-blur' }">
    <div class="w-full max-w-3xl rounded-xl bg-white p-5 shadow-xl dark:bg-neutral-800">
      <p class="mb-3 text-lg font-bold">从照片墙选择图片</p>
      <div class="mb-3 flex gap-2">
        <UInput v-model="photoKeyword" class="flex-1" placeholder="按关键词搜索" size="sm" @keyup.enter="searchPhotos"/>
        <UButton size="sm" color="white" icon="i-carbon-search" @click="searchPhotos">搜索</UButton>
      </div>
      <div v-if="!photos.length && !photoLoading" class="py-10 text-center text-sm text-gray-400">照片墙暂无图片</div>
      <div class="grid max-h-[50vh] grid-cols-2 gap-2 overflow-auto sm:grid-cols-3 md:grid-cols-4">
        <button
          v-for="photo in photos"
          :key="photo.id + '-' + photo.url"
          type="button"
          class="overflow-hidden rounded-lg border border-gray-200 text-left transition-colors hover:border-primary-400 dark:border-gray-600"
          @click="pickPhoto(photo)"
        >
          <img
            :src="photo.thumbUrl || photo.url"
            :alt="photo.caption || ''"
            loading="lazy"
            class="aspect-square w-full object-cover"
          >
          <span v-if="photo.caption" class="block truncate px-2 py-1 text-xs text-gray-500 dark:text-gray-400">{{ photo.caption }}</span>
        </button>
      </div>
      <div class="mt-3 flex items-center justify-between">
        <UButton v-if="photoHasNext" size="xs" color="white" :loading="photoLoading" @click="loadPhotos(photoPage + 1)">加载更多</UButton>
        <span v-else class="text-xs text-gray-400 dark:text-gray-500">{{ photos.length ? '已到底' : '' }}</span>
        <UButton size="xs" color="gray" variant="ghost" @click="showPhotos = false">取消</UButton>
      </div>
    </div>
  </UModal>

  <!-- 选图标：常用名网格（带预览）+ 自定义输入 -->
  <UModal v-model="showIcons" :ui="{ container: 'flex justify-center items-center backdrop-blur' }">
    <div class="w-full max-w-2xl rounded-xl bg-white p-5 shadow-xl dark:bg-neutral-800">
      <p class="mb-3 text-lg font-bold">选择图标</p>
      <div class="grid max-h-64 grid-cols-2 gap-1 overflow-auto sm:grid-cols-3">
        <button
          v-for="name in ICON_PRESETS"
          :key="name"
          type="button"
          class="flex items-center gap-2 rounded-lg border border-gray-200 px-2 py-1.5 text-left text-xs hover:border-primary-300 dark:border-gray-600"
          @click="pickIcon(name)"
        >
          <UIcon :name="name" class="h-5 w-5 shrink-0"/>
          <span class="truncate">{{ name }}</span>
        </button>
      </div>
      <div class="mt-3 flex items-center gap-2">
        <UInput v-model="customIcon" class="flex-1" placeholder="自定义 Iconify 名，如 i-heroicons-heart-solid" @keyup.enter="confirmCustomIcon"/>
        <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-gray-200 dark:border-gray-600">
          <UIcon v-if="customIcon" :name="customIcon" class="h-5 w-5"/>
          <UIcon v-else name="i-carbon-help" class="h-5 w-5 text-gray-400"/>
        </span>
        <UButton size="sm" @click="confirmCustomIcon">使用</UButton>
      </div>
      <div class="mt-3 flex justify-end">
        <UButton size="xs" color="gray" variant="ghost" @click="showIcons = false">取消</UButton>
      </div>
    </div>
  </UModal>
</template>
