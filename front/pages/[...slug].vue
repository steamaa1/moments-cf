<template>
  <Header v-if="currentUser" v-bind:user="currentUser"/>
  <pre v-if="seoText" class="mx-4 my-6 max-w-full overflow-auto whitespace-pre-wrap break-all rounded-lg border border-gray-200 p-4 text-xs leading-5 dark:border-gray-700">{{ seoText }}</pre>
  <div v-else class="flex flex-col items-center justify-center gap-3 py-24">
    <p class="text-7xl font-bold text-gray-300 dark:text-gray-600">404</p>
    <p class="text-gray-500">页面不存在</p>
    <UButton to="/" color="white">返回首页</UButton>
  </div>
</template>

<script setup lang="ts">
import type { UserVO } from "~/types";
import { onMounted, ref } from "vue";

const route = useRoute()
const currentUser = useState<UserVO | null>("userinfo")

// sitemap/rss/robots 落入 SPA（边缘缓存旧 index.html 或站内跳转）时，
// 直接 fetch 同路径获取 XML 内容并显示，不重定向、不刷新，彻底避免
// 404 报错与刷新循环
const raw = String(route.path || "")
const isSeoPath = /^\/(sitemap\.xml|rss|robots\.txt)(\/)?$/i.test(raw)
const seoText = ref("")

onMounted(async () => {
  if (!isSeoPath) return
  try {
    const response = await fetch(raw)
    const text = await response.text()
    const contentType = response.headers.get("content-type") || ""
    if (/^<\?xml/.test(text) || contentType.includes("xml")) {
      seoText.value = text
    }
  } catch (error) {
    console.error("获取站点资源失败", error)
  }
})
</script>

<style scoped></style>
