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
            aria-label="添加照片"
            @click="showAddPhoto = true"
          >
            添加照片
          </UButton>
        </div>
        <div v-if="isAdmin" class="admin-actions mt-4">
          <UButton icon="i-carbon-folder-add" color="gray" variant="soft" @click="showCreateAlbum = true">新建图集</UButton>
          <UButton icon="i-carbon-star" color="gray" variant="soft" @click="showFeatured = true">设置精选</UButton>
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

    <UModal v-model="showAddPhoto">
      <form class="admin-panel" @submit.prevent="savePhoto">
        <div><h2>添加照片</h2><p class="muted">选择图集和图片后单独保存。</p></div>
        <UFormGroup label="图集" required>
          <USelectMenu v-model="uploadAlbumId" :options="uploadAlbumOptions" value-attribute="value" option-attribute="label" placeholder="选择图集" />
        </UFormGroup>
        <UFormGroup label="图片" required>
          <UInput type="file" accept="image/*" @change="selectPhoto" />
        </UFormGroup>
        <UFormGroup label="说明">
          <UInput v-model="uploadCaption" maxlength="200" placeholder="可选" />
        </UFormGroup>
        <div class="modal-actions">
          <UButton color="gray" variant="ghost" type="button" @click="showAddPhoto = false">取消</UButton>
          <UButton type="submit" icon="i-carbon-save" :loading="photoSaving" :disabled="!uploadAlbumId || !uploadFiles?.length">保存照片</UButton>
        </div>
      </form>
    </UModal>

    <UModal v-model="showCreateAlbum">
      <form class="admin-panel" @submit.prevent="saveAlbum">
        <div><h2>新建图集</h2><p class="muted">创建后可在“添加照片”中选择该图集。</p></div>
        <UFormGroup label="图集名称" required><UInput v-model="newAlbum.name" maxlength="80" placeholder="图集名称" /></UFormGroup>
        <UFormGroup label="描述"><UTextarea v-model="newAlbum.description" maxlength="500" placeholder="可选" /></UFormGroup>
        <div class="modal-actions">
          <UButton color="gray" variant="ghost" type="button" @click="showCreateAlbum = false">取消</UButton>
          <UButton type="submit" icon="i-carbon-save" :loading="albumSaving" :disabled="!newAlbum.name.trim()">保存图集</UButton>
        </div>
      </form>
    </UModal>

    <UModal v-model="showFeatured" @open="loadFeaturedCandidates">
      <div class="admin-panel">
        <div><h2>设置精选图片</h2><p class="muted">从全部照片中选择，点击即设为精选。</p></div>
        <UInput v-model="featuredKeyword" placeholder="按说明筛选" @update:model-value="loadFeaturedCandidates" />
        <div v-if="featuredLoading" class="status">正在加载照片…</div>
        <div v-else-if="!featuredCandidates.length" class="empty">暂无可选照片。</div>
        <div v-else class="picker-grid">
          <button
            v-for="photo in featuredCandidates"
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
        <p class="muted">已精选 {{ wall.featured.length }} 张；再次点击已精选照片可取消精选。</p>
        <div class="modal-actions">
          <UButton color="gray" variant="ghost" type="button" @click="showFeatured = false">完成</UButton>
        </div>
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

const showAddPhoto = ref(false)
const showCreateAlbum = ref(false)
const showFeatured = ref(false)
const uploadAlbumId = ref<number>()
const uploadFiles = ref<FileList | null>(null)
const uploadCaption = ref('')
const photoSaving = ref(false)
const albumSaving = ref(false)
const featuredCandidates = ref<PhotoVO[]>([])
const featuredKeyword = ref('')
const featuredLoading = ref(false)
const featuredToggling = ref(new Set<string>())
const loadFeaturedCandidates = () => setFeatured()
const newAlbum = reactive({ name: '', description: '' })

const uploadAlbumOptions = computed(() => wall.albums
  .filter(album => !album.isDefault)
  .map(album => ({ label: album.name, value: album.id })))

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
    showAddPhoto.value = false
    uploadFiles.value = null
    uploadCaption.value = ''
    await loadWall()
  } catch (error: any) {
    toast.error(error?.message || '照片保存失败')
  } finally {
    photoSaving.value = false
  }
}

const saveAlbum = async () => {
  if (!newAlbum.name.trim()) return toast.warning('请填写图集名称')
  albumSaving.value = true
  try {
    await useMyFetch('/admin/photo/album/save', newAlbum)
    toast.success('图集已保存')
    newAlbum.name = ''
    newAlbum.description = ''
    showCreateAlbum.value = false
    await loadWall()
  } catch (error: any) {
    toast.error(error?.message || '图集保存失败')
  } finally {
    albumSaving.value = false
  }
}

const setFeatured = async () => {
  featuredLoading.value = true
  try {
    const all = []
    for (let page = 1; ; page += 1) {
      const result = await useMyFetch<{ list: PhotoVO[]; hasNext: boolean }>('/photo/all', { page, size: 60, keyword: featuredKeyword.value })
      all.push(...result.list)
      if (!result.hasNext) break
    }
    featuredCandidates.value = all
  } catch (error: any) {
    toast.error(error?.message || '照片加载失败')
  } finally {
    featuredLoading.value = false
  }
}

const isFeatured = (photo: PhotoVO) => Boolean(photo.featured) || wall.featured.some(item => String(item.id) === String(photo.id))

const toggleFeatured = async (photo: PhotoVO) => {
  const key = String(photo.id)
  if (featuredToggling.value.has(key)) return
  featuredToggling.value.add(key)
  const willFeature = !isFeatured(photo)
  const itemId = photo.albumItemId ?? (photo.sourceType === 'upload' ? photo.sourceId : null)
  if (!itemId) { toast.error('该照片无法精选'); featuredToggling.value.delete(key); return }
  try {
    await useMyFetch('/admin/photo/featured/set', { id: itemId, featured: willFeature })
    toast.success(willFeature ? '已设为精选' : '已取消精选')
    await loadWall()
    await setFeatured()
  } catch (error: any) {
    toast.error(error?.message || '精选更新失败')
  } finally {
    featuredToggling.value.delete(key)
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
.admin-panel { display: flex; flex-direction: column; gap: 1rem; padding: 1.25rem; }
.modal-actions { display: flex; justify-content: flex-end; gap: .5rem; padding-top: .25rem; }
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
