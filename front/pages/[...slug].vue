<template>
  <Header v-if="currentUser" v-bind:user="currentUser"/>
  <div class="flex flex-col items-center justify-center gap-3 py-24">
    <p class="text-7xl font-bold text-gray-300 dark:text-gray-600">404</p>
    <p class="text-gray-500">页面不存在</p>
    <UButton to="/" color="white">返回首页</UButton>
  </div>
</template>

<script setup lang="ts">
import type { UserVO } from "~/types";

const route = useRoute()
const currentUser = useState<UserVO | null>("userinfo")

// sitemap/rss/robots 落入 SPA（浏览器缓存旧 index.html 或站内跳转）时，
// 强制整页刷新交给 Worker 返回正确内容，避免前端 “Page not found” 报错
const raw = String(route.path || "")
if (/^\/(sitemap\.xml|rss|robots\.txt)(\/)?$/i.test(raw)) {
  if (typeof window !== "undefined") window.location.href = raw
}
</script>

<style scoped></style>
