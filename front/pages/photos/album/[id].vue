<template>
  <main class="mx-auto max-w-6xl px-4 pb-16 pt-10">
    <Header :user="currentUser" />
    <div class="album-heading mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <p class="eyebrow">COLLECTION</p>
        <h1 class="text-3xl font-bold">{{ album?.name || '图集' }}</h1>
        <p v-if="album?.description" class="album-description mt-2 text-sm">{{ album.description }}</p>
      </div>
      <div class="album-actions flex flex-wrap items-center gap-3">
        <button
          v-if="isAdmin && album && !album.isDefault"
          type="button"
          class="manage-toggle"
          :aria-pressed="managing"
          @click="managing = !managing"
        >{{ managing ? '完成' : '管理照片' }}</button>
        <NuxtLink to="/photos" class="back-link text-sm">返回照片墙</NuxtLink>
      </div>
    </div>
    <div v-if="loading" class="py-20 text-center text-sm text-zinc-500" role="status">正在加载…</div>
    <div v-else-if="errorMessage" class="album-error rounded-2xl border border-red-200 bg-red-50 p-12 text-center text-sm text-red-700"><p>{{ errorMessage }}</p><UButton class="mt-4" color="red" variant="soft" @click="load">重新加载</UButton></div>
    <div v-else-if="!photos.length" class="album-empty rounded-2xl border border-dashed p-12 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-300">这个图集还没有照片</div>
    <MyFancyBox v-else class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      <div v-for="photo in photos" :key="photo.id" class="photo-frame relative aspect-square rounded-2xl bg-zinc-100 dark:bg-zinc-800">
        <a :href="photo.url" class="photo-tile" :aria-label="`预览照片${photo.caption ? `：${photo.caption}` : ''}`">
          <img :src="photo.thumbUrl || photo.url" :alt="photo.caption || '图集照片'" loading="lazy" decoding="async" />
        </a>
        <button
          v-if="managing && isAdmin && !album?.isDefault && hasAlbumItemId(photo)"
          type="button"
          class="photo-delete"
          :aria-label="`从图集移除照片${photo.caption ? `：${photo.caption}` : ''}`"
          :disabled="deleteSaving"
          @click.stop.prevent="askDelete(photo)"
        ><UIcon name="i-carbon-trash-can" class="h-4 w-4" aria-hidden="true" /></button>
      </div>
    </MyFancyBox>
    <UButton v-if="hasNext && !errorMessage" block class="mt-6" :loading="loadingMore" :disabled="loading" @click="loadMore">加载更多</UButton>

    <UModal
      v-model="showDelete"
      :ui="{ container: 'fixed top-0 left-0 right-0 bottom-0 flex justify-center items-center backdrop-blur', width: 'w-[92vw] max-w-[22rem]', padding: 'p-0' }"
    >
      <div class="delete-panel bg-white dark:bg-zinc-800">
        <div class="flex items-start justify-between gap-4">
          <div><h2 class="text-lg font-bold">从图集移除照片</h2><p class="album-description mt-1 text-sm">此操作需要再次确认。</p></div>
          <UButton color="gray" variant="ghost" icon="i-carbon-close" aria-label="取消移除照片" @click="showDelete = false" />
        </div>
        <div v-if="deleteTarget" class="delete-preview">
          <img :src="deleteTarget.thumbUrl || deleteTarget.url" :alt="deleteTarget.caption || '待删除照片'" />
        </div>
        <p v-if="deleteTarget?.caption" class="delete-caption">{{ deleteTarget.caption }}</p>
        <p class="album-description text-sm">照片将移出图集「{{ album?.name }}」；未被动态引用的上传文件会移入媒体回收站，可在文件管理中恢复，原动态与其他用户的文件不受影响。</p>
        <div class="flex justify-end gap-2">
          <UButton color="gray" variant="soft" @click="showDelete = false">取消</UButton>
          <UButton color="red" icon="i-carbon-trash-can" :loading="deleteSaving" @click="confirmDelete">确认移除</UButton>
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
const managing = ref(false)
const hasAlbumItemId = (photo: PhotoVO) => Number.isInteger(photo.albumItemId) && Number(photo.albumItemId) > 0

