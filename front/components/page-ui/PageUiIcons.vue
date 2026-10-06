<script setup>
/**
 * 自定义页面组件：图标网格（kind: icons）
 *
 * 数据协议（全部字段容错，空数据渲染空容器）：
 *   { "items": [{ "icon": "i-carbon-home", "label": "首页", "href": "/" }] }
 *   - items: 数组，缺省/非数组按空处理
 *   - item.icon: 以 i- 开头按 Iconify 图标渲染（已装集：carbon heroicons icon-park-solid
 *     jam lets-icons octicon solar），否则按 emoji / 文本原样渲染
 *   - item.label: 可选文字；item.href: 可选，有则整项为 NuxtLink
 *
 * 示例正文围栏：
 *   ```ui:icons
 *   { "items": [{ "icon": "i-carbon-home", "label": "首页", "href": "/" }, { "icon": "🌱", "label": "绿植" }] }
 *   ```
 */
import { NuxtLink } from '#components'

const props = defineProps({
  data: { type: null, default: () => ({}) },
})

const items = computed(() => (Array.isArray(props.data && props.data.items) ? props.data.items.filter(Boolean) : []))
const isIconClass = icon => typeof icon === 'string' && icon.startsWith('i-')
</script>

<template>
  <div v-if="items.length" class="page-ui-icons grid grid-cols-3 gap-3 not-prose my-4 sm:grid-cols-4 md:grid-cols-6">
    <component
      :is="item.href ? NuxtLink : 'div'"
      v-for="(item, index) in items"
      :key="index"
      :to="item.href || undefined"
      class="page-ui-icons-item flex flex-col items-center justify-center gap-2 rounded-2xl border border-gray-200/60 bg-white/60 px-2 py-4 text-center transition-colors hover:border-[#9fc84a]/60"
    >
      <UIcon v-if="isIconClass(item.icon)" :name="item.icon" class="h-6 w-6 text-gray-700"/>
      <span v-else-if="item.icon" class="text-2xl leading-none">{{ item.icon }}</span>
      <span v-if="item.label" class="w-full truncate text-xs text-gray-600">{{ item.label }}</span>
    </component>
  </div>
</template>

<style scoped>
.dark .page-ui-icons-item { border-color: rgba(255, 255, 255, .1); background: rgba(24, 24, 27, .55); }
.dark .page-ui-icons-item:hover { border-color: rgba(159, 200, 74, .45); }
.dark .page-ui-icons-item .text-gray-700 { color: #e4e4e7; }
.dark .page-ui-icons-item .text-gray-600 { color: #a1a1aa; }
</style>
