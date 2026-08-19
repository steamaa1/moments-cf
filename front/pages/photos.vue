<template>
  <main class="photos-page pb-12" aria-labelledby="photos-title">
    <Header :user="currentUser" />

    <div class="photos-content px-4">
      <section class="hero mb-8">
        <p class="eyebrow">VISUAL JOURNAL</p>
        <div class="flex items-end justify-between gap-4">
          <div>
            <h1 id="photos-title">照片墙</h1>
            <p class="subtitle">把值得记住的光影，留在这里。</p>
          </div>
          <UButton
            v-if="isAdmin"
            icon="i-carbon-add"
            color="primary"
            size="lg"
            class="min-h-11 shrink-0 shadow-sm"
            aria-label="照片管理"
            @click="showAdmin = true"
          >
            照片管理
          </UButton>
        </div>
      </section>

      <section v-if="wall.today.length" class="mb-10" aria-labelledby="today-title">
        <div class="section-heading">
          <div><p class="eyebrow">MEMORY RETURNS</p><h2 id="today-title">历史上的今天</h2></div>
          <span class="count">{{ wall.today.length }} 张</span>
        </div>
        <MyFancyBox class="today-grid">
          <a v-for="photo in wall.today" :key="photo.id" :href="photo.url" class="photo-tile">
            <img :src="photo.thumbUrl || photo.url" :alt="photo.caption || '历史照片'" loading="lazy" decoding="async" />
            <span>{{ formatDate(photo.createdAt) }}</span>
          </a>
        </MyFancyBox>
      </section>

      <section v-if="wall.featured.length" class="mb-10" aria-labelledby="featured-title">
        <div class="section-heading">
          <div><p class="eyebrow">CURATED</p><h2 id="featured-title">精选图片</h2></div>
          <div class="flex gap-2">
            <UButton aria-label="上一张精选图片" icon="i-carbon-arrow-left" color="gray" variant="soft" :disabled="featuredIndex === 0" @click="featuredIndex--" />
            <UButton aria-label="下一张精选图片" icon="i-carbon-arrow-right" color="gray" variant="soft" :disabled="featuredIndex >= wall.featured.length - 1" @click="featuredIndex++" />
          </div>
        </div>
        <MyFancyBox>
          <a :href="wall.featured[featuredIndex]?.url" class="featured-card">
            <img :src="wall.featured[featuredIndex]?.url" :alt="wall.featured[featuredIndex]?.caption || '精选图片'" loading="lazy" decoding="async" />
            <div class="featured-caption">
              <span>精选 {{ featuredIndex + 1 }} / {{ wall.featured.length }}</span>
              <p v-if="wall.featured[featuredIndex]?.caption">{{ wall.featured[featuredIndex].caption }}</p>
            </div>
          </a>
        </MyFancyBox>
      </section>

      <section aria-labelledby="albums-title">
        <div class="section-heading"><div><p class="eyebrow">COLLECTIONS</p><h2 id="albums-title">所有图集</h2></div></div>
        <div v-if="loading" class="status">正在加载照片…</div>
        <div v-else-if="!wall.albums.length" class="empty">还没有图集。</div>
        <div v-for="album in wall.albums" :key="album.id" class="album-section">
          <div class="album-title">
            <div>
              <h3>{{ album.name }}</h3>
              <p v-if="album.description">{{ album.description }}</p>
            </div>
            <UButton
              v-if="albumHasMore(album)"
              variant="ghost"
              color="gray"
              :loading="albumState(album.id).loading"
              @click="loadAll(album)"
            >
              查看全部 <UIcon name="i-carbon-chevron-down" />
            </UButton>
            <UButton v-else-if="albumState(album.id).expanded" variant="ghost" color="gray" @click="collapseAlbum(album)">
              收起 <UIcon name="i-carbon-chevron-up" />
            </UButton>
          </div>
          <MyFancyBox class="album-grid" :class="{ 'album-grid--expanded': albumState(album.id).expanded }">
            <a v-for="photo in visiblePhotos(album)" :key="photo.id" :href="photo.url" class="photo-tile">
              <img :src="photo.thumbUrl || photo.url" :alt="photo.caption || album.name" loading="lazy" decoding="async" />
            </a>
          </MyFancyBox>
        </div>
      </section>
    </div>

    <UModal
      v-model="showAdmin"
      :ui="{ container: 'fixed top-0 left-0 right-0 bottom-0 flex justify-center items-center backdrop-blur' }"
    >
      <div class="admin-panel max-h-[88vh] overflow-y-auto bg-white dark:bg-neutral-800">
        <div class="flex items-start justify-between gap-4">
          <div><h2>照片管理</h2><p class="muted">每个管理区可单独保存。</p></div>
          <UButton color="gray" variant="ghost" icon="i-carbon-close" aria-label="关闭照片管理" @click="showAdmin = false" />
        </div>

        <form class="admin-section" @submit.prevent="savePhoto">
          <div><h3>添加照片</h3><p class="muted">选择图集和图片后保存。</p></div>
          <UFormGroup label="图集" required>
            <USelectMenu v-model="uploadAlbumId" :options="uploadAlbumOptions" value-attribute="value" option-attribute="label" placeholder="选择图集" />
          </UFormGroup>
          <UFormGroup label="图片" required><UInput type="file" accept="image/*" multiple @change="selectPhoto" /></UFormGroup>
          <UFormGroup label="说明"><UInput v-model="uploadCaption" maxlength="200" placeholder="可选" /></UFormGroup>
          <div class="modal-actions"><UButton type="submit" icon="i-carbon-save" :loading="photoSaving" :disabled="!uploadAlbumId || !uploadFiles?.length">保存照片</UButton></div>
        </form>

        <form class="admin-section" @submit.prevent="saveAlbum">
          <div><h3>图集设置</h3><p class="muted">新建图集，或选择现有图集修改名称和描述。</p></div>
          <UFormGroup label="操作">
            <USelectMenu v-model="albumEditorId" :options="albumEditorOptions" value-attribute="value" option-attribute="label" @update:model-value="selectAlbumEditor" />
          </UFormGroup>
          <UFormGroup label="图集名称" required><UInput v-model="albumEditor.name" maxlength="80" placeholder="图集名称" /></UFormGroup>
          <UFormGroup label="描述"><UTextarea v-model="albumEditor.description" maxlength="500" placeholder="可选" /></UFormGroup>
          <div class="modal-actions"><UButton type="submit" icon="i-carbon-save" :loading="albumSaving" :disabled="!albumEditor.name.trim()">保存图集</UButton></div>
        </form>

        <section class="admin-section">
          <div><h3>设置精选图片</h3><p class="muted">先手动加载全部图片，再点击图片切换精选状态。</p></div>
          <div class="flex flex-wrap gap-2">
            <UButton icon="i-carbon-download" color="gray" variant="soft" :loading="featuredLoading" @click="loadFeaturedCandidates">
              {{ featuredLoaded ? '重新加载全部图片' : '加载全部图片' }}
            </UButton>
            <UInput v-if="featuredLoaded" v-model="featuredKeyword" class="min-w-0 flex-1" placeholder="在已加载图片中筛选" />
          </div>
          <div v-if="featuredLoading" class="loading-notice"><UIcon name="i-carbon-circle-dash" class="h-5 w-5 animate-spin" /><span>正在加载全部图片，请稍候…</span></div>
          <div v-else-if="!featuredLoaded" class="empty compact-empty">尚未加载图片，请点击“加载全部图片”。</div>
          <div v-else-if="!filteredFeaturedCandidates.length" class="empty compact-empty">没有符合条件的图片。</div>
          <div v-else class="picker-grid">
            <button
              v-for="photo in filteredFeaturedCandidates"
              :key="photo.id"
              type="button"
              class="picker-tile"
              :class="{ 'picker-tile--active': isFeatured(photo) }"
              :aria-pressed="isFeatured(photo)"
              :disabled="featuredToggling.has(String(photo.id))"
              @click="toggleFeatured(photo)"
            >
              <img :src="photo.thumbUrl || photo.url" :alt="photo.caption || '照片'" loading="lazy" decoding="async" />
              <span v-if="isFeatured(photo)" class="picker-badge"><UIcon name="i-carbon-star-filled" /></span>
            </button>
          </div>
          <p v-if="featuredLoaded" class="muted">已精选 {{ wall.featured.length }} 张；再次点击可取消精选。</p>
          <div class="modal-actions"><UButton icon="i-carbon-save" :loading="featuredSaving" :disabled="!featuredLoaded" @click="saveFeatured">保存精选设置</UButton></div>
        </section>
      </div>
    </UModal>
  </main>
