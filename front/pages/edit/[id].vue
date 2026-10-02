<template>
  <div>
    <Header v-if="currentUser" v-bind:user="currentUser"/>
    <div v-if="id === null" class="flex flex-col items-center justify-center gap-3 py-24" role="alert">
      <p class="text-5xl font-bold text-gray-300 dark:text-gray-600">400</p>
      <p class="text-gray-500">动态编号无效，请从动态列表重新进入编辑页</p>
      <UButton to="/" color="white">返回首页</UButton>
    </div>
    <MemoEdit v-else :key="id" :id="id"/>
  </div>
</template>

<script setup lang="ts">
import type {UserVO} from "~/types";
import {useRoute} from "#imports";

const currentUser = useState<UserVO>('userinfo')
const route = useRoute()
const id = computed<number | null>(() => {
  const raw = Array.isArray(route.params.id) ? route.params.id[0] : route.params.id
  const value = String(raw || '')
  if (!/^[1-9]\d*$/.test(value)) return null
  const number = Number(value)
  return Number.isSafeInteger(number) && number > 0 ? number : null
})
</script>

<style scoped>

</style>
