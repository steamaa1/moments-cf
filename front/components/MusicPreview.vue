<template>
  <div v-if="mode === 'direct' && url && name" :ref="setContainer" :key="`direct-${url}-${name}`" class="music-preview-direct"></div>
  <meting-js v-else-if="id && server && type && api" :key="`${server}-${type}-${id}-${api}`" :server="server" :type="type" :id="id" :api="api"/>
</template>

<script setup lang="ts">
import type { MusicDTO } from '@/types'
import { onBeforeUnmount, onMounted } from 'vue'

const props = defineProps<MusicDTO>()
let container: HTMLElement | null = null
let player: { destroy?: () => void } | null = null

function setContainer(el: unknown) {
  container = el as HTMLElement | null
}

onMounted(() => {
  if (props.mode !== 'direct' || !container || !props.url || !props.name) return
  const APlayer = (window as unknown as Record<string, any>).APlayer
  if (!APlayer) return
  try {
    player = new APlayer({
      container,
      audio: [{ name: props.name, artist: 'Audio artist', url: props.url, cover: '' }],
      lrcType: props.lrc ? 2 : 0,
      lrc: props.lrc ? { type: 2, text: props.lrc } : undefined,
      listFolded: true,
    })
  } catch (error) {
    console.error('直链音乐播放器初始化失败', error)
    if (container) container.innerHTML = ''
  }
})

onBeforeUnmount(() => {
  if (player && typeof player.destroy === 'function') player.destroy()
  player = null
  container = null
})
</script>

<style scoped>
.music-preview-direct { width: 100%; }
</style>
