<template>
  <UPopover :ui="{base:'w-[300px]'}" :popper="{ arrow: true }" mode="click">
    <svg class="focus:outline-0 cursor-pointer w-6 h-6" xmlns="http://www.w3.org/2000/svg"
         viewBox="0 0 24 24" fill="currentColor" data-state="closed">
      <path
          d="M15.2735 15H5V7H19V15H17.3764L16.0767 19H21V21H3V19H7.6123L6.8 16.5L8.70211 15.882L9.71522 19H13.9738L15.2735 15ZM3.5 3H20.5V5H3.5V3ZM7 9V13H17V9H7Z"
      ></path>
    </svg>
    <template #panel="{ close }">
      <div class="flex max-h-[420px] flex-col gap-2 overflow-y-auto p-4">
        <URadioGroup
            legend="选择类型"
            v-model="type"
            :options="[{ value: 'book', label: '豆瓣读书' }, { value: 'movie', label: '豆瓣电影' }]"
        />
        <UInput v-model="doubanId" type="text" size="sm" placeholder="请输入豆瓣读书/豆瓣电影的ID"/>
        <div class="flex gap-2">
          <UButton @click="doParse" :disabled="pending" :loading="pending">添加</UButton>
          <UButton color="white" @click="clearCurrent(close)">清空当前类型</UButton>
        </div>
        <p v-if="books.length || movies.length" class="mt-1 text-xs text-gray-500">
          已添加：读书 {{ books.length }} · 电影 {{ movies.length }}
        </p>
        <div v-for="(book, index) in books" :key="book.id + index" class="flex items-center justify-between gap-2 rounded-lg border border-gray-200 px-2 py-1 text-xs dark:border-gray-700">
          <span class="truncate">{{ book.title }}</span>
          <UButton size="xs" color="red" variant="soft" icon="i-carbon-close" @click="removeBook(index)"/>
        </div>
        <div v-for="(movie, index) in movies" :key="movie.id + index" class="flex items-center justify-between gap-2 rounded-lg border border-gray-200 px-2 py-1 text-xs dark:border-gray-700">
          <span class="truncate">{{ movie.title }}</span>
          <UButton size="xs" color="red" variant="soft" icon="i-carbon-close" @click="removeMovie(index)"/>
        </div>
      </div>
    </template>
  </UPopover>
</template>

<script setup lang="ts">
import type {DoubanBook, DoubanMovie} from "~/types";

const pending = ref(false)
const doubanId = ref('')
const type = ref<'book' | 'movie'>('book')
const books = defineModel<DoubanBook[]>('books', { default: () => [] })
const movies = defineModel<DoubanMovie[]>('movies', { default: () => [] })

const doParse = async () => {
  const id = doubanId.value.trim()
  if (!id) return
  pending.value = true
  const url = type.value === 'book' ? '/memo/getDoubanBookInfo' : '/memo/getDoubanMovieInfo'
  try {
    const res = await useMyFetch<DoubanBook | DoubanMovie>(`${url}?id=${id}`)
    if (!res.title) { return }
    if (type.value === 'book') books.value = [...books.value, res as DoubanBook]
    else movies.value = [...movies.value, res as DoubanMovie]
    doubanId.value = ''
  } finally {
    pending.value = false
  }
}
const removeBook = (index: number) => { books.value = books.value.filter((_, i) => i !== index) }
const removeMovie = (index: number) => { movies.value = movies.value.filter((_, i) => i !== index) }
const clearCurrent = (close: Function) => {
  if (type.value === 'book') books.value = []
  else movies.value = []
  doubanId.value = ''
  close()
}
</script>

<style scoped>

</style>
