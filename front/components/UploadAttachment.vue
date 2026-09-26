<template>
  <UPopover :popper="{ arrow: true }" mode="click">
    <UIcon name="i-carbon-attachment" class="cursor-pointer w-6 h-6" title="上传附件" aria-label="上传附件" />
    <template #panel>
      <div class="p-4 flex flex-col gap-2 w-[min(20rem,80vw)] max-h-[420px] overflow-y-auto">
        <div class="text-xs text-gray-400">上传附件</div>
        <UInput ref="fileInput" type="file" size="sm" multiple :accept="ACCEPT" @change="pickFiles" />
        <p class="text-xs text-gray-400">单个不超过 {{ maxSize }}MB，一次最多 {{ maxCount }} 个</p>
        <p class="text-xs text-gray-400">支持文档、压缩包与纯文本；图片请用左侧图片入口</p>

        <template v-if="uploading">
          <p class="text-xs text-gray-400">正在上传…</p>
          <UProgress :value="progress" indicator />
        </template>

        <template v-if="attachments.length">
          <div class="text-xs text-gray-400">已添加附件（{{ attachments.length }}）</div>
          <div v-for="item in attachments" :key="item.path" class="flex items-center gap-2">
            <AttachmentPreview :attachment="item" class="flex-1 min-w-0" />
            <UButton
              size="xs"
              color="red"
              variant="soft"
              icon="i-carbon-close"
              title="移除附件"
              aria-label="移除附件"
              @click="removeAttachment(item.path)"
            />
          </div>
        </template>
      </div>
    </template>
  </UPopover>
</template>

<script setup lang="ts">
import { toast } from 'vue-sonner'
import { uploadAttachments } from '~/utils/upload'
import type { AttachmentVO, SysConfigVO } from '~/types'

// 父组件用 v-model:attachments 绑定（发表面板），这里只维护附件元数据数组
const attachments = defineModel<AttachmentVO[]>('attachments', { default: () => [] })

const sysConfig = useState<SysConfigVO>('sysConfig')

// 与 worker 的 ALLOWED_ATTACHMENT_TYPES 保持一致：选择器只做过滤提示，服务端仍是权威
const ACCEPT = [
  '.pdf', '.doc', '.docx', '.odt', '.rtf', '.wps', '.pages',
  '.xls', '.xlsx', '.ods', '.csv', '.tsv', '.et', '.numbers',
  '.ppt', '.pptx', '.odp', '.dps', '.key',
  '.txt', '.md', '.log', '.json', '.yml', '.yaml', '.ini', '.conf', '.toml', '.properties', '.tex',
  '.zip', '.7z', '.rar', '.tar', '.gz', '.tgz', '.bz2', '.xz', '.zst',
  '.epub', '.mobi', '.azw', '.azw3',
].join(',')

// 限额来自系统配置，缺失或非法时回退到默认值（单文件 10MB、单次 5 个）
const positiveInt = (value: unknown, fallback: number) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 1 ? Math.floor(parsed) : fallback
}
const maxSize = computed(() => positiveInt(sysConfig.value?.attachmentMaxSize, 10))
const maxCount = computed(() => positiveInt(sysConfig.value?.attachmentMaxCount, 5))

const uploading = ref(false)
const progress = ref(0)

// UInput 的 type=file 不会清空原生 input 的 value，重复选择同一个文件不会再次触发 change，
// 因此每次读取完文件就手动清空（Nuxt UI 通过 expose 暴露了内部 input 元素）
type FileInputExposed = { input?: HTMLInputElement | { value?: HTMLInputElement } }
const fileInput = ref<FileInputExposed | null>(null)
const resetFileInput = () => {
  const exposed = fileInput.value?.input
  const node = exposed instanceof HTMLInputElement ? exposed : exposed?.value
  if (node instanceof HTMLInputElement) node.value = ''
}

const removeAttachment = (path: string) => {
  // 仅从本地数组移除，不请求服务端（已上传的文件由服务端回收策略处理）
  attachments.value = attachments.value.filter(item => item.path !== path)
}

const pickFiles = async (fileList: FileList | null) => {
  const files = Array.from(fileList || [])
  resetFileInput()
  if (!files.length) return

  // 客户端预校验：服务端仍是权威，这里只是为了尽早给出明确提示
  if (files.length > maxCount.value) {
    toast.error(`一次最多上传 ${maxCount.value} 个附件，已选择 ${files.length} 个`)
    return
  }
  const oversize = files.find(file => file.size > maxSize.value * 1024 * 1024)
  if (oversize) {
    toast.error(`「${oversize.name}」超过单个附件 ${maxSize.value}MB 的上限`)
    return
  }

  uploading.value = true
  progress.value = 0
  try {
    const result = await uploadAttachments(files, ratio => {
      progress.value = Math.min(100, Math.max(0, Math.round(ratio * 100)))
    })
    // 按 path 去重后再追加，避免重复的返回项重复入列
    const known = new Set(attachments.value.map(item => item.path))
    const fresh: AttachmentVO[] = []
    for (const item of result) {
      if (!item?.path || known.has(item.path)) continue
      known.add(item.path)
      fresh.push(item)
    }
    if (fresh.length) attachments.value = [...attachments.value, ...fresh]
    toast.success('附件上传成功')
  } catch (error) {
    toast.error(error instanceof Error && error.message ? error.message : '附件上传失败')
  } finally {
    uploading.value = false
    progress.value = 0
  }
}
</script>
