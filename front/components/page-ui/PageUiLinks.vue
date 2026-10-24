<script setup>
/**
 * 自定义页面组件：链接列表（kind: links）
 *
 * 数据协议（全部字段容错，空数据渲染空容器）：
 *   { "items": [{ "name": "友链 A", "href": "https://example.com", "desc": "一句话介绍", "icon": "i-carbon-link" }] }
 *   - items: 数组，缺省/非数组按空处理；非对象行丢弃
 *   - name 缺省回退 href；href 为空时整行不可点（渲染为普通 div）
 *   - href 仅接受 http(s):// 与站内绝对路径；desc / icon 可选
 *
 * 示例正文围栏：
 *   ```ui:links
 *   { "items": [{ "name": "我的另一站", "href": "https://example.com", "desc": "随手记" }] }
 *   ```
 */
import { NuxtLink } from '#components'

const props = defineProps({
  data: { type: null, default: () => ({}) },
})

const isPlainObject = value => !!value && typeof value === 'object' && !Array.isArray(value)

/** 安全 URL：只放行 http(s) 与站内绝对路径；javascript: 之类一律视为无链接 */
const safeHref = (value) => {
  const href = String(value || '').trim()
  return /^(?:https?:\/\/|\/)/i.test(href) ? href : ''
}

const d = computed(() => (isPlainObject(props.data) ? props.data : {}))
const items = computed(() => (Array.isArray(d.value.items) ? d.value.items.filter(isPlainObject) : []))
</script>

<template>
  <ul
    v-if="items.length"
    class="page-ui-links my-4 divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-200/80 bg-white/70 not-prose dark:divide-gray-700/70 dark:border-gray-700 dark:bg-neutral-800/60"
  >
    <li v-for="(item, index) in items" :key="index">
      <component
        :is="safeHref(item.href) ? NuxtLink : 'div'"
        :to="safeHref(item.href) || undefined"
        class="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-gray-50 dark:hover:bg-neutral-700/40"
      >
        <UIcon v-if="item.icon" :name="item.icon" class="h-4 w-4 shrink-0 text-[#78943f]"/>
        <span class="min-w-0 flex-1">
          <span class="block truncate text-sm font-medium text-gray-800 dark:text-gray-100">{{ item.name || item.href || '未命名链接' }}</span>
          <span v-if="item.desc" class="mt-0.5 block truncate text-xs text-gray-500 dark:text-gray-400">{{ item.desc }}</span>
        </span>
        <UIcon
          v-if="safeHref(item.href)"
          name="i-carbon-arrow-up-right"
          class="h-3.5 w-3.5 shrink-0 text-gray-400 dark:text-gray-500"
        />
      </component>
    </li>
  </ul>
</template>