</template>

<script setup lang="ts">
import { toast } from 'vue-sonner'
import type { PhotoAlbumPageVO, PhotoAlbumVO, PhotoVO, PhotoWallVO, UserVO } from '~/types'
import { useGlobalState } from '~/store'
import { useUpload } from '~/utils'

interface AlbumViewState {
  photos: PhotoVO[]
  page: number
  hasNext: boolean
  loading: boolean
  expanded: boolean
}

const currentUser = useState<UserVO | null>('userinfo', () => null)
const global = useGlobalState()
const authUser = computed(() => global?.value?.userinfo ?? {})
const isAdmin = computed(() => Boolean(authUser.value.token) && Number(authUser.value.id ?? currentUser.value?.id) === 1)
const wall = reactive<PhotoWallVO>({ today: [], featured: [], albums: [] })
const loading = ref(true)
const featuredIndex = ref(0)
const albumStates = reactive<Record<number, AlbumViewState>>({})

const showAdmin = ref(false)
const uploadAlbumId = ref<number>()
const uploadFiles = ref<FileList | null>(null)
const uploadCaption = ref('')
const photoSaving = ref(false)
const albumSaving = ref(false)
const albumEditorId = ref(0)
const albumEditor = reactive({ name: '', description: '' })
const featuredCandidates = ref<PhotoVO[]>([])
const featuredKeyword = ref('')
const featuredLoading = ref(false)
const featuredLoaded = ref(false)
const featuredSaving = ref(false)
const featuredToggling = ref(new Set<string>())
const originalFeatured = ref(new Map<string, boolean>())

