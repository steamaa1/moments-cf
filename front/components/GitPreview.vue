<template>
  <article v-if="url" class="git-card rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md dark:border-gray-700 dark:bg-neutral-800" aria-label="Git 仓库快照">
    <header class="flex items-start gap-3">
      <img v-if="avatar" :src="avatar" :alt="`${itemAuthor || author || 'Git'} 的头像`" class="h-10 w-10 shrink-0 rounded-full bg-gray-100 object-cover dark:bg-gray-700" loading="lazy" referrerpolicy="no-referrer"/>
      <div v-else class="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-100"><UIcon name="i-carbon-logo-github" class="h-5 w-5"/></div>
      <div class="min-w-0 flex-1">
        <div class="flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
          <span>{{ providerLabel }}</span><span>·</span><span>{{ kindLabel }}</span>
          <span v-if="itemState" class="rounded-full px-2 py-0.5 text-xs font-medium" :class="stateClass">{{ stateText }}</span>
        </div>
        <a :href="url" target="_blank" rel="noopener noreferrer" class="mt-1 block break-all text-sm font-semibold text-[#576b95] hover:underline dark:text-blue-300">{{ title || url }}</a>
        <p v-if="itemTitle" class="mt-0.5 break-words text-sm font-medium text-gray-800 dark:text-gray-100">{{ itemTitle }}</p>
        <div v-if="itemAuthor || itemDate" class="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{{ [itemAuthor, formatDate(itemDate)].filter(Boolean).join(' · ') }}</div>
      </div>
    </header>
    <p v-if="description" class="mt-3 whitespace-pre-line break-words text-sm leading-6 text-gray-600 dark:text-gray-300">{{ description }}</p>
    <div class="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
      <span v-if="owner && repo">{{ owner }}/{{ repo }}</span><span v-if="language">{{ language }}</span><span v-if="stars !== undefined">★ {{ stars }}</span><span v-if="forks !== undefined">⑂ {{ forks }}</span><span v-if="number">#{{ number }}</span>
    </div>
  </article>
</template>

<script setup lang="ts">
import type { GitEmbed } from '~/types'
const props = defineProps<GitEmbed>()
const providerLabels: Record<string, string> = { github: 'GitHub', gitlab: 'GitLab', gitea: 'Gitea', forgejo: 'Forgejo', codeberg: 'Codeberg', git: 'Git' }
const kindLabels: Record<string, string> = { repo: '仓库', file: '文件', issue: 'Issue', pull: 'Pull Request', commit: 'Commit', release: 'Release' }
const providerLabel = computed(() => providerLabels[props.provider || 'git'] || 'Git')
const kindLabel = computed(() => kindLabels[props.kind || 'repo'] || '链接')
const stateText = computed(() => ({ open: '开放中', closed: '已关闭', merged: '已合并' })[props.itemState || ''] || '')
const stateClass = computed(() => ({
  open: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  closed: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  merged: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
}[props.itemState || ''] || ''))
const formatDate = (value: string) => value ? String(value).slice(0, 10) : ''
</script>
