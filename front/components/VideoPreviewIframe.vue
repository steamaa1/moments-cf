<template>
  <iframe
    v-if="videoUrl"
    :src="videoUrl"
    class="w-full h-[250px] rounded"
    title="Video player iframe"
    frameborder="0"
    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
    referrerpolicy="strict-origin-when-cross-origin"
    allowfullscreen
  >
  </iframe>
</template>

<script setup lang="ts">
const props = defineProps<{ url: string }>()

const videoUrl = computed(() => {
  try {
    const value = String(props.url || '').trim()
    if (!value) return ''
    const url = new URL(value, typeof window !== 'undefined' ? window.location.origin : 'http://localhost')
    if (!['http:', 'https:'].includes(url.protocol)) return ''
    url.searchParams.set('autoplay', '0')
    return url.toString()
  } catch {
    return ''
  }
})
</script>

<style scoped></style>
