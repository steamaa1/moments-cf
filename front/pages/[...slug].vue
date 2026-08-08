<template>
  <Header v-if="!isSeoPath && currentUser" v-bind:user="currentUser"/>
  <div v-if="isSeoPath" class="flex flex-col items-center justify-center gap-3 py-24">
    <p class="text-gray-500">正在加载 {{ raw }}…</p>
    <UButton color="white" @click="refreshAgain">重新加载</UButton>
  </div>
  <div v-else class="flex flex-col items-center justify-center gap-3 py-24">
    <p class="text-7xl font-bold text-gray-300 dark:text-gray-600">404</p>
    <p class="text-gray-500">页面不存在</p>
    <UButton to="/" color="white">返回首页</UButton>
  </div>
</template>

<script setup lang="ts">
import type { UserVO } from "~/types";

const route = useRoute()
const currentUser = useState<UserVO | null>("userinfo")

// sitemap/rss/robots 落入 SPA（边缘缓存旧 index.html 或站内跳转）时，
// 整页刷新交给 Worker 返回原始 XML；Worker 响应已 no-store，服务器必然
// 返回 XML，sessionStorage 标记仅重定向一次，再次进入显示“加载中”提示
const raw = String(route.path || "")
const isSeoPath = /^\/(sitemap\.xml|rss|robots\.txt)(\/)?$/i.test(raw)
const refreshAgain = () => { sessionStorage.removeItem("__seoRefresh"); window.location.href = raw }
if (isSeoPath && typeof window !== "undefined") {
  if (sessionStorage.getItem("__seoRefresh")) {
    sessionStorage.removeItem("__seoRefresh")
  } else {
    sessionStorage.setItem("__seoRefresh", "1")
    window.location.href = raw
  }
}
</script>

<style scoped></style>
