<template>
  <main class="mx-auto max-w-6xl px-4 pb-16 pt-10">
    <Header :user="currentUser" />
    <div class="mb-8 flex items-end justify-between gap-4"><div><p class="eyebrow">COLLECTION</p><h1 class="text-3xl font-bold">{{ album?.name || '图集' }}</h1><p v-if="album?.description" class="mt-2 text-sm text-zinc-500">{{ album.description }}</p></div><NuxtLink to="/photos" class="text-sm text-[#78943f]">返回照片墙</NuxtLink></div>
    <div v-if="loading" class="py-20 text-center text-sm text-zinc-500" role="status">正在加载…</div>
    <div v-else-if="errorMessage" class="rounded-2xl border border-red-200 bg-red-50 p-12 text-center text-sm text-red-700"><p>{{ errorMessage }}</p><UButton class="mt-4" color="red" variant="soft" @click="load">重新加载</UButton></div>
    <div v-else-if="!photos.length" class="rounded-2xl border border-dashed p-12 text-center text-sm text-zinc-500">这个图集还没有照片</div>
    <MyFancyBox v-else class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      <a v-for="photo in photos" :key="photo.id" :href="photo.url" class="relative aspect-square overflow-hidden rounded-2xl bg-zinc-100 dark:bg-zinc-800"><img :src="photo.thumbUrl || photo.url" :alt="photo.caption || '图集照片'" loading="lazy" decoding="async" class="h-full w-full object-cover transition hover:scale-105" /><button v-if="isAdmin && !album?.isDefault && photo.albumItemId" type="button" class="photo-delete" :aria-label="`删除照片${photo.caption ? `：${photo.caption}` : ''}`" :disabled="deleteSaving" @click.stop.prevent="askDelete(photo)"><UIcon name="i-carbon-trash-can" class="h-4 w-4" /></button></a>
    </MyFancyBox>
    <UButton v-if="hasNext && !errorMessage" block class="mt-6" :loading="loadingMore" :disabled="loading" @click="loadMore">加载更多</UButton>

    <UModal
      v-model="showDelete"
      :ui="{ container: 'fixed top-0 left-0 right-0 bottom-0 flex justify-center items-center backdrop-blur' }"
    >
      <div class="delete-panel bg-white dark:bg-zinc-800">
        <div class="flex items-start justify-between gap-4">
          <div><h2 class="text-lg font-bold">删除照片</h2><p class="mt-1 text-sm text-zinc-500">此操作需要再次确认。</p></div>
          <UButton color="gray" variant="ghost" icon="i-carbon-close" aria-label="取消删除照片" @click="showDelete = false" />
        </div>
        <div v-if="deleteTarget" class="delete-preview">
          <img :src="deleteTarget.thumbUrl || deleteTarget.url" :alt="deleteTarget.caption || '待删除照片'" />
        </div>
        <p v-if="deleteTarget?.caption" class="delete-caption">{{ deleteTarget.caption }}</p>
        <p class="text-sm text-zinc-500">照片将移出图集「{{ album?.name }}」；未被动态引用的上传文件会移入媒体回收站，可在文件管理中恢复，原动态与其他用户的文件不受影响。</p>
        <div class="flex justify-end gap-2">
          <UButton color="gray" variant="soft" @click="showDelete = false">取消</UButton>
          <UButton color="red" icon="i-carbon-trash-can" :loading="deleteSaving" @click="confirmDelete">确认删除</UButton>
        </div>
      </div>
    </UModal>
  </main>
</template>

<script setup lang="ts">
import { toast } from 'vue-sonner'
import type { PhotoAlbumPageVO, PhotoAlbumVO, PhotoVO, UserVO } from '~/types'
import { useGlobalState } from '~/store'

const route = useRoute()
const currentUser = useState<UserVO | null>('userinfo', () => null)
const global = useGlobalState()
const authUser = computed(() => global?.value?.userinfo ?? {})
const isAdmin = computed(() => Boolean(authUser.value.token) && Number(authUser.value.id ?? currentUser.value?.id) === 1)
const album = ref<PhotoAlbumVO | null>(null)
const photos = ref<PhotoVO[]>([])
const page = ref(1)
const hasNext = ref(false)
const loading = ref(true)
const loadingMore = ref(false)
const errorMessage = ref('')
let requestGeneration = 0
const albumId = computed(() => Number(route.params.id))

const showDelete = ref(false)
const deleteTarget = ref<PhotoVO | null>(null)
const deleteSaving = ref(false)

const askDelete = (photo: PhotoVO) => {
  if (!photo.albumItemId || deleteSaving.value) return
  deleteTarget.value = photo
  showDelete.value = true
}

const confirmDelete = async () => {
  const target = deleteTarget.value
  if (!target?.albumItemId || !album.value || deleteSaving.value) return
  deleteSaving.value = true
  try {
    const result = await useMyFetch<{ removed: boolean, mediaTrashed: boolean }>('/admin/photo/delete', { albumId: album.value.id, id: target.albumItemId })
    toast.success(result?.mediaTrashed ? '照片已移出图集，文件已移入回收站' : '照片已从图集移除')
    photos.value = photos.value.filter(item => item !== target)
    deleteTarget.value = null
    showDelete.value = false
  } catch (error: any) {
    toast.error(error?.message || '照片删除失败')
  } finally {
    deleteSaving.value = false
  }
}

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

<style scoped>
.eyebrow{color:#88a943;font-size:.68rem;font-weight:700;letter-spacing:.16em;margin-bottom:.35rem}
.photo-delete{position:absolute;top:.35rem;right:.35rem;display:flex;width:2.5rem;height:2.5rem;align-items:center;justify-content:center;border:none;border-radius:9999px;color:#fff;background:rgba(0,0,0,.55);cursor:pointer;opacity:0;transition:opacity .2s ease,background .2s ease}
a:hover .photo-delete,.photo-delete:focus-visible{opacity:1}
.photo-delete:hover{background:rgba(220,38,38,.9)}
.photo-delete:focus-visible{outline:2px solid #fff;outline-offset:1px}
.photo-delete:disabled{cursor:progress}
@media (hover: none){.photo-delete{opacity:1}}
.delete-panel{display:flex;flex-direction:column;gap:.8rem;width:min(92vw,22rem);padding:1.25rem;border-radius:.5rem}
.delete-preview{width:100%;aspect-ratio:1;overflow:hidden;border-radius:.5rem;background:#e5e5e5}
.delete-preview img{width:100%;height:100%;object-fit:cover}
.delete-caption{font-size:.9rem;font-weight:600;word-break:break-all}
</style>
