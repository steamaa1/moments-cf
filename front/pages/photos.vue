<template>
  <main class="photos-page pb-12" aria-labelledby="photos-title">
    <Header :user="currentUser" />

    <div class="photos-content px-4">
      <section class="hero mb-8">
        <p class="eyebrow">PHOTO JOURNAL <span aria-hidden="true">/</span> 影像记录</p>
        <div class="hero-row">
          <div>
            <h1 id="photos-title">照片墙</h1>
            <p class="subtitle">沿着光影，翻看每一段日常。</p>
          </div>
          <UButton v-if="isAdmin" icon="i-carbon-settings-adjust" color="gray" variant="soft" class="min-h-11 shrink-0" @click="showAdmin = true">照片管理</UButton>
        </div>
        <div v-if="isAdmin && wall.albums.some(album => !album.isDefault)" class="browse-toolbar">
          <span>{{ managing ? '管理模式：可从自建图集中移除照片' : '点击照片查看大图' }}</span>
          <UButton color="gray" variant="ghost" class="min-h-11" :aria-pressed="managing" @click="managing = !managing">
            <UIcon :name="managing ? 'i-carbon-checkmark' : 'i-carbon-edit'" aria-hidden="true" />
            {{ managing ? '完成管理' : '管理照片' }}
          </UButton>
        </div>
      </section>

      <section v-if="!loading && wall.today.length" class="mb-10" aria-labelledby="today-title">
        <div class="section-heading">
          <div><p class="eyebrow">MEMORY RETURNS</p><h2 id="today-title">历史上的今天</h2></div>
          <span class="count">{{ wall.today.length }} 张 · 往年今日</span>
        </div>
        <MyFancyBox class="today-grid">
          <a v-for="photo in wall.today" :key="photo.id" :href="photo.url" class="photo-tile">
            <img :src="photo.thumbUrl || photo.url" :alt="photo.caption || '历史照片'" loading="lazy" decoding="async" />
            <span>{{ formatDate(photo.createdAt) }}</span>
          </a>
        </MyFancyBox>
      </section>

      <section v-if="!loading && wall.featured.length" class="mb-10" aria-labelledby="featured-title">
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
        <div v-if="loading" class="status" role="status">正在整理照片…</div>
        <div v-else-if="wallError" class="empty"><p>{{ wallError }}</p><UButton class="mt-4" color="gray" variant="soft" @click="loadWall">重新加载</UButton></div>
        <div v-else-if="!wall.albums.length" class="empty"><UIcon name="i-carbon-image" class="empty-icon" aria-hidden="true" /><p>还没有图集</p><p class="empty-hint">照片会在这里慢慢聚起来。</p><UButton v-if="isAdmin" class="mt-4" @click="showAdmin = true">创建图集</UButton></div>
        <div v-for="album in (wallError ? [] : wall.albums)" :key="album.id" class="album-section">
          <div class="album-title">
            <div class="album-heading"><h3>{{ album.name }}</h3><span class="count">{{ album.count || 0 }} 张</span><p v-if="album.description">{{ album.description }}</p></div>
            <NuxtLink :to="`/photos/album/${album.id}`" class="album-link">图集详情 <UIcon name="i-carbon-arrow-up-right" aria-hidden="true" /></NuxtLink>
          </div>
          <MyFancyBox class="album-grid" :class="{ 'album-grid--expanded': albumState(album.id).expanded }">
            <div v-for="photo in visiblePhotos(album)" :key="photo.id" class="photo-frame">
              <a :href="photo.url" class="photo-tile">
                <img :src="photo.thumbUrl || photo.url" :alt="photo.caption || album.name" loading="lazy" decoding="async" />
              </a>
              <button
                v-if="managing && isAdmin && !album.isDefault && photo.albumItemId"
                type="button"
                class="photo-delete"
                :aria-label="`从图集移除照片${photo.caption ? `：${photo.caption}` : ''}`"
                :disabled="deleteSaving"
                @click.stop.prevent="askDelete(album, photo)"
              ><UIcon name="i-carbon-trash-can" class="h-4 w-4" aria-hidden="true" /></button>
            </div>
          </MyFancyBox>
          <p v-if="albumState(album.id).error" class="inline-error" role="alert">{{ albumState(album.id).error }} · 点击下方按钮重试</p>
          <div v-if="albumHasMore(album) || albumState(album.id).expanded" class="album-footer">
            <UButton v-if="albumHasMore(album)" color="gray" variant="soft" class="min-h-11" :loading="albumState(album.id).loading" @click="loadMore(album)">
              {{ albumState(album.id).expanded ? '加载更多照片' : '展开图集' }} <UIcon name="i-carbon-chevron-down" aria-hidden="true" />
            </UButton>
            <UButton v-if="albumState(album.id).expanded" color="gray" variant="ghost" class="min-h-11" @click="collapseAlbum(album)">收起图集 <UIcon name="i-carbon-chevron-up" aria-hidden="true" /></UButton>
          </div>
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
          <div><h3>添加照片</h3><p class="muted">选择图集后，上传本地图片或填写图片直链保存，两者可混用。</p></div>
          <UFormGroup label="图集" required>
            <USelectMenu v-model="uploadAlbumId" :options="uploadAlbumOptions" value-attribute="value" option-attribute="label" placeholder="选择图集" />
          </UFormGroup>
          <UFormGroup label="本地图片"><UInput :key="uploadInputKey" type="file" accept="image/*" multiple @change="selectPhoto" /></UFormGroup>
          <UFormGroup label="图片直链"><UTextarea v-model="uploadDirectUrls" :rows="2" placeholder="每行一个图片直链，如 https://example.com/a.jpg，可与本地图片混用" /></UFormGroup>
          <p class="muted" role="status">待上传 {{ uploadFiles.length }} 个文件、{{ directUrlList.length }} 条图片直链<span v-if="uploadPendingUrls.length">；待加入图集 {{ uploadPendingUrls.length }} 张</span></p>
          <p v-if="uploadPendingUrls.length && uploadPendingAlbumId !== uploadAlbumId" class="inline-error">请切回原图集，完成待加入的照片后再更换图集。</p>
          <UFormGroup label="说明"><UInput v-model="uploadCaption" maxlength="200" placeholder="可选" /></UFormGroup>
          <div class="modal-actions"><UButton type="submit" icon="i-carbon-save" :loading="photoSaving" :disabled="!uploadAlbumId || (uploadPendingUrls.length ? uploadPendingAlbumId !== uploadAlbumId : !uploadFiles?.length && !directUrlList.length)">保存照片</UButton></div>
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
          <div><h3>设置精选图片</h3><p class="muted">按需加载候选照片，点击图片选择或取消精选，最后保存。</p></div>
          <div class="flex flex-wrap items-center gap-2">
            <UButton v-if="!featuredLoaded" icon="i-carbon-download" color="gray" variant="soft" class="min-h-11" :loading="featuredLoading" @click="loadFeaturedCandidates">加载图片</UButton>
            <UButton v-else-if="featuredHasNext" icon="i-carbon-download" color="gray" variant="soft" class="min-h-11" :loading="featuredLoading" @click="loadMoreFeaturedCandidates">加载更多图片</UButton>
            <span v-else class="count">已加载全部图片</span>
            <UInput v-if="featuredLoaded" v-model="featuredKeyword" class="min-w-0 flex-1" placeholder="仅筛选已加载图片" aria-label="筛选已加载图片" />
          </div>
          <div v-if="featuredLoading" class="loading-notice" role="status"><UIcon name="i-carbon-circle-dash" class="h-5 w-5 animate-spin" /><span>正在加载图片，请稍候…</span></div>
          <div v-else-if="!featuredLoaded" class="empty compact-empty">尚未加载图片，请点击“加载图片”。</div>
          <div v-else-if="!filteredFeaturedCandidates.length" class="empty compact-empty">没有符合条件的图片。</div>
          <div v-else class="picker-grid">
            <button
              v-for="photo in filteredFeaturedCandidates"
              :key="photo.id"
              type="button"
              class="picker-tile"
              :class="{ 'picker-tile--active': isFeatured(photo) }"
              :aria-pressed="isFeatured(photo)"
              :aria-label="`${isFeatured(photo) ? '取消精选' : '设为精选'}：${photo.caption || '照片'}`"
              :disabled="featuredSaving || featuredToggling.has(String(photo.id))"
              @click="toggleFeatured(photo)"
            >
              <img :src="photo.thumbUrl || photo.url" :alt="photo.caption || '照片'" loading="lazy" decoding="async" />
              <span v-if="isFeatured(photo)" class="picker-badge"><UIcon name="i-carbon-star-filled" /></span>
            </button>
          </div>
          <p v-if="featuredLoaded" class="muted" role="status">已加载 {{ featuredCandidates.length }} 张 · 待保存 {{ featuredChanges }} 项；再次点击照片可取消精选。</p>
          <div class="modal-actions"><UButton icon="i-carbon-save" :loading="featuredSaving" :disabled="!featuredLoaded" @click="saveFeatured">保存精选设置</UButton></div>
        </section>
      </div>
    </UModal>

    <UModal
      v-model="showDelete"
      :ui="{ container: 'fixed top-0 left-0 right-0 bottom-0 flex justify-center items-center backdrop-blur' }"
    >
      <div class="delete-panel bg-white dark:bg-neutral-800">
        <div class="flex items-start justify-between gap-4">
          <div><h2>从图集移除</h2><p class="muted">此操作需要再次确认。</p></div>
          <UButton color="gray" variant="ghost" icon="i-carbon-close" aria-label="取消删除照片" @click="showDelete = false" />
        </div>
        <div v-if="deleteTarget" class="delete-preview">
          <img :src="deleteTarget.thumbUrl || deleteTarget.url" :alt="deleteTarget.caption || '待删除照片'" />
        </div>
        <p v-if="deleteTarget?.caption" class="delete-caption">{{ deleteTarget.caption }}</p>
        <p class="muted">照片将移出图集「{{ deleteAlbum?.name }}」；未被动态引用的上传文件会移入媒体回收站，可在文件管理中恢复，原动态与其他用户的文件不受影响。</p>
        <div class="modal-actions">
          <UButton color="gray" variant="soft" @click="showDelete = false">取消</UButton>
          <UButton color="red" icon="i-carbon-trash-can" :loading="deleteSaving" @click="confirmDelete">确认移除</UButton>
        </div>
      </div>
    </UModal>
  </main>
