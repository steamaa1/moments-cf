<script setup>
/**
 * PageBlockList：块编辑器（Gutenberg-lite P1）的块列表面板。
 *
 * 契约（t4 编辑器按此接入）：
 *   props.blocks —— parsePageBlocks 输出形态的块数组；父组件是唯一事实源，本面板不改它
 *   emit('select', index)        —— 点击行选中
 *   emit('add', 'markdown'|kind) —— 添加菜单：文本块或注册表七 kind 之一
 *   emit('remove', index)        —— 行删除
 *   emit('reorder', blocks)      —— 拖拽 / 上移 / 下移后的新数组（浅拷贝，原数组不动）
 *
 * 行渲染：ui 块显示注册表 icon 与中文 label（未知 kind 用 help 图标 + 原始 kind 名兜底）；
 * markdown 块显示「文本」与前 30 字摘要（空白压成单空格，超长省略）。
 *
 * 选中态：selected 只是面板内视觉反馈（props 不回传选中索引，父组件才是选中事实源）。
 * 点击行即高亮并 emit；remove/reorder 后本地尽力跟随移动，blocks 外部变化时越界收敛。
 *
 * 拖拽排序（仓库已踩坑，硬性做法见 AGENTS.md Pitfalls 与 UploadImagePreview.vue 修法）：
 *   - 直接用 sortablejs 而非 @vueuse/integrations 的 useSortable——后者在 onUpdate 里会先把
 *     被拖节点 removeNode+insertNodeAt 挪回原位再于 nextTick 替换数组，onEnd 里读 DOM 顺序
 *     读到的是复位后的旧顺序；直接持有 Sortable 实例，onEnd 的处理完全自己掌控。
 *   - onEnd 只取 evt.oldIndex/newIndex：① 先把 Sortable 已物理挪动的节点放回 oldIndex
 *     （以「除自身外的兄弟行」定位），让 DOM 与旧 vdom 一致——Vue 才是 DOM 事实源，
 *     不复位的话下次 patch 按 vdom 与被挪 DOM 打架，表现为松手弹回/错位；
 *     ② 再对 blocks 浅拷贝 splice 出新数组 emit。全程绝不读 DOM 顺序。
 *   - forceFallback: true（原生 HTML5 拖放在触摸屏无效）+ fallbackOnBody + fallbackTolerance 4。
 *   - 行容器是 v-if 渲染（空列表不渲染）：watch 元素引用出现后再 Sortable.create（幂等守护），
 *     消失即 destroy，onBeforeUnmount 兜底销毁——onMounted 里一次性初始化建不起实例。
 *   - 仅 .pb-list-handle 把手可拖（与 MemoEdit 的 .block-handle 圆点习惯一致，点击选中
 *     不与拖拽冲突）；单块时不渲染把手（单行排序无意义）。
 *
 * 给 t4 的提示：拖拽（手指按下到 onEnd）的窗口内不要从外部替换 blocks（重渲染会与
 * 复位中的 DOM 竞争），reorder emit 后再统一更新。
 */
import Sortable from 'sortablejs'
import { PAGE_BLOCK_REGISTRY } from '~/utils/pageBlockSchema'

const props = defineProps({
  /** parsePageBlocks 输出形态的块数组 */
  blocks: { type: Array, default: () => [] },
})

const emit = defineEmits(['select', 'add', 'remove', 'reorder'])

/* ---------- 行数据与渲染辅助 ---------- */

const rows = computed(() => (Array.isArray(props.blocks) ? props.blocks : []))

/** ui 块取注册表 icon；markdown 块固定文档图标；未知 kind 用 help 兜底，坏数据不崩 */
const blockIcon = block =>
  block?.type === 'ui' ? PAGE_BLOCK_REGISTRY[block.kind]?.icon || 'i-carbon-help' : 'i-carbon-document'

