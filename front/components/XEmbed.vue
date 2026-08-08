<template>
  <UPopover :ui="{ base: 'w-[min(360px,calc(100vw-2rem))]' }" :popper="{ arrow: true }" mode="click">
    <button type="button" class="flex h-6 w-6 items-center justify-center text-gray-800 transition-transform duration-150 hover:scale-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-700 dark:text-gray-100" title="嵌入 X 原帖" aria-label="嵌入 X 原帖">
      <span class="text-[22px] font-bold leading-none" aria-hidden="true">𝕏</span>
    </button>
    <template #panel="{ close }">
      <div class="space-y-3 p-4">
        <div>
          <p class="font-semibold text-gray-800 dark:text-gray-100">嵌入 X 原帖</p>
          <p class="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400">粘贴一条 X（Twitter）状态链接，以原帖卡片展示。</p>
        </div>
        <UInput v-model="draft" placeholder="https://x.com/.../status/..." @keyup.enter="confirm(close)"/>
        <p v-if="draft && !valid" class="text-xs text-red-500">请输入 x.com 或 twitter.com 的单条状态链接</p>
        <div class="flex justify-end gap-2">
          <UButton color="white" @click="clear(close)">清空</UButton>
          <UButton :disabled="Boolean(draft) && !valid" @click="confirm(close)">确定</UButton>
        </div>
      </div>
    </template>
  </UPopover>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { XEmbed } from '~/types'

const props = withDefaults(defineProps<XEmbed>(), { url: '', id: '' })
const emit = defineEmits<{ confirm: [value: XEmbed] }>()
const draft = ref(props.url || '')
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
const confirm = (close: Function) => {
  if (!valid.value) return
  emit('confirm', draft.value.trim() ? { url: draft.value.trim(), id: parsed.value.id } : {})
  close()
}
const clear = (close: Function) => { draft.value = ''; emit('confirm', {}); close() }
</script>
