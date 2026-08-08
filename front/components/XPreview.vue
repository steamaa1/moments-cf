<template>
  <div ref="host" class="x-embed-host" :class="{ 'x-embed-host--pending': loading || failed }">
    <div ref="mount"></div>
    <div v-if="loading" class="x-embed-placeholder" role="status" aria-live="polite">
      <UIcon name="i-carbon-renew" class="h-5 w-5 animate-spin text-gray-400" aria-hidden="true"/>
      <span>正在加载 X 原帖…</span>
    </div>
    <div v-else-if="failed" class="x-embed-placeholder" role="status" aria-live="polite">X 原帖加载失败</div>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { XEmbed } from '~/types'

const props = defineProps<XEmbed>()
type XWidgets = { widgets?: { createTweet: (id: string, element: HTMLElement, options: Record<string, unknown>) => Promise<HTMLElement | null> } }
const host = ref<HTMLElement | null>(null)
const mount = ref<HTMLElement | null>(null)
const colorMode = useColorMode()
const loading = ref(false)
const failed = ref(false)
let observer: IntersectionObserver | null = null
let loaded = false
let widgetsPromise: Promise<XWidgets> | null = null

function loadXWidgets(): Promise<XWidgets> {
  const current = window as Window & { twttr?: XWidgets }
  if (current.twttr?.widgets?.createTweet) return Promise.resolve(current.twttr)
  if (widgetsPromise) return widgetsPromise
  widgetsPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.id = 'x-widgets-js'
    script.src = 'https://platform.twitter.com/widgets.js'
    script.async = true
    script.onload = () => current.twttr?.widgets?.createTweet ? resolve(current.twttr) : reject(new Error('X Widget 初始化失败'))
    script.onerror = () => reject(new Error('X Widget 脚本加载失败'))
    document.head.appendChild(script)
  })
  return widgetsPromise
}
async function loadEmbed() {
  if (loaded || !mount.value || !props.id) return
  loaded = true
  loading.value = true
  failed.value = false
  try {
    const twttr = await loadXWidgets()
    await twttr.widgets!.createTweet(props.id, mount.value, {
      theme: colorMode.value === 'dark' ? 'dark' : 'light',
      lang: 'zh-cn',
      dnt: true,
      align: 'center',
    })
  } catch (error) {
    console.error('X 原帖加载失败', error)
    failed.value = true
  } finally {
    loading.value = false
  }
}
function observe() {
  if (!host.value) return
  if (!('IntersectionObserver' in window)) { loadEmbed(); return }
  observer = new IntersectionObserver((entries) => {
    if (entries.some(entry => entry.isIntersecting)) {
      observer?.disconnect()
      loadEmbed()
    }
  }, { rootMargin: '300px 0px' })
  observer.observe(host.value)
}
function reset() {
  observer?.disconnect()
  loaded = false
  loading.value = false
  failed.value = false
  if (mount.value) mount.value.replaceChildren()
  observe()
}
onMounted(observe)
onBeforeUnmount(() => observer?.disconnect())
watch(() => `${props.id}|${colorMode.value}`, reset)
</script>

<style scoped>
.x-embed-host { width: 100%; }
.x-embed-host--pending { min-height: 112px; }
.x-embed-placeholder { display: flex; min-height: 112px; align-items: center; justify-content: center; gap: 8px; border-radius: 12px; background: rgb(161 161 170 / .08); color: #71717a; font-size: 13px; }
</style>
