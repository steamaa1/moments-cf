<template>
  <iframe
    v-if="url && id"
    :key="`${id}-${theme}`"
    :src="embedUrl"
    class="x-embed-frame"
    title="X 原帖"
    loading="lazy"
    referrerpolicy="strict-origin-when-cross-origin"
    sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
    allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share"
  />
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
.x-embed-frame { display: block; width: 100%; height: 560px; border: 0; background: transparent; }
@media (max-width: 640px) { .x-embed-frame { height: 520px; } }
</style>
