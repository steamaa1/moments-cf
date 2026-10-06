<template>
  <div>
    <Header :user="currentUser"/>
    <main class="editor-shell px-5 pb-12 pt-3">
      <div class="mb-5 flex items-center justify-between">
        <h1 class="text-2xl font-bold text-gray-900 dark:text-gray-50">{{ pageId ? '编辑自定义页面' : '新建自定义页面' }}</h1>
        <UButton :loading="saving" @click="save">{{ pageId ? '保存修改' : '创建页面' }}</UButton>
      </div>

      <div class="grid items-start gap-6 lg:grid-cols-2">
        <!-- 表单列：大屏左栏、小屏上方 -->
        <section class="space-y-4 rounded-2xl border border-gray-200/70 bg-white/80 p-5 dark:border-gray-700/60 dark:bg-neutral-800/80">
          <UFormGroup label="标题" required>
            <UInput v-model="form.title" maxlength="60" placeholder="1-60 字"/>
          </UFormGroup>
          <UFormGroup label="Slug（路径标识）" required help="仅小写字母、数字、连字符（1-40 位），不能与系统保留路径重复">
            <UInput v-model="form.slug" placeholder="my-page"/>
            <p class="mt-1 text-xs text-gray-500">发布后访问地址：{{ finalUrl }}</p>
          </UFormGroup>
          <UFormGroup label="SEO 描述" help="留空时由站点级 description 兜底（最长 300 字）">
            <UTextarea v-model="form.seoDescription" :rows="2"/>
          </UFormGroup>
          <div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <UFormGroup label="排序权重" help="数字越小越靠前">
              <UInput v-model="form.sortOrder" type="number" :min="0" :max="999"/>
            </UFormGroup>
            <UFormGroup label="启用页面">
              <UToggle v-model="form.enabled"/>
            </UFormGroup>
            <UFormGroup label="显示在导航">
              <UToggle v-model="form.showInNav"/>
            </UFormGroup>
          </div>

          <UFormGroup label="正文" help="Markdown 与组件围栏（```ui:kind）混合文本">
            <div class="mb-2 flex flex-wrap gap-2">
              <UButton size="xs" color="white" icon="i-carbon-list" @click="showKindModal = true">插入组件</UButton>
              <UButton size="xs" color="white" icon="i-carbon-smile" @click="showEmojiModal = true">插入表情</UButton>
              <UButton size="xs" color="white" icon="i-carbon-paint-brush" @click="showPatternModal = true">图案</UButton>
              <UButton size="xs" color="white" icon="i-carbon-star" @click="showIconModal = true">插入图标</UButton>
            </div>
            <textarea ref="contentRef" v-model="form.content" rows="18"
              class="w-full rounded-lg border border-gray-300 bg-white p-3 font-mono text-sm leading-6 outline-none focus:border-primary-500 dark:border-gray-600 dark:bg-neutral-900"
              placeholder="支持 Markdown。用上方「插入组件」可在光标处嵌入按钮/卡片等组件围栏。"/>
          </UFormGroup>

          <div class="flex justify-end gap-2">
            <UButton to="/sys/settings?tab=pages" color="white">返回列表</UButton>
            <UButton :loading="saving" @click="save">保存</UButton>
          </div>
        </section>

        <!-- 预览列：大屏右栏、小屏下方（DOM 顺序在表单之后） -->
        <section class="rounded-2xl border border-gray-200/70 bg-white/80 p-5 dark:border-gray-700/60 dark:bg-neutral-800/80">
          <h2 class="mb-3 text-sm font-semibold text-gray-500 dark:text-gray-400">实时预览</h2>
          <p v-if="!previewBlocks.length" class="py-16 text-center text-sm text-gray-400">左侧输入正文后此处实时预览</p>
          <PageRenderer v-else :blocks="previewBlocks"/>
        </section>
      </div>
    </main>

    <!-- 第一步：选择组件 kind（七种） -->
    <UModal v-model="showKindModal" :ui="{ container: 'flex justify-center items-center backdrop-blur' }">
      <div class="w-full max-w-md rounded-xl bg-white p-5 shadow-xl dark:bg-neutral-800">
        <p class="mb-3 text-lg font-bold">选择组件类型</p>
        <div class="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <UButton v-for="k in KIND_OPTIONS" :key="k.value" color="white" block @click="openComponentModal(k.value)">{{ k.label }}</UButton>
        </div>
        <div class="mt-4 flex justify-end"><UButton color="gray" variant="ghost" @click="showKindModal = false">取消</UButton></div>
      </div>
    </UModal>

    <!-- 第二步：所选 kind 的极简表单 + 实时 JSON 预览 -->
    <UModal v-model="showComponentModal" :ui="{ container: 'flex justify-center items-center backdrop-blur' }">
      <div class="max-h-[85vh] w-full max-w-2xl overflow-auto rounded-xl bg-white p-5 shadow-xl dark:bg-neutral-800">
        <p class="mb-3 text-lg font-bold">{{ KIND_OPTIONS.find(k => k.value === activeKind)?.label }} · 极简表单</p>
        <div v-if="ITEM_FIELDS[activeKind]" class="space-y-2">
          <div v-for="(row, index) in componentItems" :key="index" class="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-gray-300 p-2 dark:border-gray-600">
            <UInput v-for="f in ITEM_FIELDS[activeKind]" :key="f.key" v-model="row[f.key]" :placeholder="f.ph" size="sm" class="min-w-[9rem] flex-1"/>
            <UButton size="xs" color="red" variant="soft" icon="i-carbon-trash-can" @click="removeItemRow(index)"/>
          </div>
          <UButton size="xs" color="white" icon="i-carbon-add" @click="addItemRow">加一行</UButton>
        </div>
        <div v-if="activeKind === 'card'" class="mt-3 flex items-center gap-2">
          <span class="text-sm text-gray-500">列数（1-4）</span>
          <UInput v-model="componentExtra.columns" type="number" :min="1" :max="4" size="sm" class="w-24"/>
        </div>
        <div v-if="activeKind === 'countdown'" class="mt-3 space-y-2">
          <UInput v-model="componentExtra.target" placeholder="目标时间，如 2027-01-01 00:00:00"/>
          <UInput v-model="componentExtra.label" placeholder="前缀文案（可选），如 距离新年还有"/>
          <UInput v-model="componentExtra.doneText" placeholder="完成态文案（可选）"/>
        </div>
        <div v-if="activeKind === 'music'" class="mt-3 space-y-2">
          <UInput v-model="componentExtra.url" placeholder="音频地址，如 /upload/media/2026/10/01/a.mp3"/>
          <UInput v-model="componentExtra.name" placeholder="歌曲名"/>
          <UInput v-model="componentExtra.artist" placeholder="歌手（可选）"/>
          <UInput v-model="componentExtra.cover" placeholder="封面图（可选）"/>
        </div>
        <p class="mb-1 mt-4 text-xs text-gray-500">实时预览（确认后按协议插入光标处）</p>
        <pre class="overflow-auto rounded-lg bg-gray-100 p-3 text-xs leading-5 dark:bg-neutral-900">{{ componentFence }}</pre>
        <div class="mt-4 flex justify-end gap-2">
          <UButton color="gray" variant="soft" @click="showComponentModal = false">取消</UButton>
          <UButton @click="confirmInsertComponent">插入到光标处</UButton>
        </div>
      </div>
    </UModal>

    <!-- 插入表情：内嵌 Emoji 组件（五组 emoji 字符） -->
    <UModal v-model="showEmojiModal" :ui="{ container: 'flex justify-center items-center backdrop-blur' }">
      <div class="w-full max-w-md rounded-xl bg-white p-5 shadow-xl dark:bg-neutral-800">
        <p class="mb-3 text-lg font-bold">插入表情</p>
        <Emoji @selected="onEmojiSelected"/>
        <div class="mt-3 flex justify-end"><UButton color="gray" variant="ghost" @click="showEmojiModal = false">关闭</UButton></div>
      </div>
    </UModal>

    <!-- 图案：复用站内内置的状态图案集（utils/statusPatterns.js，与用户状态设置共用同一份数据） -->
    <UModal v-model="showPatternModal" :ui="{ container: 'flex justify-center items-center backdrop-blur' }">
      <div class="max-h-[85vh] w-full max-w-2xl overflow-auto rounded-xl bg-white p-5 shadow-xl dark:bg-neutral-800">
        <p class="mb-1 text-lg font-bold">图案</p>
        <p class="mb-3 text-xs text-gray-500 dark:text-gray-400">站内内置的「图案 + 文案」四组，点一下插入光标处。</p>
        <div class="mb-3 flex items-center gap-2">
          <UToggle v-model="patternWithText"/>
          <span class="text-sm text-gray-500 dark:text-gray-400">同时插入文案（如「💼 忙」）</span>
        </div>
        <div v-for="group in STATUS_PATTERN_GROUPS" :key="group.group" class="mb-3">
          <p class="mb-1 text-xs font-semibold text-gray-400">{{ group.group }}</p>
          <div class="flex flex-wrap gap-1">
            <button v-for="item in group.items" :key="item.content" type="button"
              class="rounded-lg border border-gray-200 px-2 py-1 text-sm hover:border-primary-400 hover:bg-primary-50 dark:border-gray-600 dark:hover:bg-neutral-700"
              :title="item.content" @click="onPatternSelected(item)">{{ item.icon }} {{ item.content }}</button>
          </div>
        </div>
        <div class="mt-2 flex justify-end"><UButton color="gray" variant="ghost" @click="showPatternModal = false">关闭</UButton></div>
      </div>
    </UModal>

    <!-- 插入图标：带图标预览的常用名网格 + 自定义输入（右侧实时预览） -->
    <UModal v-model="showIconModal" :ui="{ container: 'flex justify-center items-center backdrop-blur' }">
      <div class="w-full max-w-2xl rounded-xl bg-white p-5 shadow-xl dark:bg-neutral-800">
        <p class="mb-3 text-lg font-bold">插入图标</p>
        <div class="grid max-h-64 grid-cols-2 gap-1 overflow-auto sm:grid-cols-3">
          <button v-for="name in ICON_PRESETS" :key="name" type="button"
            class="flex items-center gap-2 rounded-lg border px-2 py-1.5 text-left text-xs"
            :class="(!customIcon && selectedIcon === name)
              ? 'border-primary-400 bg-primary-50 dark:border-primary-400 dark:bg-neutral-700'
              : 'border-gray-200 hover:border-primary-300 dark:border-gray-600'"
            @click="selectedIcon = name; customIcon = ''">
            <UIcon :name="name" class="h-5 w-5 shrink-0"/>
            <span class="truncate">{{ name }}</span>
          </button>
        </div>
        <div class="mt-3 flex items-center gap-2">
          <UInput v-model="customIcon" class="flex-1" placeholder="自定义 Iconify 名，如 i-heroicons-heart-solid"/>
          <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-gray-200 dark:border-gray-600">
            <UIcon v-if="effectiveIcon" :name="effectiveIcon" class="h-5 w-5"/>
            <UIcon v-else name="i-carbon-help" class="h-5 w-5 text-gray-400"/>
          </span>
        </div>
        <p class="mt-2 text-xs text-gray-500 dark:text-gray-400">右侧方框是实时预览；插入的是图标名文本，可填进组件 JSON 的 icon 字段</p>
        <div class="mt-4 flex justify-end gap-2">
          <UButton color="gray" variant="soft" @click="showIconModal = false">取消</UButton>
          <UButton @click="confirmInsertIcon">插入</UButton>
        </div>
      </div>
    </UModal>
  </div>