const askDelete = (photo: PhotoVO) => {
  if (!managing.value || !isAdmin.value || !album.value || album.value.isDefault || !hasAlbumItemId(photo) || deleteSaving.value) return
  deleteTarget.value = photo
  showDelete.value = true
}

const confirmDelete = async () => {
  const target = deleteTarget.value
  if (!target || !hasAlbumItemId(target) || !album.value || album.value.isDefault || !isAdmin.value || deleteSaving.value) return
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
  managing.value = false; showDelete.value = false; deleteTarget.value = null
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
.eyebrow { color: #88a943; font-size: .68rem; font-weight: 700; letter-spacing: .16em; margin-bottom: .35rem; }
.album-description { color: #666b60; }
.back-link { color: #587626; text-underline-offset: .2rem; }
.back-link:hover { text-decoration: underline; }
.manage-toggle { min-height: 2.75rem; padding: .55rem .9rem; border: 1px solid #8ca653; border-radius: .5rem; background: #f2f7e9; color: #405d19; font-size: .875rem; font-weight: 700; transition: background .2s ease, border-color .2s ease; }
.manage-toggle:hover, .manage-toggle[aria-pressed='true'] { border-color: #587626; background: #e4efd2; }
.photo-frame { min-width: 0; overflow: hidden; }
.photo-tile { display: block; width: 100%; height: 100%; overflow: hidden; border-radius: inherit; }
.photo-tile img { width: 100%; height: 100%; object-fit: cover; transition: transform .25s ease; }
.photo-tile:hover img { transform: scale(1.04); }
.photo-delete { position: absolute; top: .45rem; right: .45rem; z-index: 2; display: flex; width: 2.75rem; height: 2.75rem; align-items: center; justify-content: center; border: 1px solid rgba(255,255,255,.55); border-radius: 9999px; color: #fff; background: rgba(92,34,34,.9); box-shadow: 0 2px 10px rgba(0,0,0,.3); cursor: pointer; transition: background .2s ease, transform .2s ease; }
.photo-delete:hover { background: #991b1b; transform: scale(1.05); }
.photo-delete:disabled { cursor: progress; }
.photo-tile:focus-visible, .photo-delete:focus-visible, .manage-toggle:focus-visible, .back-link:focus-visible { outline: 3px solid #78943f; outline-offset: 3px; }
.photo-tile:focus-visible { outline-offset: -4px; }
.photo-delete:focus-visible { outline-color: #fff; outline-offset: -4px; }
.delete-panel { display: flex; flex-direction: column; gap: .8rem; width: 100%; min-width: 0; box-sizing: border-box; max-height: 88vh; overflow-y: auto; padding: 1.25rem; border-radius: .5rem; }
.delete-preview { width: 100%; aspect-ratio: 1; overflow: hidden; border-radius: .5rem; background: #e5e5e5; }
.delete-preview img { width: 100%; height: 100%; object-fit: cover; }
.delete-caption { font-size: .9rem; font-weight: 600; overflow-wrap: anywhere; }
:global(.dark) .album-error { border-color: #7f1d1d; background: #3b181b; color: #fecaca; }
:global(.dark) .album-description { color: #b9c1b2; }
:global(.dark) .back-link { color: #bdd783; }
:global(.dark) .manage-toggle { border-color: #78943f; background: #28371e; color: #dbedbd; }
:global(.dark) .manage-toggle:hover, :global(.dark) .manage-toggle[aria-pressed='true'] { background: #394e27; }
:global(.dark) .photo-tile:focus-visible, :global(.dark) .manage-toggle:focus-visible, :global(.dark) .back-link:focus-visible { outline-color: #bdd783; }
@media (max-width: 640px) { .album-heading { align-items: flex-start; } .album-actions { width: 100%; justify-content: space-between; } }
@media (prefers-reduced-motion: reduce) { .photo-tile img, .photo-delete, .manage-toggle { transition: none; } }
</style>
