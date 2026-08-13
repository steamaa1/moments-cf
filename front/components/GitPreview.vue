<template>
  <article v-if="url" class="git-card rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md dark:border-gray-700 dark:bg-neutral-800" aria-label="Git 仓库快照">
    <header class="flex items-start gap-3">
      <div class="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-100"><UIcon name="i-carbon-logo-github" class="h-5 w-5"/></div>
      <div class="min-w-0 flex-1">
        <div class="flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400"><span>{{ providerLabel }}</span><span>·</span><span>{{ kindLabel }}</span></div>
        <a :href="url" target="_blank" rel="noopener noreferrer" class="mt-1 block break-all font-semibold text-[#576b95] hover:underline dark:text-blue-300">{{ title || url }}</a>
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
const providerLabel = computed(() => providerLabels[props.provider] || 'Git')
const kindLabel = computed(() => kindLabels[props.kind || 'repo'] || '链接')
</script>