const blockTitle = block => {
  if (block?.type === 'ui') return PAGE_BLOCK_REGISTRY[block.kind]?.label || String(block.kind || '未知组件')
  return '文本'
}

/** markdown 前 30 字摘要：空白压成单空格，超长加省略号 */
const blockSummary = block => {
  if (block?.type !== 'markdown') return ''
  const text = String(block.value ?? '').replace(/\s+/g, ' ').trim()
  if (!text) return '（空）'
  return text.length > 30 ? `${text.slice(0, 30)}…` : text
}

/* ---------- 选中视觉（父组件是选中事实源，这里只管行高亮） ---------- */

const selected = ref(-1)

const selectRow = index => {
  selected.value = index
  emit('select', index)
}

/* blocks 外部变化（父更新数组）后越界收敛 */
watch(rows, list => {
  if (selected.value >= list.length) selected.value = -1
})

/* ---------- 删除与重排：全部走 emit，不改 props ---------- */

const removeRow = index => {
  if (selected.value === index) selected.value = -1
  else if (selected.value > index) selected.value -= 1
  emit('remove', index)
}

/**
 * 统一重排出口（拖拽 onEnd 与上移/下移按钮共用），oldIndex→newIndex 均为数组下标：
 * 下标合法才动，selected 在移动区间内则同步跟随，浅拷贝 splice 后 emit 新数组。
 */
const applyMove = (oldIndex, newIndex) => {
  const list = rows.value
  if (oldIndex === newIndex || oldIndex < 0 || newIndex < 0 || oldIndex >= list.length || newIndex >= list.length) return
  if (selected.value === oldIndex) selected.value = newIndex
  else if (oldIndex < selected.value && newIndex >= selected.value) selected.value -= 1
  else if (newIndex <= selected.value && oldIndex > selected.value) selected.value += 1
  const next = [...list]
  const [moved] = next.splice(oldIndex, 1)
  next.splice(newIndex, 0, moved)
  emit('reorder', next)
}

const moveUp = index => applyMove(index, index - 1)
const moveDown = index => applyMove(index, index + 1)

/* ---------- 拖拽：直接 sortablejs（坑清单见顶部注释） ---------- */

const listRef = ref(null)
let sortable = null

const destroySortable = () => {
  if (sortable) {
    sortable.destroy()
    sortable = null
  }
}

/** 容器出现后建实例（同一容器不重建，幂等）；onEnd 先复位 DOM 再按下标 emit */
const ensureSortable = () => {
  const el = listRef.value
  if (!el || (sortable && sortable.el === el)) return
  destroySortable()
  sortable = Sortable.create(el, {
    handle: '.pb-list-handle',
    forceFallback: true,
    fallbackOnBody: true,
    fallbackTolerance: 4,
    animation: 150,
    ghostClass: 'pb-list-ghost',
    chosenClass: 'pb-list-chosen',
    onEnd(evt) {
      const { oldIndex, newIndex, item, from } = evt
      if (oldIndex == null || newIndex == null || oldIndex === newIndex) return
      /* ① DOM 复位（无条件先做：Sortable 已经挪了 DOM，任何后续分支都不能带着错位 DOM
         离开 onEnd）：以「除自身外的兄弟行」定位放回 oldIndex，让 DOM 回到与旧 vdom
         一致，渲染交还给 Vue */
      const siblings = Array.from(from.children).filter(node => node !== item)
      from.insertBefore(item, siblings[oldIndex] ?? null)
      /* ② 只按下标重组数据 emit，全程不读 DOM 顺序；下标合法性由 applyMove 兜底 */
      applyMove(oldIndex, newIndex)
    },
  })
}

/* 行容器 v-if 渲染：元素出现才建实例、消失即销毁；immediate 覆盖首帧已渲染的场景 */
watch(
  listRef,
  el => {
    if (el) ensureSortable()
    else destroySortable()
  },
  { immediate: true },
)
onBeforeUnmount(destroySortable)