const uploadAlbumOptions = computed(() => wall.albums
  .filter(album => !album.isDefault)
  .map(album => ({ label: album.name, value: album.id })))
const albumEditorOptions = computed(() => [
  { label: '新建图集', value: 0 },
  ...wall.albums.map(album => ({ label: `修改：${album.name}`, value: album.id })),
])
const filteredFeaturedCandidates = computed(() => {
  const keyword = featuredKeyword.value.trim().toLowerCase()
  if (!keyword) return featuredCandidates.value
  return featuredCandidates.value.filter(photo => String(photo.caption || '').toLowerCase().includes(keyword))
})

const loadWall = async () => {
  loading.value = true
  try {
    const result = await useMyFetch<PhotoWallVO>('/photo/wall')
    Object.assign(wall, result)
    for (const album of wall.albums) {
      albumStates[album.id] = {
        photos: [...(album.photos || [])],
        page: 1,
        hasNext: Number(album.count || 0) > (album.photos || []).length,
        loading: false,
        expanded: false,
      }
    }
    featuredIndex.value = Math.min(featuredIndex.value, Math.max(0, wall.featured.length - 1))
  } catch (error: any) {
    toast.error(error?.message || '照片墙加载失败')
  } finally {
    loading.value = false
  }
}

onMounted(loadWall)

const albumState = (id: number) => albumStates[id] || { photos: [], page: 1, hasNext: false, loading: false, expanded: false }
const visiblePhotos = (album: PhotoAlbumVO) => albumState(album.id).photos.length ? albumState(album.id).photos : (album.photos || [])
const albumHasMore = (album: PhotoAlbumVO) => albumState(album.id).hasNext || (!albumState(album.id).expanded && Number(album.count || 0) > visiblePhotos(album).length)

const loadAll = async (album: PhotoAlbumVO) => {
  const state = albumStates[album.id]
  if (!state || state.loading) return
  state.loading = true
  state.expanded = true
  try {
    state.photos = []
    state.page = 0
    state.hasNext = true
    while (state.hasNext) {
      const nextPage = state.page + 1
      const result = await useMyFetch<PhotoAlbumPageVO>('/photo/album', { id: album.id, page: nextPage, size: 60 })
      const known = new Set(state.photos.map(photo => String(photo.id)))
      state.photos.push(...result.list.filter(photo => !known.has(String(photo.id))))
      state.page = nextPage
      state.hasNext = result.hasNext
    }
  } catch (error: any) {
    toast.error(error?.message || '图集加载失败')
  } finally {
    state.loading = false
  }
}

