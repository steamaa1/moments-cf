<template>
  <UPopover :ui="{ base: 'w-[min(380px,calc(100vw-2rem))]' }" :popper="{ arrow: true }" mode="click">
    <button type="button" class="flex h-6 w-6 items-center justify-center text-gray-700 transition-transform duration-150 hover:scale-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-700 dark:text-gray-100" title="引用站内动态" aria-label="引用站内动态">
      <UIcon name="i-carbon-quotes" class="h-6 w-6" aria-hidden="true"/>
    </button>
    <template #panel="{ close }">
      <div class="space-y-3 p-4">
        <div>
          <p class="font-semibold text-gray-800 dark:text-gray-100">引用站内动态</p>
          <p class="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400">粘贴 /memo/{id} 或本站动态链接，确认后立即抓取预览，发表后可点击跳转。</p>
        </div>
        <UInput v-model="draft" placeholder="/memo/123 或 https://本站/memo/123" @keyup.enter="confirm(close)"/>
        <p v-if="draft && !valid" class="text-xs text-red-500">请输入本站 /memo/{id} 动态链接</p>
        <div class="flex justify-end gap-2">
          <UButton color="white" @click="clear(close)">清空</UButton>
          <UButton :disabled="Boolean(draft) && !valid" :loading="loading" @click="confirm(close)">确定</UButton>
        </div>
      </div>
    </template>
  </UPopover>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { toast } from 'vue-sonner'
import type { MemoRef } from '~/types'

const props = withDefaults(defineProps<MemoRef>(), { id: 0 })
const emit = defineEmits<{ confirm: [value: MemoRef] }>()
const draft = ref('')
const loading = ref(false)
const parsed = computed(() => {
  try {
    const text = draft.value.trim()
    if (text.startsWith('/')) {
      const m = text.match(/^\/memo\/(\d+)\/?$/)
      return { valid: Boolean(m), id: m ? Number(m[1]) : 0 }
    }
    const url = new URL(text)
    const m = url.pathname.match(/^\/memo\/(\d+)\/?$/)
    return { valid: Boolean(m), id: m ? Number(m[1]) : 0 }
  } catch { return { valid: false, id: 0 } }
})
const valid = computed(() => !draft.value.trim() || parsed.value.valid)
const confirm = async (close: Function) => {
  if (!valid.value || loading.value) return
  const url = draft.value.trim()
  if (!url) { emit('confirm', {} as MemoRef); close(); return }
  loading.value = true
  try {
    const snapshot = await useMyFetch<MemoRef>('/memo/preview', { kind: 'memo', url })
    emit('confirm', snapshot)
  } catch (error) {
    toast.error(error instanceof Error ? error.message : '站内动态抓取失败')
    emit('confirm', { id: parsed.value.id } as MemoRef)
  } finally {
    loading.value = false
    close()
  }
}
const clear = (close: Function) => { draft.value = ''; emit('confirm', {} as MemoRef); close() }
</script>
