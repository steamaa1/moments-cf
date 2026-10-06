<script setup>
/**
 * 自定义页面组件：卡片网格（kind: card）
 *
 * 数据协议（全部字段容错，空数据渲染空容器）：
 *   { "columns": 2, "items": [{ "icon": "i-carbon-star", "title": "标题", "desc": "描述", "href": "/memo/1" }] }
 *   - columns: 1–4 列，默认 2，非法值回退默认（clamp 到 1–4）
 *   - items: 数组，缺省/非数组按空处理
 *   - item.icon / title / desc / href 均可省略；有 href 时整卡可点（NuxtLink）
 *
 * 示例正文围栏：
 *   ```ui:card
 *   { "columns": 3, "items": [{ "icon": "i-carbon-star", "title": "收藏", "desc": "我的书签", "href": "/tags" }] }
 *   ```
 */
import { NuxtLink } from '#components'

const props = defineProps({
  data: { type: null, default: () => ({}) },
})

const items = computed(() => (Array.isArray(props.data && props.data.items) ? props.data.items.filter(Boolean) : []))
const columns = computed(() => {
  const raw = Number(props.data && props.data.columns)
  if (!Number.isFinite(raw)) return 2
  return Math.min(4, Math.max(1, Math.round(raw)))
})
</script>

<template>
  <div
    v-if="items.length"
    class="page-ui-card grid gap-4 not-prose my-4"
    :style="{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }"
  >
    <component
      :is="item.href ? NuxtLink : 'div'"
      v-for="(item, index) in items"
      :key="index"
      :to="item.href || undefined"
      class="page-ui-card-item block rounded-2xl border border-gray-200/70 bg-white/70 p-4 transition-shadow hover:shadow-md"
    >
      <div class="flex items-center gap-2">
        <UIcon v-if="item.icon" :name="item.icon" class="h-5 w-5 shrink-0 text-[#78943f]"/>
        <p v-if="item.title" class="truncate text-sm font-semibold text-gray-900">{{ item.title }}</p>
      </div>
      <p v-if="item.desc" class="mt-2 text-xs leading-relaxed text-gray-500">{{ item.desc }}</p>
    </component>
  </div>
</template>

<style scoped>
/* 手机上无论 columns 是多少都强制单列，避免小屏挤成细条 */
@media (max-width: 640px) {
  .page-ui-card { grid-template-columns: minmax(0, 1fr) !important; }
}
.dark .page-ui-card-item { border-color: rgba(255, 255, 255, .1); background: rgba(24, 24, 27, .55); }
.dark .page-ui-card-item:hover { border-color: rgba(159, 200, 74, .45); }
.dark .page-ui-card-item .text-gray-900 { color: #f4f4f5; }
.dark .page-ui-card-item .text-gray-500 { color: #a1a1aa; }
</style>
