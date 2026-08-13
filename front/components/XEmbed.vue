<template>
  <UPopover :ui="{ base: 'w-[min(360px,calc(100vw-2rem))]' }" :popper="{ arrow: true }" mode="click">
    <button type="button" class="flex h-6 w-6 items-center justify-center text-gray-800 transition-transform duration-150 hover:scale-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-700 dark:text-gray-100" title="嵌入 X 原帖" aria-label="嵌入 X 原帖">
      <span class="text-[22px] font-bold leading-none" aria-hidden="true">𝕏</span>
    </button>
    <template #panel="{ close }">
      <div class="space-y-3 p-4">
        <div>
          <p class="font-semibold text-gray-800 dark:text-gray-100">嵌入 X 原帖</p>
          <p class="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400">粘贴一条 X（Twitter）状态链接，确认后立即抓取预览。</p>
        </div>
        <UInput v-model="draft" placeholder="https://x.com/.../status/..." @keyup.enter="confirm(close)"/>
        <p v-if="draft && !valid" class="text-xs text-red-500">请输入 x.com 或 twitter.com 的单条状态链接</p>
        <div class="flex justify-end gap-2">
          <UButton color="white" @click="clear(close)">清空</UButton>
          <UButton :disabled="Boolean(draft) && !valid" :loading="loading" @click="confirm(close)">确定</UButton>
        </div>
      </div>
    </template>
  </UPopover>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { toast } from 'vue-sonner'
import type { XEmbed } from '~/types'

const props = withDefaults(defineProps<XEmbed>(), { url: '', id: '' })
const emit = defineEmits<{ confirm: [value: XEmbed] }>()
const draft = ref(props.url || '')
const loading = ref(false)
const parsed = computed(() => {
  try {
    const url = new URL(draft.value.trim())
    const host = url.hostname.toLowerCase()
    const id = url.pathname.match(/\/status(?:es)?\/(\d{5,30})(?:\/|$)/)?.[1] || ''
    return { valid: ['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com', 'mobile.twitter.com'].includes(host) && Boolean(id), id }
  } catch { return { valid: false, id: '' } }
})
const valid = computed(() => !draft.value.trim() || parsed.value.valid)
watch(() => props.url, value => { draft.value = value || '' })
const confirm = async (close: Function) => {
  if (!valid.value || loading.value) return
  const url = draft.value.trim()
  if (!url) { emit('confirm', {}); close(); return }
  loading.value = true
  try {
    const snapshot = await useMyFetch<XEmbed>('/memo/preview', { kind: 'x', url })
    emit('confirm', snapshot)
  } catch (error) {
    toast.error(error instanceof Error ? error.message : 'X 原帖抓取失败')
    emit('confirm', { url, id: parsed.value.id })
  } finally {
    loading.value = false
    close()
  }
}
const clear = (close: Function) => { draft.value = ''; emit('confirm', {}); close() }
</script>
