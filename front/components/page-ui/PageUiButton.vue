<script setup>
/**
 * 自定义页面组件：按钮组（kind: button）
 *
 * 数据协议（全部字段容错，空数据渲染空容器）：
 *   { "items": [{ "label": "查看动态", "href": "/", "icon": "i-carbon-home" }] }
 *   - items: 数组，缺省/非数组按空处理
 *   - item.label: 按钮文字（可空）
 *   - item.href:  跳转地址，一律 NuxtLink（站内路由 / 站外 URL 均可）
 *   - item.icon:  可选 Iconify 图标名（i- 前缀），渲染在文字左侧
 *
 * 示例正文围栏：
 *   ```ui:button
 *   { "items": [{ "label": "首页", "href": "/", "icon": "i-carbon-home" }] }
 *   ```
 */
import { NuxtLink } from '#components'

const props = defineProps({
  data: { type: null, default: () => ({}) },
})

const items = computed(() => (Array.isArray(props.data && props.data.items) ? props.data.items.filter(Boolean) : []))
</script>

<template>
  <div v-if="items.length" class="page-ui-button flex flex-wrap gap-3 not-prose my-4">
    <component
      :is="item.href ? NuxtLink : 'button'"
      v-for="(item, index) in items"
      :key="index"
      :to="item.href || undefined"
      class="page-ui-button-item inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium text-gray-800 transition-colors bg-[#9fc84a]/15 hover:bg-[#9fc84a]/30"
    >
      <UIcon v-if="item.icon" :name="item.icon" class="h-4 w-4 shrink-0"/>
      <span>{{ item.label }}</span>
    </component>
  </div>
</template>

<style scoped>
.dark .page-ui-button-item { color: #e5e7eb; }
.dark .page-ui-button-item:hover { background: rgba(159, 200, 74, .35); }
</style>