</template>

<script setup lang="ts">
import { toast } from 'vue-sonner'
import type { PhotoAlbumPageVO, PhotoAlbumVO, PhotoVO, PhotoWallVO, UserVO } from '~/types'
import { useGlobalState } from '~/store'
import { uploadFile } from '~/utils/upload'

interface AlbumViewState {
  photos: PhotoVO[]
  page: number
  hasNext: boolean
  loading: boolean
  expanded: boolean
  error: string
}

const currentUser = useState<UserVO | null>('userinfo', () => null)
const global = useGlobalState()
const authUser = computed(() => global?.value?.userinfo ?? {})
const isAdmin = computed(() => Boolean(authUser.value.token) && Number(authUser.value.id ?? currentUser.value?.id) === 1)
const wall = reactive<PhotoWallVO>({ today: [], featured: [], albums: [] })
const loading = ref(true)
const wallError = ref('')
const managing = ref(false)
const featuredIndex = ref(0)
const albumStates = reactive<Record<number, AlbumViewState>>({})

const showAdmin = ref(false)
const uploadAlbumId = ref<number>()
const uploadFiles = ref<File[]>([])
const uploadDirectUrls = ref('')
const directUrlList = computed(() => uploadDirectUrls.value.split(/[\n,，;；\s]+/).map(item => item.trim()).filter(Boolean))
const uploadCaption = ref('')
const photoSaving = ref(false)
const albumSaving = ref(false)
const albumEditorId = ref(0)
const albumEditor = reactive({ name: '', description: '' })
const featuredCandidates = ref<PhotoVO[]>([])
const featuredKeyword = ref('')
const featuredLoading = ref(false)
const featuredLoaded = ref(false)
const featuredPage = ref(0)
const featuredHasNext = ref(false)
const featuredSaving = ref(false)
const featuredToggling = ref(new Set<string>())
const originalFeatured = ref(new Map<string, boolean>())