</template>

<script setup lang="ts">
/**
 * 自定义页面编辑器（/sys/pages/new 新建、/sys/pages/:id 编辑）。
 *
 * 数据流：编辑态 onMounted 调 /admin/page/get（body: { id }）预填，失败 toast 并跳回列表；
 * 保存统一调 /admin/page/save（新建不带 id、更新带 id），成功后跳 /sys/settings?tab=pages。
 * 提交前先按 SLUG_PATTERN 与保留字校验（与 worker 侧同规则，先拦截再请求）。
 *
 * 正文编辑：大文本域 + 工具条四按钮，光标插入统一走 textarea 的
 * selectionStart/selectionEnd 拼接并恢复焦点：
 *   - 插入组件：先选 kind（七种）再填极简表单，实时 JSON 预览，确认后按
 *     「```ui:kind / 一行 JSON / ```」三行围栏协议插入（协议见 utils/pageBlocks.js）；
 *   - 插入表情：内嵌 Emoji 组件（五组 emoji 字符），监听 selected 事件即点即插；
 *   - 图案：复用 utils/statusPatterns.js 的站内内置图案集（四组「图案 + 文案」），
 *     可选是否连文案一起插入（如「💼 忙」）；
 *   - 插入图标：常用 Iconify 名下拉 + 自定义输入，插入图标名文本。
 * 预览：computed 调 parsePageBlocks 后交给 PageRenderer，大屏右栏、小屏下方。
 */
