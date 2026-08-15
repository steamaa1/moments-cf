<template>
  <div v-if="mode === 'direct' && url && name" :ref="setContainer" :key="`direct-${url}-${name}`" class="music-preview-direct"></div>
  <meting-js v-else-if="metingReady && id && server && type && api" :key="`${server}-${type}-${id}-${api}`" :server="server" :type="type" :id="id" :api="api"/>
  <div v-else-if="id && server && type && api" class="music-preview-loading text-xs text-gray-400 py-2 text-center">音乐加载中…</div>
</template>

<script setup lang="ts">
import type { MusicDTO } from '@/types'
import { onBeforeUnmount, onMounted } from 'vue'
import { loadMusicAssets } from '~/utils'

const props = defineProps<MusicDTO>()
let container: HTMLElement | null = null
let player: { destroy?: () => void } | null = null
// meting-js 依赖全局 Meting 脚本，必须等脚本注入完成后才能渲染标签
const metingReady = ref(false)

function setContainer(el: unknown) {
  container = el as HTMLElement | null
}

onMounted(async () => {
  if (props.mode === 'direct') {
    // 直链模式：APlayer 按需加载后初始化播放器
    if (!container || !props.url || !props.name) return
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
    return
  }
  // Meting 模式（在线音乐）：注入脚本后置 ready，触发 <meting-js> 渲染
  if (props.id && props.server && props.type && props.api) {
    try { await loadMusicAssets() } catch { return }
    metingReady.value = true
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
