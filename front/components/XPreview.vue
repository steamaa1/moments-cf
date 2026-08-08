<template>
  <article v-if="url && id" class="x-card" aria-label="嵌入的 X 原帖">
    <div class="x-card__bar">
      <div class="flex min-w-0 items-center gap-2"><span class="text-lg font-bold leading-none" aria-hidden="true">𝕏</span><span class="font-semibold">X 原帖</span></div>
      <a :href="url" target="_blank" rel="noopener noreferrer" class="x-card__origin">在 X 中查看 <UIcon name="i-carbon-launch" class="h-3.5 w-3.5"/></a>
    </div>
    <iframe
      :key="`${id}-${theme}`"
      :src="embedUrl"
      class="x-card__frame"
      title="X 原帖嵌入"
      loading="lazy"
      referrerpolicy="strict-origin-when-cross-origin"
      sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
      allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share"
    />
    <p class="x-card__hint">若原帖无法加载，可点击“在 X 中查看”。</p>
  </article>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { XEmbed } from '~/types'

const props = defineProps<XEmbed>()
const colorMode = useColorMode()
const theme = computed(() => colorMode.value === 'dark' ? 'dark' : 'light')
const embedUrl = computed(() => `https://platform.twitter.com/embed/Tweet.html?id=${encodeURIComponent(props.id || '')}&lang=zh-cn&theme=${theme.value}&dnt=true`)
</script>

<style scoped>
.x-card { overflow: hidden; border: 1px solid #e4e4e7; border-radius: 12px; background: #fff; box-shadow: 0 1px 2px rgb(0 0 0 / .04); }
.dark .x-card { border-color: #3f3f46; background: #18181b; }
.x-card__bar { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 14px; color: #27272a; font-size: 14px; }
.dark .x-card__bar { color: #f4f4f5; }
.x-card__origin { display: inline-flex; flex: none; align-items: center; gap: 3px; color: #576b95; font-size: 12px; text-decoration: none; }
.x-card__origin:hover { text-decoration: underline; }
.x-card__origin:focus-visible { outline: 2px solid #576b95; outline-offset: 3px; border-radius: 4px; }
.x-card__frame { display: block; width: 100%; height: 560px; border: 0; background: #fff; }
.dark .x-card__frame { background: #18181b; }
.x-card__hint { margin: 0; padding: 8px 14px; border-top: 1px solid #f4f4f5; color: #71717a; font-size: 12px; line-height: 1.5; }
.dark .x-card__hint { border-color: #3f3f46; color: #a1a1aa; }
@media (max-width: 640px) { .x-card__frame { height: 520px; } }
@media (prefers-reduced-motion: reduce) { .x-card * { transition: none !important; } }
</style>
