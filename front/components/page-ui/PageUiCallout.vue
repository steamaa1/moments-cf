<script setup>
/**
 * 自定义页面组件：提示框（kind: callout）
 *
 * 数据协议（全部字段容错，空数据渲染空容器）：
 *   { "tone": "info", "icon": "i-carbon-information-filled", "title": "说明", "text": "正文，支持 **markdown**" }
 *   - tone: info / warning / success / danger，非法值回退 info
 *   - icon: 可选 Iconify 名，缺省按 tone 取默认图标
 *   - title / text: 均可省略；两者都空时整个块不渲染
 *   - text 走共享 markdown 渲染器（与 PageRenderer 同一实例，见 utils/pageMarkdown.js）
 *
 * 示例正文围栏：
 *   ```ui:callout
 *   { "tone": "warning", "title": "注意", "text": "本周六 03:00 例行维护。" }
 *   ```
 */
import { renderPageMarkdown } from '~/utils/pageMarkdown'

const props = defineProps({
  data: { type: null, default: () => ({}) },
})

const isPlainObject = value => !!value && typeof value === 'object' && !Array.isArray(value)

/** tone 元数据集中在一处：样式与默认图标同源，新增 tone 只改这里 */
const TONES = {
  info: {
    icon: 'i-carbon-information-filled',
    class: 'border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-100',
  },
  warning: {
    icon: 'i-carbon-warning-alt',
    class: 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100',
  },
  success: {
    icon: 'i-carbon-checkmark-filled',
    class: 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-100',
  },
  danger: {
    icon: 'i-carbon-error-filled',
    class: 'border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-100',
  },
}

const d = computed(() => (isPlainObject(props.data) ? props.data : {}))
const tone = computed(() => (TONES[d.value.tone] ? d.value.tone : 'info'))
const toneMeta = computed(() => TONES[tone.value])
const title = computed(() => String(d.value.title || ''))
const text = computed(() => String(d.value.text || ''))
</script>

<template>
  <aside
    v-if="title || text"
    class="page-ui-callout not-prose my-4 flex gap-3 rounded-xl border p-4"
    :class="toneMeta.class"
  >
    <UIcon :name="d.icon || toneMeta.icon" class="mt-0.5 h-5 w-5 shrink-0"/>
    <div class="min-w-0 flex-1">
      <p v-if="title" class="text-sm font-semibold">{{ title }}</p>
      <div v-if="text" class="page-ui-callout-text mt-1 text-sm leading-relaxed" v-html="renderPageMarkdown(text)"/>
    </div>
  </aside>
</template>

<style scoped>
/* 提示框正文是短文本：压掉 .markdown-content 给时间线短动态设的首尾外边距 */
.page-ui-callout-text :deep(> :first-child) { margin-top: 0; }
.page-ui-callout-text :deep(> :last-child) { margin-bottom: 0; }
.page-ui-callout-text :deep(p) { margin-bottom: .4em; }
</style>