const showDelete = ref(false)
const deleteTarget = ref<PhotoVO | null>(null)
const deleteAlbum = ref<PhotoAlbumVO | null>(null)
const deleteSaving = ref(false)
const uploadInputKey = ref(0)
const uploadPendingUrls = ref<string[]>([])
const uploadPendingAlbumId = ref<number | null>(null)

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
const featuredChanges = computed(() => featuredCandidates.value.filter(photo => originalFeatured.value.get(String(photo.id)) !== Boolean(photo.featured)).length)

const loadWall = async () => {
  loading.value = true
  wallError.value = ''
  try {
    const result = await useMyFetch<PhotoWallVO>('/photo/wall')
    Object.assign(wall, result)
    for (const id of Object.keys(albumStates)) delete albumStates[Number(id)]
    for (const album of wall.albums) {
      albumStates[album.id] = {
        photos: [...(album.photos || [])], page: 0,
        hasNext: Number(album.count || 0) > (album.photos || []).length,
        loading: false, expanded: false, error: '',
      }
    }
    featuredIndex.value = Math.min(featuredIndex.value, Math.max(0, wall.featured.length - 1))
  } catch (error: any) {
    wallError.value = error?.message || '照片墙加载失败，请重试'
    toast.error(wallError.value)
  } finally {
    loading.value = false
  }
}

