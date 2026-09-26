<template>
  <div
    v-if="attachment && attachment.path"
    class="flex flex-row gap-2 my-2 bg-[#f7f7f7] dark:bg-[#212121] items-center dark:border-gray-700/50 p-2 border rounded"
  >
    <span
      class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset ring-black/5 dark:ring-white/10"
      :class="format.tone"
    >
      <UIcon :name="format.icon" class="h-5 w-5" aria-hidden="true" />
    </span>
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

// 格式浮块：用几何图案区分文件族，用色相区分子类；刻意避开任何「字母字形」图标
// （carbon 的 zip/ppt/txt 等图标本身就是字母造型，视觉上等同文字，故不再使用）。
// 图标名必须写成字面量，@nuxt/icon 的 clientBundle 依赖扫描源码把它们打进产物。
type FormatMark = { icon: string; tone: string }

const MARKS: Record<string, FormatMark> = {
  pdf: { icon: 'i-heroicons:document-text-solid', tone: 'bg-[#d94a4a]/10 text-[#d94a4a] dark:bg-[#d94a4a]/20' },
  word: { icon: 'i-heroicons:document-text-solid', tone: 'bg-[#3b6fd4]/10 text-[#3b6fd4] dark:bg-[#3b6fd4]/20' },
  sheet: { icon: 'i-heroicons:table-cells-solid', tone: 'bg-[#2e9e63]/10 text-[#2e9e63] dark:bg-[#2e9e63]/20' },
  slide: { icon: 'i-heroicons:presentation-chart-bar-solid', tone: 'bg-[#d97b29]/10 text-[#d97b29] dark:bg-[#d97b29]/20' },
  archive: { icon: 'i-heroicons:archive-box-solid', tone: 'bg-[#c08a2e]/10 text-[#c08a2e] dark:bg-[#c08a2e]/20' },
  text: { icon: 'i-heroicons:document-text-solid', tone: 'bg-[#6b7280]/10 text-[#6b7280] dark:bg-[#6b7280]/25' },
  code: { icon: 'i-heroicons:code-bracket-solid', tone: 'bg-[#8250c8]/10 text-[#8250c8] dark:bg-[#8250c8]/20' },
  book: { icon: 'i-heroicons:book-open-solid', tone: 'bg-[#1f9e8f]/10 text-[#1f9e8f] dark:bg-[#1f9e8f]/20' },
  image: { icon: 'i-heroicons:photo-solid', tone: 'bg-[#1e9bd7]/10 text-[#1e9bd7] dark:bg-[#1e9bd7]/20' },
  audio: { icon: 'i-heroicons:musical-note-solid', tone: 'bg-[#c94f9b]/10 text-[#c94f9b] dark:bg-[#c94f9b]/20' },
  video: { icon: 'i-heroicons:video-camera-solid', tone: 'bg-[#5b62c9]/10 text-[#5b62c9] dark:bg-[#5b62c9]/20' },
  file: { icon: 'i-heroicons:document-solid', tone: 'bg-[#6b7280]/10 text-[#6b7280] dark:bg-[#6b7280]/25' },
}

const EXTENSION_MARKS: Record<string, FormatMark> = {
  pdf: MARKS.pdf,
  doc: MARKS.word, docx: MARKS.word, rtf: MARKS.word, odt: MARKS.word, wps: MARKS.word, pages: MARKS.word,
  xls: MARKS.sheet, xlsx: MARKS.sheet, csv: MARKS.sheet, ods: MARKS.sheet, et: MARKS.sheet,
  ppt: MARKS.slide, pptx: MARKS.slide, odp: MARKS.slide, dps: MARKS.slide, key: MARKS.slide,
  zip: MARKS.archive, rar: MARKS.archive, '7z': MARKS.archive, tar: MARKS.archive,
  gz: MARKS.archive, tgz: MARKS.archive, bz2: MARKS.archive, xz: MARKS.archive, zst: MARKS.archive,
  txt: MARKS.text, md: MARKS.text, markdown: MARKS.text, log: MARKS.text, ini: MARKS.text, conf: MARKS.text,
  json: MARKS.code, xml: MARKS.code, html: MARKS.code, htm: MARKS.code, css: MARKS.code, js: MARKS.code,
  ts: MARKS.code, vue: MARKS.code, py: MARKS.code, go: MARKS.code, java: MARKS.code, rs: MARKS.code,
  sh: MARKS.code, sql: MARKS.code, yml: MARKS.code, yaml: MARKS.code,
  epub: MARKS.book, mobi: MARKS.book, azw3: MARKS.book,
  jpg: MARKS.image, jpeg: MARKS.image, png: MARKS.image, gif: MARKS.image, webp: MARKS.image,
  bmp: MARKS.image, svg: MARKS.image, avif: MARKS.image, heic: MARKS.image, ico: MARKS.image,
  mp3: MARKS.audio, wav: MARKS.audio, flac: MARKS.audio, aac: MARKS.audio, ogg: MARKS.audio,
  m4a: MARKS.audio, wma: MARKS.audio,
  mp4: MARKS.video, mov: MARKS.video, avi: MARKS.video, mkv: MARKS.video, webm: MARKS.video,
  flv: MARKS.video, wmv: MARKS.video,
}

// 扩展名判断不出来时再看 MIME；顺序有意义（先具体后笼统，text/csv、text/html 先被前面的规则命中）
const MIME_MARKS: Array<[RegExp, FormatMark]> = [
  [/^image\//, MARKS.image],
  [/^audio\//, MARKS.audio],
  [/^video\//, MARKS.video],
  [/pdf/, MARKS.pdf],
  [/word|opendocument\.text|rtf/, MARKS.word],
  [/excel|spreadsheet|csv|opendocument\.spreadsheet/, MARKS.sheet],
  [/powerpoint|presentation|opendocument\.presentation/, MARKS.slide],
  [/zip|compressed|gzip|tar|rar|7z/, MARKS.archive],
  [/epub/, MARKS.book],
  [/json|xml|html|javascript|ecmascript/, MARKS.code],
  [/^text\//, MARKS.text],
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

const format = computed<FormatMark>(() => {
  const mapped = EXTENSION_MARKS[extension.value]
  if (mapped) return mapped
  const mime = (props.attachment?.type || '').toLowerCase()
  const fallback = MIME_MARKS.find(([pattern]) => pattern.test(mime))
  return fallback ? fallback[1] : MARKS.file
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
