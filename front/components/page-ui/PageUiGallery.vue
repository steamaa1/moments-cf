<script setup>
/**
 * 自定义页面组件：图片网格 + 灯箱（kind: gallery）
 *
 * 数据协议（全部字段容错，空数据渲染空容器）：
 *   { "items": [{ "src": "/upload/media/2026/10/01/a.jpg", "caption": "说明文字" }] }
 *   - items: 数组，缺省/非数组或 src 为空的项跳过
 *   - item.src: 图片地址（站内 /upload/ 相对路径或外链）
 *   - item.caption: 可选说明文字
 *   点击打开灯箱：外层包 MyFancyBox，它会把网格里的 a[href] 自动绑定为预览触发器。
 *
 * 示例正文围栏：
 *   ```ui:gallery
 *   { "items": [{ "src": "/upload/media/2026/10/01/a.jpg", "caption": "日出" }] }
 *   ```
 */
const props = defineProps({
  data: { type: null, default: () => ({}) },
})

const items = computed(() => (Array.isArray(props.data && props.data.items) ? props.data.items.filter(item => item && item.src) : []))
</script>

<template>
  <MyFancyBox v-if="items.length" class="my-4 not-prose">
    <div class="page-ui-gallery grid grid-cols-2 gap-3 sm:grid-cols-3">
      <a v-for="(item, index) in items" :key="index" :href="item.src" class="group block overflow-hidden rounded-xl border border-gray-200/60">
        <img :src="item.src" :alt="item.caption || ''" loading="lazy" class="aspect-square w-full object-cover transition-transform duration-300 group-hover:scale-105">
        <p v-if="item.caption" class="truncate px-2 py-1.5 text-xs text-gray-500">{{ item.caption }}</p>
      </a>
    </div>
  </MyFancyBox>
</template>

<style scoped>
.page-ui-gallery { min-width: 0; }
.dark .page-ui-gallery a { border-color: rgba(255, 255, 255, .1); }
.dark .page-ui-gallery .text-gray-500 { color: #a1a1aa; }
</style>
