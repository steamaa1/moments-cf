<template>
  <UPopover :ui="{ base: 'w-[min(380px,calc(100vw-2rem))]' }" :popper="{ arrow: true }" mode="click">
    <button type="button" class="flex h-6 w-6 items-center justify-center text-gray-700 transition-transform duration-150 hover:scale-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-700 dark:text-gray-100" title="嵌入 Git 仓库" aria-label="嵌入 Git 仓库">
      <UIcon name="i-carbon-logo-github" class="h-6 w-6" aria-hidden="true"/>
    </button>
    <template #panel="{ close }">
      <div class="space-y-3 p-4">
        <div>
          <p class="font-semibold text-gray-800 dark:text-gray-100">嵌入 Git 仓库</p>
          <p class="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400">支持 GitHub、GitLab、Gitea、Forgejo、Codeberg 的仓库、文件、Issue、PR、Commit 和 Release 链接。</p>
        </div>
        <UInput v-model="draft" placeholder="https://github.com/user/repo" @keyup.enter="confirm(close)"/>
        <p v-if="draft && !valid" class="text-xs text-red-500">请输入公开 Git 托管平台的有效链接</p>
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
import type { GitEmbed as GitEmbedValue } from '~/types'

const props = withDefaults(defineProps<GitEmbedValue>(), { url: '', provider: '', kind: 'repo' })
const emit = defineEmits<{ confirm: [value: GitEmbedValue] }>()
const draft = ref(props.url || '')
const parsed = computed(() => {
  try {
    const url = new URL(draft.value.trim())
    const parts = url.pathname.split('/').filter(Boolean)
    const host = url.hostname.toLowerCase()
    const supported = host === 'github.com' || host === 'gitlab.com' || host === 'codeberg.org' || /(^|\.)((gitea|forgejo)\.)/.test(host)
    const generic = parts.length >= 2 && !['api', 'explore', 'user', 'users', 'org'].includes(parts[0].toLowerCase())
    return { valid: (supported || generic) && parts.length >= 2 && (url.protocol === 'https:' || url.protocol === 'http:'), host }
  } catch { return { valid: false, host: '' } }
})
const valid = computed(() => !draft.value.trim() || parsed.value.valid)
watch(() => props.url, value => { draft.value = value || '' })
const confirm = (close: Function) => {
  if (!valid.value) return
  emit('confirm', draft.value.trim() ? { url: draft.value.trim() } : {})
  close()
}
const clear = (close: Function) => { draft.value = ''; emit('confirm', {}); close() }
</script>