import { toast } from 'vue-sonner'
import type { SysConfigVO, UserVO } from '~/types'
import site from '~/site.config'
import { parsePageBlocks, SLUG_PATTERN, RESERVED_PAGE_SLUGS } from '~/utils/pageBlocks'
import { STATUS_PATTERN_GROUPS } from '~/utils/statusPatterns'

const config = useState<SysConfigVO>('sysConfig')
const currentUser = useState<UserVO | null>('userinfo')
const route = useRoute()

/** 路由参数归一：new → 新建（null），正整数 → 编辑 id，其余按新建处理 */
const pageId = computed<number | null>(() => {
  const raw = Array.isArray(route.params.id) ? route.params.id[0] : route.params.id
  const value = String(raw || '')
  if (value === 'new') return null
  if (!/^[1-9]\d*$/.test(value)) return null
  const number = Number(value)
  return Number.isSafeInteger(number) && number > 0 ? number : null
})

const form = reactive({
  title: '',
  slug: '',
  content: '',
  seoDescription: '',
  sortOrder: 0,
  enabled: true,
  showInNav: false,
})

onMounted(async () => {
  if (!pageId.value) return
  try {
    const res: any = await useMyFetch('/admin/page/get', { id: pageId.value })
    form.title = String(res.title || '')
    form.slug = String(res.slug || '')
    form.content = String(res.content || '')
    form.seoDescription = String(res.seoDescription || '')
    form.sortOrder = Number(res.sortOrder) || 0
    form.enabled = res.enabled !== false && res.enabled !== 0
    form.showInNav = res.showInNav === true || res.showInNav === 1
  } catch (error: any) {
    toast.error(error?.message || '页面不存在')
    await navigateTo('/sys/settings?tab=pages')
  }
})