onMounted(loadWall)

const albumState = (id: number) => albumStates[id] || { photos: [], page: 0, hasNext: false, loading: false, expanded: false, error: '' }
const visiblePhotos = (album: PhotoAlbumVO) => albumState(album.id).expanded ? albumState(album.id).photos : (album.photos || [])
const albumHasMore = (album: PhotoAlbumVO) => albumState(album.id).hasNext || (!albumState(album.id).expanded && Number(album.count || 0) > visiblePhotos(album).length)

const loadMore = async (album: PhotoAlbumVO) => {
  const state = albumStates[album.id]
  if (!state || state.loading) return
  // 收起后再次展开：已加载过的照片还在，直接还原，不必重新请求
  if (!state.expanded && state.photos.length > (album.photos || []).length) {
    state.expanded = true
    return
  }
  if (!state.hasNext) return
  state.loading = true
  state.error = ''
  const nextPage = state.page + 1
  try {
    const result = await useMyFetch<PhotoAlbumPageVO>('/photo/album', { id: album.id, page: nextPage, size: 60 })
    const known = new Set(state.photos.map(photo => String(photo.id)))
    const fresh = (result.list || []).filter(photo => !known.has(String(photo.id)))
    state.photos = state.expanded ? [...state.photos, ...fresh] : (result.list || [])
    state.page = nextPage
    state.hasNext = Boolean(result.hasNext) && fresh.length > 0
    state.expanded = true
  } catch (error: any) {
    state.error = error?.message || '图集加载失败，请重试'
    toast.error(state.error)
  } finally {
    state.loading = false
  }
}

const collapseAlbum = (album: PhotoAlbumVO) => {
  const state = albumStates[album.id]
  if (state) state.expanded = false
}

const formatDate = (value?: string) => value ? new Date(value).toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' }) : ''
const selectPhoto = (value: FileList | Event) => {
  const files = typeof FileList !== 'undefined' && value instanceof FileList
    ? value
    : ((value as Event).target as HTMLInputElement | null)?.files
  if (files) uploadFiles.value = [...uploadFiles.value, ...Array.from(files)]
  uploadInputKey.value++
}

