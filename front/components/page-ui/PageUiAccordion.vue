<script setup>
/**
 * 自定义页面组件：折叠面板（kind: accordion）
 *
 * 数据协议（全部字段容错，空数据渲染空容器）：
 *   { "items": [{ "title": "第一题", "text": "答案，支持 **markdown**" }] }
 *   - items: 数组，缺省/非数组按空处理；非对象行丢弃
 *   - item.title 缺省显示「未命名条目」；item.text 为空时不显示正文区
 *   - 用原生 details/summary 实现，无 JS、无状态；text 走共享 markdown 渲染器
 *
 * 示例正文围栏：
 *   ```ui:accordion
 *   { "items": [{ "title": "如何投稿", "text": "在首页点发布即可。" }] }
 *   ```
 */
import { renderPageMarkdown } from '~/utils/pageMarkdown'

const props = defineProps({
  data: { type: null, default: () => ({}) },
})

const isPlainObject = value => !!value && typeof value === 'object' && !Array.isArray(value)

const d = computed(() => (isPlainObject(props.data) ? props.data : {}))
const items = computed(() => (Array.isArray(d.value.items) ? d.value.items.filter(isPlainObject) : []))
</script>

<template>
  <div v-if="items.length" class="page-ui-accordion my-4 space-y-2 not-prose">
    <details
      v-for="(item, index) in items"
      :key="index"
      class="group rounded-xl border border-gray-200/80 bg-white/70 dark:border-gray-700 dark:bg-neutral-800/60"
    >
      <summary
        class="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-gray-800 [&::-webkit-details-marker]:hidden dark:text-gray-100"
      >
        <span class="min-w-0 flex-1">{{ item.title || '未命名条目' }}</span>
        <UIcon
          name="i-carbon-chevron-down"
          class="h-4 w-4 shrink-0 text-gray-400 transition-transform group-open:rotate-180 dark:text-gray-500"
        />
      </summary>
      <div
        v-if="item.text"
        class="markdown-content border-t border-gray-100 px-4 py-3 text-sm leading-relaxed text-gray-600 dark:border-gray-700 dark:text-gray-300"
        v-html="renderPageMarkdown(item.text)"
      />
    </details>
  </div>
</template>
