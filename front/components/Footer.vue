<template>
  <div class="footer p-4 flex justify-center items-center text-xs">
    <div class="flex flex-col gap-1 items-center">
      <NuxtLink
        v-if="!starsLoadFailed"
        to="https://github.com/kingwrcy/moments"
        target="_blank"
      >
        <img
          src="https://img.shields.io/github/stars/kingwrcy/moments"
          class="h-6 inline-block mr-1"
          alt="github"
          @error="onStarsLoadFailed"
        />
      </NuxtLink>
      <div
        v-if="sysConfig.beiAnNo"
        class="beian-html my-2 text-gray-500 text-center"
        v-html="sysConfig.beiAnNo"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import type { SysConfigVO } from "~/types";

const sysConfig = useState<SysConfigVO>("sysConfig");

const starsLoadFailed = ref<boolean>(false);
const onStarsLoadFailed = () => {
  starsLoadFailed.value = true;
};
</script>

<style scoped>
.beian-html :deep(a) { color: inherit; text-decoration: underline; text-underline-offset: 2px; }
.beian-html :deep(img) { display: inline-block; max-height: 20px; width: auto; vertical-align: middle; }
</style>
