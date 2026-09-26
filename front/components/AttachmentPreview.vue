<template>
  <div
    v-if="attachment && attachment.path"
    class="flex flex-row gap-2 my-2 bg-[#f7f7f7] dark:bg-[#212121] items-center dark:border-gray-700/50 p-2 border rounded"
  >
    <UIcon :name="icon" class="w-8 h-8 shrink-0 text-gray-600 dark:text-gray-300" aria-hidden="true" />
    <a
      :href="downloadUrl"
      class="flex-1 min-w-0 truncate text-[#576b95] transition-colors duration-150 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#576b95] motion-reduce:transition-none"
      :title="attachment.name"
      download
      target="_blank"
      rel="noopener noreferrer"
      >{{ attachment.name }}</a
    >
    <span class="shrink-0 text-xs text-gray-500 dark:text-gray-400">{{ formatSize(attachment.size) }}</span>
    <UButton
      size="xs"
      color="white"
      icon="i-carbon-download"
      :to="downloadUrl"
      download
      target="_blank"
      rel="noopener noreferrer"
      aria-label="下载附件"
      >下载</UButton
    >
  </div>
</template>

<script setup lang="ts">
import type { AttachmentVO } from '~/types'

// 附件展示卡片：编辑态（UploadAttachment）与只读详情页（Memo.vue）共用，
// 只读渲染，不依赖编辑态状态、不发请求、不改 props。
// 注意：模板根节点必须是单一元素，否则父组件传入的 class 无法透传（fragment 根会丢属性）。
const props = defineProps<{
  attachment: AttachmentVO
}>()

// 扩展名 → carbon 图标（图标名必须是字面量，@nuxt/icon 的 clientBundle 扫描源码才能打进包里）
const EXTENSION_ICONS: Record<string, string> = {
  pdf: 'i-carbon-document-pdf',
  doc: 'i-carbon-document-word-processor',
  docx: 'i-carbon-document-word-processor',
  rtf: 'i-carbon-document-word-processor',
  odt: 'i-carbon-document-word-processor',
  wps: 'i-carbon-document-word-processor',
  pages: 'i-carbon-document-word-processor',
  xls: 'i-carbon-table',
  xlsx: 'i-carbon-table',
  csv: 'i-carbon-table',
  ods: 'i-carbon-table',
  et: 'i-carbon-table',
  ppt: 'i-carbon-ppt',
  pptx: 'i-carbon-ppt',
  odp: 'i-carbon-ppt',
  dps: 'i-carbon-ppt',
  key: 'i-carbon-ppt',
  txt: 'i-carbon-txt',
  md: 'i-carbon-txt',
  markdown: 'i-carbon-txt',
  log: 'i-carbon-txt',
  json: 'i-carbon-code',
  xml: 'i-carbon-code',
  html: 'i-carbon-code',
  htm: 'i-carbon-code',
  css: 'i-carbon-code',
  js: 'i-carbon-code',
  ts: 'i-carbon-code',
  vue: 'i-carbon-code',
  py: 'i-carbon-code',
  go: 'i-carbon-code',
  java: 'i-carbon-code',
  rs: 'i-carbon-code',
  sh: 'i-carbon-code',
  sql: 'i-carbon-code',
  yml: 'i-carbon-code',
  yaml: 'i-carbon-code',
  ini: 'i-carbon-code',
  conf: 'i-carbon-code',
  zip: 'i-carbon-zip',
  rar: 'i-carbon-zip',
  '7z': 'i-carbon-zip',
  tar: 'i-carbon-zip',
  gz: 'i-carbon-zip',
  tgz: 'i-carbon-zip',
  bz2: 'i-carbon-zip',
  xz: 'i-carbon-zip',
  zst: 'i-carbon-zip',
  jpg: 'i-carbon-image',
  jpeg: 'i-carbon-image',
  png: 'i-carbon-image',
  gif: 'i-carbon-image',
  webp: 'i-carbon-image',
  bmp: 'i-carbon-image',
  svg: 'i-carbon-image',
  avif: 'i-carbon-image',
  heic: 'i-carbon-image',
  ico: 'i-carbon-image',
  mp3: 'i-carbon-music',
  wav: 'i-carbon-music',
  flac: 'i-carbon-music',
  aac: 'i-carbon-music',
  ogg: 'i-carbon-music',
  m4a: 'i-carbon-music',
  wma: 'i-carbon-music',
  mp4: 'i-carbon-video',
  mov: 'i-carbon-video',
  avi: 'i-carbon-video',
  mkv: 'i-carbon-video',
  webm: 'i-carbon-video',
  flv: 'i-carbon-video',
  wmv: 'i-carbon-video',
}

// 扩展名判断不出来时再看 MIME；顺序有意义（先具体后笼统，text/csv、text/html 先被前面的规则命中）
const MIME_PATTERNS: Array<[RegExp, string]> = [
  [/^image\//, 'i-carbon-image'],
  [/^audio\//, 'i-carbon-music'],
  [/^video\//, 'i-carbon-video'],
  [/pdf/, 'i-carbon-document-pdf'],
  [/word|opendocument\.text|rtf/, 'i-carbon-document-word-processor'],
  [/excel|spreadsheet|csv|opendocument\.spreadsheet/, 'i-carbon-table'],
  [/powerpoint|presentation|opendocument\.presentation/, 'i-carbon-ppt'],
  [/zip|compressed|gzip|tar|rar|7z/, 'i-carbon-zip'],
  [/json|xml|html|javascript|ecmascript/, 'i-carbon-code'],
  [/^text\//, 'i-carbon-txt'],
]

// 优先按文件名取扩展名，name 缺失或没有扩展名时退回 path
const extension = computed(() => {
  for (const candidate of [props.attachment?.name, props.attachment?.path]) {
    const value = (candidate || '').toLowerCase()
    const dot = value.lastIndexOf('.')
    if (dot > -1 && dot < value.length - 1) return value.slice(dot + 1)
  }
  return ''
})

const icon = computed(() => {
  const mapped = EXTENSION_ICONS[extension.value]
  if (mapped) return mapped
  const mime = (props.attachment?.type || '').toLowerCase()
  const fallback = MIME_PATTERNS.find(([pattern]) => pattern.test(mime))
  return fallback ? fallback[1] : 'i-carbon-document'
})

// 下载约定：带 download=1 时服务端返回 Content-Disposition: attachment
const downloadUrl = computed(() => `${props.attachment.path}?download=1`)

// 大小自适应 B / KB / MB，保留 1 位小数
const formatSize = (size: number) => {
  const bytes = Number(size)
  if (!Number.isFinite(bytes) || bytes <= 0) return '0.0 B'
  if (bytes < 1024) return `${bytes.toFixed(1)} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
</script>
