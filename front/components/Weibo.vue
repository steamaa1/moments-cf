<template>
  <UPopover :ui="{ base: 'w-[min(360px,calc(100vw-2rem))]' }" :popper="{ arrow: true }" mode="click">
    <button type="button" class="flex h-6 w-6 items-center justify-center text-[#d84137] transition-transform duration-150 hover:scale-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d84137]" title="嵌入微博" aria-label="嵌入微博">
      <UIcon name="i-carbon-share" class="h-6 w-6"/>
    </button>
    <template #panel="{ close }">
      <div class="space-y-3 p-4">
        <div>
          <p class="font-semibold text-gray-800 dark:text-gray-100">嵌入微博</p>
          <p class="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400">粘贴单条微博链接，将以微博原帖卡片展示。</p>
        </div>
        <UInput v-model="draft" placeholder="https://weibo.com/..." @keyup.enter="confirm(close)"/>
        <p v-if="draft && !valid" class="text-xs text-red-500">仅支持 weibo.com、m.weibo.cn、weibo.cn 的链接</p>
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
import type { WeiboEmbed } from '~/types'

const props = withDefaults(defineProps<WeiboEmbed>(), { url: '' })
const emit = defineEmits<{ confirm: [value: WeiboEmbed] }>()
const draft = ref(props.url || '')
const valid = computed(() => {
  if (!draft.value.trim()) return true
  try { return ['weibo.com', 'www.weibo.com', 'm.weibo.cn', 'weibo.cn', 'www.weibo.cn'].includes(new URL(draft.value.trim()).hostname.toLowerCase()) }
  catch { return false }
})
watch(() => props.url, value => { draft.value = value || '' })
const confirm = (close: Function) => {
  if (!valid.value) return
  emit('confirm', { url: draft.value.trim() })
  close()
}
const clear = (close: Function) => { draft.value = ''; emit('confirm', {}); close() }
</script>
