<template>
  <iframe v-if="url" class="w-full h-[250px] rounded" :src="bilibiliUrl"
          title="YouTube video player" frameborder="0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>
</template>

<script setup lang="ts">
const props = defineProps<{ url: string }>()
const bilibiliUrl = computed(() => {
  // 处理 iframe 嵌入代码
  const iframeMatch = props.url.match(/src=['"]([^'"]+)['"]/);
  if (iframeMatch && iframeMatch.length > 1) {
    const url = iframeMatch[1];
    return url + "&autoplay=0&high_quality=1&as_wide=1";
  }

  // 处理 AV 号
  const avMatch = props.url.match(/[aA][vV](\d+)/);
  if (avMatch && avMatch.length > 1) {
    return `//player.bilibili.com/player.html?aid=${avMatch[1]}&autoplay=0&high_quality=1&as_wide=1`;
  }

  // 处理 BV 号
  const bvMatch = props.url.match(/([bB][vV][\w]+)/);
  if (bvMatch && bvMatch.length > 1) {
    return `//player.bilibili.com/player.html?bvid=${bvMatch[1]}&autoplay=0&high_quality=1&as_wide=1`;
  }

  return ""
})
</script>

<style scoped>

</style>