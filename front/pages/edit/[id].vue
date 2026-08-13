<template>
  <div>
    <Header v-if="currentUser" v-bind:user="currentUser"/>
    <MemoEdit :key="id" :id="id"/>

  </div>
</template>

<script setup lang="ts">
import type {UserVO} from "~/types";
import {useRoute} from "#imports";
const currentUser = useState<UserVO>('userinfo')
const route = useRoute()
const id = computed(() => Number(route.params.id))
</script>

<style scoped>

</style>