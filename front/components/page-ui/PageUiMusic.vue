<script setup>
/**
 * 自定义页面组件：单曲播放器（kind: music）
 *
 * 数据协议（url/name 缺失时渲染空容器）：
 *   { "url": "/upload/media/2026/10/01/a.mp3", "name": "歌曲名", "artist": "歌手", "cover": "/upload/media/cover.jpg" }
 *   - url / name: 必填（缺一不渲染）
 *   - artist / cover: 可选
 *   APlayer 按需加载：挂载时才注入 public 下的 APlayer.min.css 与 APlayer.min.js，
 *   全局 window.APlayer 已存在则跳过注入；组件卸载 destroy 销毁实例防泄漏。
 *
 * 示例正文围栏：
 *   ```ui:music
 *   { "url": "/upload/media/2026/10/01/a.mp3", "name": "晴天", "artist": "周杰伦" }
 *   ```
 */
import { onBeforeUnmount, onMounted } from 'vue'

const props = defineProps({
  data: { type: null, default: () => ({}) },
})

const container = ref(null)
let player = null

function injectStyle(href) {
  if (document.querySelector(`link[href="${href}"]`)) return
  const el = document.createElement('link')
  el.rel = 'stylesheet'
  el.href = href
  document.head.appendChild(el)
}

function injectScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve()
      return
    }
    const el = document.createElement('script')
    el.src = src
    el.async = true
    el.onload = () => resolve()
    el.onerror = () => reject(new Error(`加载失败: ${src}`))
    document.head.appendChild(el)
  })
}

onMounted(async () => {
  if (!container.value) return
  const audio = props.data || {}
  if (!audio.url || !audio.name) return
  try {
    injectStyle('/css/APlayer.min.css')
    await injectScript('/js/APlayer.min.js')
  } catch {
    return
  }
  const APlayer = window.APlayer
  if (!APlayer || player) return
  try {
    player = new APlayer({
      container: container.value,
      audio: [{ name: audio.name, artist: audio.artist || 'Audio artist', url: audio.url, cover: audio.cover || '' }],
      lrcType: 0,
      listFolded: true,
    })
  } catch (error) {
    console.error('音乐播放器初始化失败', error)
    if (container.value) container.value.innerHTML = ''
  }
})

onBeforeUnmount(() => {
  if (player && typeof player.destroy === 'function') player.destroy()
  player = null
})
</script>

<template>
  <div v-if="data && data.url && data.name" ref="container" class="page-ui-music my-4 not-prose"/>
</template>