/** 最终访问地址实时提示（siteUrl 优先，回退当前 origin） */
const finalUrl = computed(() => {
  const origin = String(config.value.siteUrl || (typeof window !== 'undefined' ? window.location.origin : '')).replace(/\/+$/, '')
  return `${origin}/${form.slug.trim() || '你的slug'}`
})

/* ---------- 光标插入：工具条三种插入的公共出口 ---------- */
const contentRef = ref<HTMLTextAreaElement | null>(null)
const insertAtCursor = (text: string) => {
  const el = contentRef.value
  if (!el) {
    form.content += text
    return
  }
  const start = el.selectionStart ?? form.content.length
  const end = el.selectionEnd ?? start
  form.content = form.content.slice(0, start) + text + form.content.slice(end)
  nextTick(() => {
    el.focus()
    el.selectionStart = el.selectionEnd = start + text.length
  })
}

/* ---------- 插入组件：选 kind → 极简表单 → 实时 JSON → 围栏插入 ---------- */
const KIND_OPTIONS = [
  { label: '按钮组', value: 'button' },
  { label: '卡片网格', value: 'card' },
  { label: '倒计时', value: 'countdown' },
  { label: '时间线', value: 'timeline' },
  { label: '图片灯箱', value: 'gallery' },
  { label: '音乐播放器', value: 'music' },
  { label: '图标网格', value: 'icons' },
]
const showKindModal = ref(false)
const showComponentModal = ref(false)
const activeKind = ref('button')
const componentItems = ref<Array<Record<string, string>>>([])
const componentExtra = reactive({ columns: 2, target: '', label: '', doneText: '', url: '', name: '', artist: '', cover: '' })

