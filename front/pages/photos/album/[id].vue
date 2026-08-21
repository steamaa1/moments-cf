<template>
  <main class="mx-auto max-w-6xl px-4 pb-16 pt-10">
    <Header :user="currentUser" />
    <div class="mb-8 flex items-end justify-between gap-4"><div><p class="eyebrow">COLLECTION</p><h1 class="text-3xl font-bold">{{ album?.name || '图集' }}</h1><p v-if="album?.description" class="mt-2 text-sm text-zinc-500">{{ album.description }}</p></div><NuxtLink to="/photos" class="text-sm text-[#78943f]">返回照片墙</NuxtLink></div>
    <div v-if="loading" class="py-20 text-center text-sm text-zinc-500" role="status">正在加载…</div>
    <div v-else-if="errorMessage" class="rounded-2xl border border-red-200 bg-red-50 p-12 text-center text-sm text-red-700"><p>{{ errorMessage }}</p><UButton class="mt-4" color="red" variant="soft" @click="load">重新加载</UButton></div>
    <div v-else-if="!photos.length" class="rounded-2xl border border-dashed p-12 text-center text-sm text-zinc-500">这个图集还没有照片</div>
    <MyFancyBox v-else class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      <a v-for="photo in photos" :key="photo.id" :href="photo.url" class="aspect-square overflow-hidden rounded-2xl bg-zinc-100 dark:bg-zinc-800"><img :src="photo.thumbUrl || photo.url" :alt="photo.caption || '图集照片'" loading="lazy" decoding="async" class="h-full w-full object-cover transition hover:scale-105" /></a>
    </MyFancyBox>
    <UButton v-if="hasNext && !errorMessage" block class="mt-6" :loading="loadingMore" :disabled="loading" @click="loadMore">加载更多</UButton>
  </main>
</template>

<script setup lang="ts">
import type { PhotoAlbumPageVO, PhotoAlbumVO, PhotoVO, UserVO } from '~/types'

const route = useRoute()
const currentUser = useState<UserVO | null>('userinfo', () => null)
const album = ref<PhotoAlbumVO | null>(null)
const photos = ref<PhotoVO[]>([])
const page = ref(1)
const hasNext = ref(false)
const loading = ref(true)
const loadingMore = ref(false)
const errorMessage = ref('')
let requestGeneration = 0
const albumId = computed(() => Number(route.params.id))

const load = async () => {
  const id = albumId.value
  const generation = ++requestGeneration
  loading.value = true; errorMessage.value = ''; album.value = null; photos.value = []; page.value = 1; hasNext.value = false
  try {
    if (!Number.isInteger(id) || id < 1) throw new Error('图集参数无效')
    const res = await useMyFetch<PhotoAlbumPageVO>('/photo/album', { id, page: 1, size: 60 })
    if (generation !== requestGeneration) return
    album.value = res.album; photos.value = res.list || []; hasNext.value = Boolean(res.hasNext)
  } catch (error: any) {
    if (generation === requestGeneration) errorMessage.value = error?.message || '图集加载失败'
  } finally {
    if (generation === requestGeneration) loading.value = false
  }
}

const loadMore = async () => {
  if (loading.value || loadingMore.value || !hasNext.value) return
  const id = albumId.value; const generation = requestGeneration; loadingMore.value = true
  try {
    const res = await useMyFetch<PhotoAlbumPageVO>('/photo/album', { id, page: page.value + 1, size: 60 })
    if (generation !== requestGeneration) return
    const known = new Set(photos.value.map(photo => String(photo.id)))
    photos.value.push(...(res.list || []).filter(photo => !known.has(String(photo.id))))
    page.value++; hasNext.value = Boolean(res.hasNext)
  } catch (error: any) {
    if (generation === requestGeneration) errorMessage.value = error?.message || '更多照片加载失败'
  } finally {
    if (generation === requestGeneration) loadingMore.value = false
  }
}
onMounted(load)
watch(albumId, () => { void load() })
useHead(() => ({ title: album.value?.name ? album.value.name + ' · 照片墙' : '图集 · 照片墙', meta: [{ name: 'description', content: album.value?.description || '照片图集' }] }))
</script>

<style scoped>.eyebrow{color:#88a943;font-size:.68rem;font-weight:700;letter-spacing:.16em;margin-bottom:.35rem}</style>
