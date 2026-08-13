<template>
  <NuxtLink v-if="id" :to="url || `/memo/${id}`" class="memo-ref-card block rounded-xl border border-gray-200 bg-white p-3 shadow-sm transition-shadow hover:shadow-md dark:border-gray-700 dark:bg-neutral-800" aria-label="站内动态引用">
    <header class="flex items-center gap-2">
      <img v-if="authorAvatar" :src="authorAvatar" class="h-8 w-8 shrink-0 rounded-full bg-gray-100 object-cover dark:bg-gray-700" :alt="`${authorName || '用户'} 的头像`" loading="lazy" referrerpolicy="no-referrer"/>
      <div v-else class="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-200"><UIcon name="i-carbon-user" class="h-4 w-4"/></div>
      <div class="min-w-0 flex-1 leading-tight">
        <span class="block truncate text-sm font-semibold text-gray-800 dark:text-gray-100">{{ authorName || '站内用户' }}</span>
        <time v-if="createdAt" class="text-xs text-gray-500 dark:text-gray-400">{{ formatDate(createdAt) }}</time>
      </div>
    </header>
    <p v-if="content" class="mt-2 line-clamp-3 break-words text-sm leading-6 text-gray-600 dark:text-gray-300">{{ content }}</p>
    <div v-if="imgs && imgs.length" class="mt-2 grid grid-cols-4 gap-1">
      <img v-for="(img, index) in imgs" :key="`${img}-${index}`" :src="img" class="h-16 w-full rounded object-cover" loading="lazy" referrerpolicy="no-referrer" alt=""/>
    </div>
    <div class="mt-2 text-xs font-medium text-[#576b95] dark:text-blue-300">查看动态 →</div>
  </NuxtLink>
</template>

<script setup lang="ts">
import type { MemoRef } from '~/types'
const props = defineProps<MemoRef>()
const formatDate = (value?: string) => value ? String(value).slice(0, 10) : ''
</script>