/** 各 kind 的 items 行编辑字段（music/countdown 无 items，走 componentExtra 单对象） */
const ITEM_FIELDS: Record<string, Array<{ key: string, ph: string }>> = {
  button: [{ key: 'label', ph: '按钮文字' }, { key: 'href', ph: '/ 或 https://…' }, { key: 'icon', ph: 'i-carbon-home（可选）' }],
  card: [{ key: 'icon', ph: 'i-carbon-star（可选）' }, { key: 'title', ph: '标题' }, { key: 'desc', ph: '描述（可选）' }, { key: 'href', ph: '/memo/1（可选）' }],
  timeline: [{ key: 'time', ph: '2026-10-01（可选）' }, { key: 'title', ph: '标题' }, { key: 'desc', ph: '描述（可选）' }],
  gallery: [{ key: 'src', ph: '/upload/….jpg' }, { key: 'caption', ph: '说明（可选）' }],
  icons: [{ key: 'icon', ph: 'i-carbon-home 或 emoji' }, { key: 'label', ph: '文字（可选）' }, { key: 'href', ph: '/（可选）' }],
}

const emptyRow = (kind: string): Record<string, string> => Object.fromEntries((ITEM_FIELDS[kind] || []).map(f => [f.key, '']))

const openComponentModal = (kind: string) => {
  activeKind.value = kind
  componentItems.value = ITEM_FIELDS[kind] ? [emptyRow(kind)] : []
  Object.assign(componentExtra, { columns: 2, target: '', label: '', doneText: '', url: '', name: '', artist: '', cover: '' })
  showKindModal.value = false
  showComponentModal.value = true
}
const addItemRow = () => componentItems.value.push(emptyRow(activeKind.value))
const removeItemRow = (index: number) => componentItems.value.splice(index, 1)

/** 丢弃空字符串/空白字段，保持插入的 JSON 干净（协议里这些都是可选字段） */
const compact = (obj: Record<string, any>) => Object.fromEntries(Object.entries(obj).filter(([, v]) => String(v ?? '').trim() !== ''))

/** 按协议组装 data：空行整行丢弃，行内空字段不入 JSON */
const componentData = computed(() => {
  if (activeKind.value === 'music') return compact({ url: componentExtra.url, name: componentExtra.name, artist: componentExtra.artist, cover: componentExtra.cover })
  if (activeKind.value === 'countdown') return compact({ target: componentExtra.target, label: componentExtra.label, doneText: componentExtra.doneText })
  const items = componentItems.value
    .map(row => compact(row))
    .filter(row => Object.keys(row).length > 0)
  const data: Record<string, any> = {}
  if (activeKind.value === 'card') data.columns = Number(componentExtra.columns) || 2
  data.items = items
  return data
})