const collapseAlbum = (album: PhotoAlbumVO) => {
  const state = albumStates[album.id]
  if (!state) return
  state.photos = state.photos.slice(0, 9)
  state.page = 1
  state.hasNext = Number(album.count || 0) > state.photos.length
  state.expanded = false
}

const formatDate = (value?: string) => value ? new Date(value).toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' }) : ''
const selectPhoto = (value: FileList | Event) => {
  uploadFiles.value = typeof FileList !== 'undefined' && value instanceof FileList
    ? value
    : ((value as Event).target as HTMLInputElement | null)?.files || null
}

const savePhoto = async () => {
  if (!uploadAlbumId.value || !uploadFiles.value?.length) return toast.warning('请选择图集和图片')
  photoSaving.value = true
  try {
    const urls = await useUpload(uploadFiles.value)
    for (const url of urls || []) {
      await useMyFetch('/admin/photo/album/add', { albumId: uploadAlbumId.value, url, caption: uploadCaption.value })
    }
    toast.success('照片已保存')
    uploadFiles.value = null
    uploadCaption.value = ''
    await loadWall()
  } catch (error: any) {
    toast.error(error?.message || '照片保存失败')
  } finally {
    photoSaving.value = false
  }
}

const selectAlbumEditor = (value: number) => {
  const id = Number(value || 0)
  albumEditorId.value = id
  const album = wall.albums.find(item => item.id === id)
  albumEditor.name = album?.name || ''
  albumEditor.description = album?.description || ''
}

const saveAlbum = async () => {
  if (!albumEditor.name.trim()) return toast.warning('请填写图集名称')
  albumSaving.value = true
  try {
    await useMyFetch('/admin/photo/album/save', { id: albumEditorId.value || undefined, ...albumEditor })
    toast.success(albumEditorId.value ? '图集名称已保存' : '图集已创建')
    albumEditorId.value = 0
    albumEditor.name = ''
    albumEditor.description = ''
    await loadWall()
  } catch (error: any) {
    toast.error(error?.message || '图集保存失败')
  } finally {
    albumSaving.value = false
  }
}

const loadFeaturedCandidates = async () => {
  if (featuredLoading.value) return
  featuredLoading.value = true
  featuredLoaded.value = false
  try {
    const result = await useMyFetch<{ list: PhotoVO[] }>('/photo/all', { page: 1, size: 500 })
    featuredCandidates.value = result.list
    originalFeatured.value = new Map(result.list.map(photo => [String(photo.id), Boolean(photo.featured)]))
    featuredLoaded.value = true
  } catch (error: any) {
    toast.error(error?.message || '照片加载失败')
  } finally {
    featuredLoading.value = false
  }
}

const isFeatured = (photo: PhotoVO) => Boolean(photo.featured)
const toggleFeatured = (photo: PhotoVO) => {
  const key = String(photo.id)
  if (featuredToggling.value.has(key)) return
  photo.featured = !photo.featured
}

const saveFeatured = async () => {
  const changed = featuredCandidates.value.filter(photo => originalFeatured.value.get(String(photo.id)) !== Boolean(photo.featured))
  if (!changed.length) return toast.info('精选设置没有变化')
  featuredSaving.value = true
  try {
    for (const photo of changed) {
      const itemId = photo.albumItemId ?? (photo.sourceType === 'upload' ? photo.sourceId : null)
      if (!itemId && !photo.memoId) throw new Error('存在无法保存的精选图片')
      featuredToggling.value.add(String(photo.id))
      await useMyFetch('/admin/photo/featured/set', itemId
        ? { id: itemId, featured: Boolean(photo.featured) }
        : { memoId: photo.memoId, sourceIndex: photo.sourceIndex || 0, featured: Boolean(photo.featured) })
    }
    toast.success('精选设置已保存')
    await loadWall()
    await loadFeaturedCandidates()
  } catch (error: any) {
    toast.error(error?.message || '精选设置保存失败')
  } finally {
    featuredToggling.value.clear()
    featuredSaving.value = false
  }
}

useHead({
  title: '照片墙',
  meta: [
    { name: 'description', content: '浏览历史上的今天、精选图片与所有照片图集。' },
    { property: 'og:title', content: '照片墙' },
    { property: 'og:type', content: 'website' },
  ],
})
</script>

