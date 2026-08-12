<template>
  <div v-if="mode === 'direct' && url && name" :ref="setContainer" :key="`direct-${url}-${name}`" class="music-preview-direct"></div>
  <meting-js v-else-if="id && server && type && api" :key="`${server}-${type}-${id}-${api}`" :server="server" :type="type" :id="id" :api="api"/>
</template>

<script setup lang="ts">
import type { MusicDTO } from '@/types'
import { onBeforeUnmount, onMounted } from 'vue'
import { loadMusicAssets } from '~/utils'

const props = defineProps<MusicDTO>()
let container: HTMLElement | null = null
let player: { destroy?: () => void } | null = null

function setContainer(el: unknown) {
  container = el as HTMLElement | null
}

onMounted(async () => {
  if (props.mode !== 'direct' || !container || !props.url || !props.name) return
  // APlayer/Meting 按需加载：仅音乐组件挂载时注入
  try { await loadMusicAssets() } catch { return }
  const APlayer = (window as unknown as Record<string, any>).APlayer
  if (!APlayer) return
  try {
    player = new APlayer({
      container,
      audio: [{ name: props.name, artist: props.artist || 'Audio artist', url: props.url, cover: props.cover || '', lrc: props.lrc || '' }],
      lrcType: props.lrc ? 2 : 0,
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
.music-preview-direct { width: 100%; max-height: 240px; overflow-y: auto; }
</style>