const savePhoto = async () => {
  const albumId = uploadAlbumId.value
  if (!albumId) return toast.warning('请选择图集')
  if (uploadPendingUrls.value.length && uploadPendingAlbumId.value !== albumId) return toast.warning('请切回原图集完成待加入的照片')
  if (!uploadPendingUrls.value.length && !uploadFiles.value.length && !directUrlList.value.length) return toast.warning('请选择本地图片或填写图片直链')
  const invalid = directUrlList.value.find(item => !/^https?:\/\//i.test(item))
  if (invalid) return toast.warning(`图片直链格式无效：${invalid}`)
  photoSaving.value = true
  let saved = 0
  try {
    if (uploadFiles.value.length) {
      const failed: File[] = []
      for (const file of uploadFiles.value) {
        try {
          uploadPendingUrls.value.push(await uploadFile(file))
          uploadPendingAlbumId.value = albumId
        } catch (error: any) {
          failed.push(file)
          toast.error(`${file.name} 上传失败：${error?.message || '请重试'}`)
        }
      }
      uploadFiles.value = failed
    }
    if (directUrlList.value.length) {
      uploadPendingUrls.value.push(...directUrlList.value)
      uploadPendingAlbumId.value = albumId
      uploadDirectUrls.value = ''
    }
    while (uploadPendingUrls.value.length) {
      const url = uploadPendingUrls.value[0]
      await useMyFetch('/admin/photo/album/add', { albumId, url, caption: uploadCaption.value })
      uploadPendingUrls.value.shift()
      saved++
    }
    uploadPendingAlbumId.value = null
    if (!uploadFiles.value.length) uploadCaption.value = ''
    if (uploadFiles.value.length) toast.warning(`已加入 ${saved} 张，另有 ${uploadFiles.value.length} 个文件上传失败，可重试`)
    else toast.success(`${saved} 张照片已加入图集`)
  } catch (error: any) {
    toast.error(`${saved ? `已加入 ${saved} 张；` : ''}剩余 ${uploadPendingUrls.value.length} 张待重试：${error?.message || '照片保存失败'}`)
  } finally {
    photoSaving.value = false
    if (saved) await loadWall()
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
  if (featuredLoaded.value || featuredLoading.value) return
  await loadMoreFeaturedCandidates()
}

const loadMoreFeaturedCandidates = async () => {
  if (featuredLoading.value || featuredSaving.value || (featuredLoaded.value && !featuredHasNext.value)) return
  featuredLoading.value = true
  const nextPage = featuredPage.value + 1
  try {
    const result = await useMyFetch<{ list: PhotoVO[], hasNext: boolean }>('/photo/all', { page: nextPage, size: 60 })
    const known = new Set(featuredCandidates.value.map(photo => String(photo.id)))
    const fresh = (result.list || []).filter(photo => !known.has(String(photo.id)))
    featuredCandidates.value.push(...fresh)
    for (const photo of fresh) originalFeatured.value.set(String(photo.id), Boolean(photo.featured))
    featuredPage.value = nextPage
    featuredHasNext.value = Boolean(result.hasNext) && fresh.length > 0
    featuredLoaded.value = true
  } catch (error: any) {
    toast.error(error?.message || '图片加载失败，请重试')
  } finally {
    featuredLoading.value = false
  }
}

const isFeatured = (photo: PhotoVO) => Boolean(photo.featured)
const toggleFeatured = (photo: PhotoVO) => {
  const key = String(photo.id)
  if (featuredSaving.value || featuredToggling.value.has(key)) return
  photo.featured = !photo.featured
}

const saveFeatured = async () => {
  if (featuredSaving.value) return
  const changed = featuredCandidates.value.filter(photo => originalFeatured.value.get(String(photo.id)) !== Boolean(photo.featured))
  if (!changed.length) return toast.info('精选设置没有变化')
  featuredSaving.value = true
  let saved = 0
  try {
    for (const photo of changed) {
      const itemId = photo.albumItemId ?? (photo.sourceType === 'upload' ? photo.sourceId : null)
      if (!itemId && !photo.memoId) throw new Error('存在无法保存的精选图片')
      const key = String(photo.id)
      featuredToggling.value.add(key)
      await useMyFetch('/admin/photo/featured/set', itemId
        ? { id: itemId, featured: Boolean(photo.featured) }
        : { memoId: photo.memoId, sourceIndex: photo.sourceIndex || 0, featured: Boolean(photo.featured) })
      originalFeatured.value.set(key, Boolean(photo.featured))
      saved++
    }
    toast.success('精选设置已保存')
  } catch (error: any) {
    toast.error(`${saved ? `已保存 ${saved} 项；` : ''}剩余 ${featuredChanges.value} 项待重试：${error?.message || '保存失败'}`)
  } finally {
    featuredToggling.value.clear()
    featuredSaving.value = false
    if (saved) await loadWall()
  }
}

const askDelete = (album: PhotoAlbumVO, photo: PhotoVO) => {
  if (!managing.value || !isAdmin.value || album.isDefault || !Number.isInteger(Number(photo.albumItemId)) || Number(photo.albumItemId) <= 0 || deleteSaving.value) return
  deleteAlbum.value = album
  deleteTarget.value = photo
  showDelete.value = true
}

const confirmDelete = async () => {
  const album = deleteAlbum.value
  const photo = deleteTarget.value
  if (!album || !photo?.albumItemId || deleteSaving.value) return
  deleteSaving.value = true
  try {
    const result = await useMyFetch<{ removed: boolean, mediaTrashed: boolean }>('/admin/photo/delete', { albumId: album.id, id: photo.albumItemId })
    toast.success(result?.mediaTrashed ? '照片已移出图集，文件已移入回收站' : '照片已从图集移除')
    deleteTarget.value = null
    deleteAlbum.value = null
    showDelete.value = false
    // 同步移除精选候选里的悬空项，避免管理弹窗中残留已删除照片的选择
    featuredCandidates.value = featuredCandidates.value.filter(item => String(item.albumItemId ?? item.id) !== String(photo.albumItemId))
    originalFeatured.value.delete(String(photo.id))
    await loadWall()
  } catch (error: any) {
    toast.error(error?.message || '照片删除失败')
  } finally {
    deleteSaving.value = false
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
.subtitle, .muted, .album-heading p { color: #737373; font-size: .9rem; margin-top: .35rem; }
.eyebrow { color: #88a943; font-size: .68rem; font-weight: 700; letter-spacing: .16em; margin-bottom: .35rem; }
.section-heading, .album-title { display: flex; align-items: end; justify-content: space-between; gap: 1rem; margin-bottom: 1rem; }
.hero-row { display: flex; align-items: flex-end; justify-content: space-between; gap: 1rem; }
.browse-toolbar { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: .5rem; margin-top: 1rem; padding-left: .8rem; border: 1px solid #e6ead9; border-radius: .6rem; background: #f7faf0; color: #5a6350; font-size: .85rem; }
.count { color: #9ca3af; font-size: .78rem; white-space: nowrap; }
.today-grid, .album-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: .55rem; }
.photo-frame { position: relative; min-width: 0; }
.photo-tile { position: relative; display: block; min-width: 0; aspect-ratio: 1; overflow: hidden; border-radius: .5rem; background: #e5e5e5; }
.photo-tile img { width: 100%; height: 100%; object-fit: cover; transition: transform .25s ease; }
.photo-tile:hover img { transform: scale(1.04); }
.photo-tile span { position: absolute; left: .55rem; bottom: .45rem; color: white; font-size: .7rem; text-shadow: 0 1px 4px #000; }
.photo-tile:focus-visible, .photo-delete:focus-visible, .album-link:focus-visible { outline: 2px solid #78943f; outline-offset: 2px; }
.photo-delete { position: absolute; top: .45rem; right: .45rem; z-index: 2; display: flex; width: 2.75rem; height: 2.75rem; align-items: center; justify-content: center; padding: 0; border: 1px solid rgba(255, 255, 255, .5); border-radius: 9999px; color: #fff; line-height: 1; background: rgba(120, 40, 40, .88); box-shadow: 0 2px 10px rgba(0, 0, 0, .28); cursor: pointer; transition: opacity .2s ease, transform .2s ease, background .2s ease; }
.photo-delete:hover { background: #b91c1c; transform: scale(1.05); }
.photo-delete:disabled { cursor: progress; opacity: .6; }
.album-heading { display: flex; flex-wrap: wrap; align-items: baseline; gap: .5rem; }
.album-heading p { flex-basis: 100%; }
.album-link { display: inline-flex; align-items: center; gap: .25rem; min-height: 2.75rem; color: #55732d; font-size: .85rem; font-weight: 600; text-decoration: none; }
.album-link:hover { text-decoration: underline; text-underline-offset: .2rem; }
.album-footer { display: flex; flex-wrap: wrap; gap: .5rem; margin-top: .75rem; }
.inline-error { margin-top: .5rem; color: #b91c1c; font-size: .82rem; }
.empty-icon { display: block; width: 2rem; height: 2rem; margin: 0 auto .5rem; color: #c3cabc; }
.empty-hint { margin-top: .25rem; color: #b0b6ac; font-size: .82rem; }
.delete-panel { display: flex; flex-direction: column; gap: .8rem; width: min(92vw, 22rem); padding: 1.25rem; border-radius: .5rem; }
.delete-preview { width: 100%; aspect-ratio: 1; overflow: hidden; border-radius: .5rem; background: #e5e5e5; }
.delete-preview img { width: 100%; height: 100%; object-fit: cover; }
.delete-caption { font-size: .9rem; font-weight: 600; word-break: break-all; }
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
:global(.dark) .subtitle, :global(.dark) .muted, :global(.dark) .album-heading p { color: #a1a1aa; }
:global(.dark) .browse-toolbar { border-color: #3f4a33; background: #26301f; color: #cdd6c2; }
:global(.dark) .album-link { color: #bdd783; }
:global(.dark) .inline-error { color: #fca5a5; }
:global(.dark) .empty-icon, :global(.dark) .empty-hint { color: #71717a; }
:global(.dark) .photo-tile, :global(.dark) .picker-tile { background: #3f3f46; }
@media (max-width: 640px) {
  .picker-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
}
@media (max-width: 640px) {
  .photos-content { padding-left: .85rem; padding-right: .85rem; }
  .hero-row { align-items: flex-start; }
  .featured-card { aspect-ratio: 1 / 1.08; }
  .album-grid:not(.album-grid--expanded) { display: flex; overflow-x: auto; scroll-snap-type: x mandatory; padding-bottom: .45rem; }
  .album-grid:not(.album-grid--expanded) .photo-frame { flex: 0 0 31%; scroll-snap-align: start; }
  .album-grid--expanded { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .today-grid { gap: .4rem; }
  .album-title { align-items: center; }
}
@media (prefers-reduced-motion: reduce) { .photo-tile img { transition: none; } .photo-delete { transition: none; } }
</style>
