<script setup>
/**
 * 自定义页面组件：数据统计（kind: stats）
 *
 * 数据协议（全部字段容错，空数据渲染空容器）：
 *   { "columns": 3, "items": [{ "value": "12", "unit": "万", "label": "总访问" }] }
 *   - columns: 1–4 列，默认 3，非法值 clamp 回 1–4
 *   - items: 数组，缺省/非数组按空处理；value 用字符串以支持 "99%" 这类写法
 *   - unit / label 可选
 *
 * 示例正文围栏：
 *   ```ui:stats
 *   { "items": [{ "value": "128", "label": "篇动态" }, { "value": "99.9", "unit": "%", "label": "可用性" }] }
 *   ```
 */
const props = defineProps({
  data: { type: null, default: () => ({}) },
})

const isPlainObject = value => !!value && typeof value === 'object' && !Array.isArray(value)

/** 列数 → Tailwind 网格类：字面量写在源码里，JIT 才能扫到 */
const GRID_CLASS = {
  1: 'sm:grid-cols-1',
  2: 'sm:grid-cols-2',
  3: 'sm:grid-cols-3',
  4: 'sm:grid-cols-4',
}

const d = computed(() => (isPlainObject(props.data) ? props.data : {}))
const items = computed(() => (Array.isArray(d.value.items) ? d.value.items.filter(isPlainObject) : []))
const columns = computed(() => {
  const raw = Number(d.value.columns)
  if (!Number.isFinite(raw)) return 3
  return Math.min(4, Math.max(1, Math.round(raw)))
})
const gridClass = computed(() => GRID_CLASS[columns.value])
</script>

<template>
  <div v-if="items.length" class="page-ui-stats my-4 grid grid-cols-1 gap-3 not-prose" :class="gridClass">
    <div
      v-for="(item, index) in items"
      :key="index"
      class="rounded-xl border border-gray-200/80 bg-white/70 px-4 py-3 text-center dark:border-gray-700 dark:bg-neutral-800/60"
    >
      <p class="text-2xl font-bold tabular-nums text-[#78943f] dark:text-[#9fc84a]">
        <span>{{ item.value }}</span>
        <span v-if="item.unit" class="ml-0.5 text-sm font-medium">{{ item.unit }}</span>
      </p>
      <p v-if="item.label" class="mt-1 text-xs text-gray-500 dark:text-gray-400">{{ item.label }}</p>
    </div>
  </div>
</template>
