<script setup>
/**
 * 自定义页面组件：竖向时间线（kind: timeline）
 *
 * 数据协议（全部字段容错，空数据渲染空容器）：
 *   { "items": [{ "time": "2026-10-01", "title": "项目启动", "desc": "第一版上线" }] }
 *   - items: 数组，缺省/非数组按空处理
 *   - item.time / title / desc 均可省略，各自有值才渲染
 *
 * 示例正文围栏：
 *   ```ui:timeline
 *   { "items": [{ "time": "2026-10-01", "title": "项目启动", "desc": "第一版上线" }] }
 *   ```
 */
const props = defineProps({
  data: { type: null, default: () => ({}) },
})

const items = computed(() => (Array.isArray(props.data && props.data.items) ? props.data.items.filter(Boolean) : []))
</script>

<template>
  <ol v-if="items.length" class="page-ui-timeline relative my-4 ml-2 space-y-6 border-l-2 border-gray-200/80 pl-6 not-prose">
    <li v-for="(item, index) in items" :key="index" class="relative">
      <span class="page-ui-timeline-dot absolute -left-[1.9rem] top-1.5 h-2.5 w-2.5 rounded-full"/>
      <p v-if="item.time" class="page-ui-timeline-time text-xs">{{ item.time }}</p>
      <p v-if="item.title" class="text-sm font-semibold text-gray-900">{{ item.title }}</p>
      <p v-if="item.desc" class="mt-1 text-sm leading-relaxed text-gray-600">{{ item.desc }}</p>
    </li>
  </ol>
</template>

<style scoped>
.page-ui-timeline-dot { background: #9fc84a; box-shadow: 0 0 0 4px rgba(159, 200, 74, .18); }
.page-ui-timeline-time { color: #a1a1aa; }
.dark .page-ui-timeline { border-color: rgba(255, 255, 255, .12); }
.dark .page-ui-timeline-dot { background: #9fc84a; box-shadow: 0 0 0 4px rgba(159, 200, 74, .25); }
.dark .page-ui-timeline .text-gray-900 { color: #f4f4f5; }
.dark .page-ui-timeline .text-gray-600 { color: #d4d4d8; }
</style>