<style scoped>
.photos-page { min-height: 100vh; background: linear-gradient(180deg, rgba(159, 200, 74, .08), transparent 28rem); }
.photos-content { width: 100%; }
.hero { padding-top: 1rem; }
h1 { font-size: 2.15rem; font-weight: 750; letter-spacing: 0; }
h2 { font-size: 1.35rem; font-weight: 700; }
h3 { font-size: 1.08rem; font-weight: 700; }
.subtitle, .muted, .album-title p { color: #737373; font-size: .9rem; margin-top: .35rem; }
.eyebrow { color: #88a943; font-size: .68rem; font-weight: 700; letter-spacing: .16em; margin-bottom: .35rem; }
.section-heading, .album-title { display: flex; align-items: end; justify-content: space-between; gap: 1rem; margin-bottom: 1rem; }
.count { color: #9ca3af; font-size: .78rem; }
.admin-actions { display: flex; flex-wrap: wrap; gap: .5rem; justify-content: flex-end; }
.today-grid, .album-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: .55rem; }
.photo-tile { position: relative; display: block; min-width: 0; aspect-ratio: 1; overflow: hidden; border-radius: .5rem; background: #e5e5e5; }
.photo-tile img { width: 100%; height: 100%; object-fit: cover; transition: transform .25s ease; }
.photo-tile:hover img { transform: scale(1.04); }
.photo-tile span { position: absolute; left: .55rem; bottom: .45rem; color: white; font-size: .7rem; text-shadow: 0 1px 4px #000; }
.featured-card { position: relative; display: block; overflow: hidden; border-radius: .5rem; background: #222; aspect-ratio: 4 / 3; box-shadow: 0 16px 32px rgba(0, 0, 0, .14); }
.featured-card img { width: 100%; height: 100%; object-fit: cover; }
.featured-caption { position: absolute; inset: auto 0 0; padding: 2.5rem 1rem .85rem; color: #fff; background: linear-gradient(transparent, rgba(0, 0, 0, .72)); font-size: .75rem; }
.featured-caption p { margin-top: .3rem; font-size: .9rem; }
.album-section { margin-bottom: 2rem; }
.status, .empty { padding: 2.5rem 0; text-align: center; color: #9ca3af; }
.admin-panel { display: flex; flex-direction: column; gap: 1rem; width: min(92vw, 38rem); padding: 1.25rem; border-radius: .5rem; }
.admin-section { display: flex; flex-direction: column; gap: .8rem; padding-top: 1rem; border-top: 1px solid #e5e7eb; }
.dark .admin-section { border-color: #374151; }
.modal-actions { display: flex; justify-content: flex-end; gap: .5rem; padding-top: .25rem; }
.loading-notice { display: flex; min-height: 5rem; align-items: center; justify-content: center; gap: .5rem; color: #737373; font-size: .9rem; }
.compact-empty { padding: 1.5rem 0; }
.picker-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: .5rem; max-height: 60vh; overflow-y: auto; padding: .25rem; }
.picker-tile { position: relative; display: block; aspect-ratio: 1; overflow: hidden; border-radius: .5rem; background: #e5e5e5; border: 2px solid transparent; cursor: pointer; }
.picker-tile img { width: 100%; height: 100%; object-fit: cover; }
.picker-tile--active { border-color: #88a943; }
.picker-tile:disabled { cursor: progress; }
.picker-badge { position: absolute; top: .25rem; right: .25rem; color: #ffd54f; font-size: 1rem; text-shadow: 0 1px 4px #000; }
@media (max-width: 640px) {
  .picker-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
}
@media (max-width: 640px) {
  .photos-content { padding-left: .85rem; padding-right: .85rem; }
  .hero > div:first-of-type { align-items: flex-start; }
  .featured-card { aspect-ratio: 1 / 1.08; }
  .album-grid:not(.album-grid--expanded) { display: flex; overflow-x: auto; scroll-snap-type: x mandatory; padding-bottom: .45rem; }
  .album-grid:not(.album-grid--expanded) .photo-tile { flex: 0 0 31%; scroll-snap-align: start; }
  .album-grid--expanded { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .today-grid { gap: .4rem; }
}
@media (prefers-reduced-motion: reduce) { .photo-tile img { transition: none; } }
</style>