/* ---------- 添加菜单：文本块 + 注册表全部 kind（icon + 中文 label） ---------- */

const addMenuItems = computed(() => [
  [
    { label: '文本（Markdown）', icon: 'i-carbon-document', click: () => emit('add', 'markdown') },
    ...Object.values(PAGE_BLOCK_REGISTRY).map(schema => ({
      label: schema.label,
      icon: schema.icon,
      click: () => emit('add', schema.kind),
    })),
  ],
])
</script>

<template>
  <div class="page-block-list">
    <ul v-if="rows.length" ref="listRef" class="space-y-1.5">
      <li
        v-for="(block, index) in rows"
        :key="index"
        class="flex cursor-pointer items-center gap-2 rounded-lg border px-2 py-1.5 text-sm transition-colors"
        :class="selected === index
          ? 'border-primary-400 bg-primary-50 dark:border-primary-500 dark:bg-primary-400/10'
          : 'border-gray-200 bg-white/70 hover:border-primary-300 dark:border-gray-700 dark:bg-neutral-800/70 dark:hover:border-gray-500'"
        @click="selectRow(index)"
      >
        <span
          v-if="rows.length > 1"
          class="pb-list-handle flex h-6 w-5 shrink-0 cursor-grab touch-none items-center justify-center text-gray-400 dark:text-gray-500"
          title="拖拽排序"
          aria-label="拖拽排序"
        >
          <UIcon name="i-carbon-draggable" class="h-4 w-4"/>
        </span>
        <span class="w-5 shrink-0 text-right text-xs tabular-nums text-gray-400 dark:text-gray-500">{{ index + 1 }}</span>
        <UIcon :name="blockIcon(block)" class="h-4 w-4 shrink-0 text-gray-500 dark:text-gray-400"/>
        <span class="shrink-0 font-medium text-gray-700 dark:text-gray-200">{{ blockTitle(block) }}</span>
        <span class="min-w-0 flex-1 truncate text-xs text-gray-500 dark:text-gray-400">{{ blockSummary(block) }}</span>
        <span class="flex shrink-0 items-center gap-1">
          <UButton
            size="xs"
            color="white"
            icon="i-carbon-arrow-up"
            :disabled="index === 0"
            aria-label="上移"
            @click.stop="moveUp(index)"
          />
          <UButton
            size="xs"
            color="white"
            icon="i-carbon-arrow-down"
            :disabled="index === rows.length - 1"
            aria-label="下移"
            @click.stop="moveDown(index)"
          />
          <UButton
            size="xs"
            color="red"
            variant="soft"
            icon="i-carbon-trash-can"
            aria-label="删除本块"
            @click.stop="removeRow(index)"
          />
        </span>
      </li>
    </ul>
    <p
      v-else
      class="rounded-lg border border-dashed border-gray-300 px-3 py-6 text-center text-xs text-gray-400 dark:border-gray-600 dark:text-gray-500"
    >
      暂无块，点下方「添加块」开始
    </p>

    <div class="mt-3 flex justify-center">
      <UDropdown :items="addMenuItems" :popper="{ placement: 'top' }">
        <UButton size="xs" color="white" icon="i-carbon-add">添加块</UButton>
      </UDropdown>
    </div>
  </div>
</template>

<style scoped>
/* 拖拽视觉反馈：类由 SortableJS 运行时加到行元素（行是本组件渲染的，scoped 直接命中）。
   深色规则一律 .dark 前缀选择器——:global 包裹 .dark 会被 @vue/compiler-sfc 编译丢掉
   后代部分（见 AGENTS.md），本文件 grep 不到那种写法。 */
.pb-list-ghost {
  opacity: 0.4;
  border-style: dashed !important;
}

.pb-list-chosen {
  cursor: grabbing;
}

.dark .pb-list-ghost {
  opacity: 0.35;
}

.dark .pb-list-chosen {
  background-color: rgba(255, 255, 255, 0.08);
}
</style>
