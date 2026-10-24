<script setup>
/**
 * 自定义页面组件：视频（kind: video）
 *
 * 数据协议（全部字段容错，空 src 渲染空容器）：
 *   { "src": "/upload/media/2026/10/01/a.mp4", "poster": "封面.jpg", "caption": "说明", "ratio": "16:9" }
 *   - src: 仅接受 http(s):// 或站内绝对路径（/ 开头），其他协议（javascript:/data:）直接丢弃
 *   - poster: 同上规则，可选
 *   - caption: 可选说明文字
 *   - ratio: 16:9（默认）/ 4:3 / 1:1 / 21:9 / 9:16，非法值回退 16:9
 *
 * 示例正文围栏：
 *   ```ui:video
 *   { "src": "/upload/media/2026/10/01/a.mp4", "ratio": "16:9", "caption": "片头" }
 *   ```
 */
const props = defineProps({
  data: { type: null, default: () => ({}) },
})

const isPlainObject = value => !!value && typeof value === 'object' && !Array.isArray(value)

/** 安全 URL：只放行 http(s) 与站内绝对路径；其余（javascript:/data: 等）一律空串 */
const safeUrl = (value) => {
  const url = String(value || '').trim()
  return /^(?:https?:\/\/|\/)/i.test(url) ? url : ''
}

/** 宽高比 → Tailwind 类：字面量写在源码里，JIT 才能扫到 */
const RATIO_CLASS = {
  '16:9': 'aspect-video',
  '4:3': 'aspect-[4/3]',
  '1:1': 'aspect-square',
  '21:9': 'aspect-[21/9]',
  '9:16': 'aspect-[9/16]',
}

const d = computed(() => (isPlainObject(props.data) ? props.data : {}))
const src = computed(() => safeUrl(d.value.src))
const poster = computed(() => safeUrl(d.value.poster))
const caption = computed(() => String(d.value.caption || ''))
const ratioClass = computed(() => RATIO_CLASS[d.value.ratio] || RATIO_CLASS['16:9'])
</script>

<template>
  <figure v-if="src" class="page-ui-video my-4 not-prose">
    <video
      :src="src"
      :poster="poster || undefined"
      controls
      preload="metadata"
      playsinline
      class="w-full rounded-xl bg-black object-contain"
      :class="ratioClass"
    />
    <figcaption v-if="caption" class="mt-2 text-center text-xs text-gray-500 dark:text-gray-400">{{ caption }}</figcaption>
  </figure>
</template>
