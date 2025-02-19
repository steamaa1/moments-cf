<template>
  <iframe v-if="url" class="w-full h-[250px] rounded" :src="bilibiliUrl"
          title="YouTube video player" frameborder="0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>
</template>

<script setup lang="ts">
const props = defineProps<{ url: string }>()
const bilibiliUrl = computed(() => {
  return props.url
})
</script>

<style scoped>

</style>