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

const currentUser = useState<UserVO | null>("userinfo")

useHead({ meta: [{ name: 'robots', content: 'noindex, nofollow' }] })
</script>

<style scoped></style>
