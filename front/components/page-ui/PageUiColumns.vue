<script setup>
/**
 * 自定义页面组件：分栏（kind: columns）
 *
 * 数据协议（全部字段容错，空数据渲染空容器）：
 *   { "items": [{ "title": "左栏", "text": "支持 **markdown** 的正文" }] }
 *   - items: 1–3 栏，缺省/非数组按空处理；非对象行丢弃
 *   - 超过 3 栏时仍按 3 列排（>3 的行换行继续），保证手机外的可读性
 *   - title 可选；text 走共享 markdown 渲染器（与 PageRenderer 同一实例）
 *
 * 这是「一维块序列」里的轻量分栏：栏内是 markdown 字符串而不是嵌套块，
 * 因此不需要嵌套结构，也不会破坏 content 的文本协议（见 P1 总览笔记）。
 *
 * 示例正文围栏：
 *   ```ui:columns
 *   { "items": [{ "title": "关于我", "text": "写代码，也写字。" }, { "title": "关于本站", "text": "Cloudflare 原生。" }] }
 *   ```
 */
import { renderPageMarkdown } from '~/utils/pageMarkdown'

const props = defineProps({
  data: { type: null, default: () => ({}) },
})

const isPlainObject = value => !!value && typeof value === 'object' && !Array.isArray(value)

/** 栏数 → Tailwind 网格类：字面量写在源码里，JIT 才能扫到 */
const GRID_CLASS = {
  1: 'md:grid-cols-1',
  2: 'md:grid-cols-2',
  3: 'md:grid-cols-3',
}

const d = computed(() => (isPlainObject(props.data) ? props.data : {}))
const items = computed(() => (Array.isArray(d.value.items) ? d.value.items.filter(isPlainObject) : []))
const gridClass = computed(() => GRID_CLASS[Math.min(3, Math.max(1, items.value.length))])
</script>

<template>
  <div v-if="items.length" class="page-ui-columns my-4 grid grid-cols-1 gap-4 not-prose" :class="gridClass">
    <section
      v-for="(item, index) in items"
      :key="index"
      class="min-w-0 rounded-xl border border-gray-200/80 bg-white/70 p-4 dark:border-gray-700 dark:bg-neutral-800/60"
    >
      <p v-if="item.title" class="mb-2 text-sm font-semibold text-gray-800 dark:text-gray-100">{{ item.title }}</p>
      <div
        v-if="item.text"
        class="markdown-content text-sm leading-relaxed text-gray-600 dark:text-gray-300"
        v-html="renderPageMarkdown(item.text)"
      />
    </section>
  </div>
</template>
