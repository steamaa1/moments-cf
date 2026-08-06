<template>
  <meting-js
    v-if="mode === 'direct' && url && name"
    :key="`direct-${url}-${name}`"
    :url="url"
    :name="name"
    type="auto"
    fixed="false"
    list-folded="true"
  >{{ lrc || '' }}</meting-js>
  <meting-js v-else-if="id && server && type && api" :key="`${server}-${type}-${id}-${api}`" :server="server" :type="type" :id="id" :api="api"/>
</template>

<script setup lang="ts">
import type { MusicDTO } from '@/types'
defineProps<MusicDTO>()
</script>
