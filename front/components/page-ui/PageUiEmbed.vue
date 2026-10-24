<script setup>
/**
 * 自定义页面组件：HTML 嵌入（kind: embed）
 *
 * 数据协议（字段容错，空 html 渲染空容器）：
 *   { "html": "<iframe src=\"https://example.com\"></iframe>" }
 *   - html: 原始 HTML 字符串，经 v-html 插入
 *
 * 安全边界（必须理解）：这是管理员给自己站点用的「原文块」，等价于在 markdown 正文里
 * 直接写内联 HTML（PageRenderer 的 markdown-it 本来就 html: true）。custom_pages 只有
 * 管理员能写，故不新增攻击面；但 <script> 不会执行（innerHTML 语义），事件属性
 * （如 onerror）会。不要把自定义页面的编辑权限开放给非管理员。
 *
 * 示例正文围栏：
 *   ```ui:embed
 *   { "html": "<div class=\"p-4\">任意 HTML</div>" }
 *   ```
 */
const props = defineProps({
  data: { type: null, default: () => ({}) },
})

const isPlainObject = value => !!value && typeof value === 'object' && !Array.isArray(value)

const d = computed(() => (isPlainObject(props.data) ? props.data : {}))
const html = computed(() => String(d.value.html || ''))
</script>

<template>
  <div v-if="html" class="page-ui-embed my-4 not-prose" v-html="html"/>
</template>