/** 待插入的三行围栏原文（同时是 JSON 预览内容） */
const componentFence = computed(() => `\`\`\`ui:${activeKind.value}\n${JSON.stringify(componentData.value)}\n\`\`\``)

const confirmInsertComponent = () => {
  insertAtCursor(`\n${componentFence.value}\n`)
  showComponentModal.value = false
}

/* ---------- 插入表情（Emoji 组件：常用/人物/食物/物品/标志五组字符） ---------- */
const showEmojiModal = ref(false)
const onEmojiSelected = (value: string) => {
  insertAtCursor(value)
  showEmojiModal.value = false
}

/* ---------- 图案：复用站内内置状态图案集（与用户状态设置同一份数据） ---------- */
const showPatternModal = ref(false)
/** 关闭时只插图案字符；开启时连文案一起插（如「💼 忙」） */
const patternWithText = ref(false)
const onPatternSelected = (item: { icon: string, content: string }) => {
  insertAtCursor(patternWithText.value ? `${item.icon} ${item.content}` : item.icon)
  showPatternModal.value = false
}

/* ---------- 插入图标（常用 Iconify 名 + 自定义输入） ---------- */
const ICON_PRESETS = [
  'i-carbon-home', 'i-carbon-star', 'i-carbon-heart', 'i-carbon-user', 'i-carbon-image',
  'i-carbon-camera', 'i-carbon-music', 'i-carbon-video', 'i-carbon-mail', 'i-carbon-link',
  'i-carbon-calendar', 'i-carbon-location', 'i-carbon-search', 'i-carbon-settings', 'i-carbon-download',
]
const showIconModal = ref(false)
const selectedIcon = ref(ICON_PRESETS[0])
const customIcon = ref('')
/** 当前将要插入的图标名：自定义输入优先，否则用网格里选中的那个（网格与预览框都用它渲染） */
const effectiveIcon = computed(() => String(customIcon.value || '').trim() || String(selectedIcon.value || '').trim())
const confirmInsertIcon = () => {
  const value = effectiveIcon.value
  if (!value) return toast.error('请选择或输入图标名')
  insertAtCursor(value)
  customIcon.value = ''
  showIconModal.value = false
}

/* ---------- 预览与保存 ---------- */
const previewBlocks = computed(() => parsePageBlocks(form.content))

const saving = ref(false)
const save = async () => {
  const title = form.title.trim()
  const slug = form.slug.trim()
  if (title.length < 1 || title.length > 60) return toast.error('标题需为 1-60 字')
  if (!SLUG_PATTERN.test(slug)) return toast.error('slug 仅支持小写字母、数字、连字符（1-40 位）')
  if (RESERVED_PAGE_SLUGS.includes(slug)) return toast.error('该 slug 为系统保留，请更换')
  saving.value = true
  try {
    const body: Record<string, any> = {
      slug,
      title,
      content: form.content.slice(0, 100000),
      seoDescription: form.seoDescription.trim().slice(0, 300),
      sortOrder: Number(form.sortOrder) || 0,
      enabled: form.enabled ? 1 : 0,
      showInNav: form.showInNav ? 1 : 0,
    }
    if (pageId.value) body.id = pageId.value
    await useMyFetch('/admin/page/save', body)
    toast.success('保存成功')
    await navigateTo('/sys/settings?tab=pages')
  } catch (error: any) {
    toast.error(error?.message || '保存失败')
  } finally {
    saving.value = false
  }
}

useHead({ title: () => `${pageId.value ? '编辑' : '新建'}自定义页面 - ${config.value.title || site.title}` })
</script>

<style scoped>
/* 编辑器两栏需要比内容页更宽（表单 + 预览），深色底由 tailwind dark: 前缀类承担 */
.editor-shell { max-width: 72rem; margin-inline: auto; overflow-x: clip; }
</style>
