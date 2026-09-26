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
          <UButton v-if="isAdmin" icon="i-carbon-settings-adjust" color="gray" variant="soft" class="min-h-11 shrink-0" @click="openManagementHome">照片管理</UButton>
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
        <div v-else-if="!wall.albums.length" class="empty"><UIcon name="i-carbon-image" class="empty-icon" aria-hidden="true" /><p>还没有图集</p><p class="empty-hint">照片会在这里慢慢聚起来。</p><UButton v-if="isAdmin" class="mt-4" @click="openCreateAlbum">创建图集</UButton></div>
        <div v-for="album in (wallError ? [] : wall.albums)" :key="album.id" class="album-section">
          <div class="album-title">
            <div class="album-heading">
              <h3>{{ album.name }}</h3>
              <UBadge color="gray" variant="soft" size="xs">{{ album.count || 0 }} 张</UBadge>
              <p v-if="album.description">{{ album.description }}</p>
            </div>
            <UButton v-if="albumHasMore(album)" color="gray" variant="ghost" class="min-h-11" :loading="albumState(album.id).loading" @click="loadMore(album)">
              {{ albumState(album.id).expanded ? '加载更多照片' : '查看全部' }} <UIcon :name="albumState(album.id).expanded ? 'i-carbon-chevron-down' : 'i-carbon-chevron-right'" aria-hidden="true" />
            </UButton>
            <UButton v-else-if="albumState(album.id).expanded" color="gray" variant="ghost" class="min-h-11" @click="collapseAlbum(album)">
              收起 <UIcon name="i-carbon-chevron-up" aria-hidden="true" />
            </UButton>
          </div>
          <MyFancyBox class="album-grid" :class="{ 'album-grid--expanded': albumState(album.id).expanded }">
            <a v-for="photo in visiblePhotos(album)" :key="photo.id" :href="photo.url" class="photo-tile">
              <img :src="photo.thumbUrl || photo.url" :alt="photo.caption || album.name" loading="lazy" decoding="async" />
            </a>
          </MyFancyBox>
          <p v-if="albumState(album.id).error" class="inline-error" role="alert">{{ albumState(album.id).error }}</p>
        </div>
      </section>
    </div>

    <UModal
      v-model="showAdmin"
      :prevent-close="busy"
      :ui="{ width: 'w-[92vw] max-w-[40rem]', padding: 'p-0', container: 'fixed top-0 left-0 right-0 bottom-0 flex justify-center items-center backdrop-blur' }"
    >
      <div class="admin-panel bg-white dark:bg-neutral-800">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <UButton v-if="managementView !== 'home'" color="gray" variant="ghost" size="xs" icon="i-carbon-arrow-left" :disabled="busy" @click="goManagementBack">返回</UButton>
            <h2>{{ managementTitle }}</h2>
            <p class="muted">{{ managementHint }}</p>
          </div>
          <UButton color="gray" variant="ghost" icon="i-carbon-close" aria-label="关闭照片管理" :disabled="busy" @click="showAdmin = false" />
        </div>

        <div v-if="managementView === 'home'" class="flex flex-col gap-2">
          <UButton block color="gray" variant="soft" class="justify-start gap-3 py-3" @click="openAlbumEditor()">
            <UIcon name="i-carbon-add" class="text-lg" aria-hidden="true" />
            <span class="flex min-w-0 flex-1 flex-col items-start"><span class="font-medium">新建图集</span><span class="text-xs opacity-70">为一组照片取个名字</span></span>
            <UIcon name="i-carbon-chevron-right" aria-hidden="true" />
          </UButton>
          <UButton v-if="uploadHasDraft" block color="yellow" variant="soft" class="justify-start gap-3 py-3" @click="resumeUploadDraft">
            <UIcon name="i-carbon-incomplete" class="text-lg" aria-hidden="true" />
            <span class="flex min-w-0 flex-1 flex-col items-start"><span class="font-medium">继续未完成的添加</span><span class="text-xs opacity-70">{{ draftAlbumName }} · {{ draftCount }} 项待处理</span></span>
            <UIcon name="i-carbon-chevron-right" aria-hidden="true" />
          </UButton>

          <p class="muted mt-2 mb-0">选择一个图集来添加或删除照片</p>
          <UButton
            v-for="album in wall.albums"
            :key="album.id"
            block
            color="gray"
            variant="soft"
            class="justify-start gap-3 py-3"
            @click="openManagementAlbum(album)"
          >
            <img v-if="album.photos?.[0]" :src="album.photos[0].thumbUrl || album.photos[0].url" alt="" class="h-12 w-12 shrink-0 rounded object-cover" loading="lazy" />
            <span v-else class="flex h-12 w-12 shrink-0 items-center justify-center rounded bg-gray-200 dark:bg-gray-700"><UIcon name="i-carbon-image" aria-hidden="true" /></span>
            <span class="flex min-w-0 flex-1 flex-col items-start">
              <span class="font-medium">{{ album.name }}</span>
              <span class="text-xs opacity-70">{{ album.isDefault ? '自动汇集动态照片 · 不可修改' : `${album.count || 0} 张照片` }}</span>
            </span>
            <UIcon name="i-carbon-chevron-right" aria-hidden="true" />
          </UButton>

          <UButton block color="gray" variant="soft" class="justify-start gap-3 py-3" @click="managementView = 'featured'">
            <UIcon name="i-carbon-star" class="text-lg" aria-hidden="true" />
            <span class="flex min-w-0 flex-1 flex-col items-start"><span class="font-medium">精选图片</span><span class="text-xs opacity-70">已精选 {{ wall.featured.length }} 张<span v-if="featuredChanges"> · {{ featuredChanges }} 项待保存</span></span></span>
            <UIcon name="i-carbon-chevron-right" aria-hidden="true" />
          </UButton>
        </div>

        <section v-if="managementView === 'album' && selectedAlbum" class="flex flex-col gap-3">
          <div class="flex flex-wrap gap-2">
            <UButton v-if="!selectedAlbum.isDefault" icon="i-carbon-add" @click="openAddPhotos(selectedAlbum)">添加照片</UButton>
            <UButton icon="i-carbon-edit" color="gray" variant="soft" @click="openAlbumEditor(selectedAlbum)">编辑图集信息</UButton>
          </div>
          <p v-if="selectedAlbum.isDefault" class="muted">此图集自动汇集公开动态中的照片，删除请到对应动态处理。</p>

          <template v-else>
            <div v-if="managePhotos.length" class="flex flex-wrap items-center justify-between gap-2 rounded-md bg-gray-50 px-3 py-2 dark:bg-gray-800">
              <UCheckbox
                :model-value="allLoadedSelected"
                :indeterminate="someSelected"
                :disabled="deleteSaving"
                :label="selectionCount ? `已选 ${selectionCount} 张` : `全选（本页 ${managePhotos.length} 张）`"
                @update:model-value="toggleSelectAll"
              />
              <UButton v-if="selectionCount" color="red" icon="i-carbon-trash-can" :disabled="deleteSaving" @click="askDeleteSelected">移除所选 {{ selectionCount }} 张</UButton>
            </div>

            <div v-if="manageLoading && !managePhotos.length" class="loading-notice" role="status"><UIcon name="i-carbon-circle-dash" class="h-5 w-5 animate-spin" aria-hidden="true" /><span>正在加载照片…</span></div>
            <p v-else-if="manageError" class="inline-error" role="alert">{{ manageError }}</p>
            <p v-else-if="!managePhotos.length" class="empty compact-empty">这个图集还没有照片，先添加一些吧。</p>
            <div v-else class="manage-grid">
              <label
                v-for="photo in managePhotos"
                :key="photo.id"
                class="manage-tile"
                :class="{ 'manage-tile--selected': isItemSelected(photo) }"
              >
                <img :src="photo.thumbUrl || photo.url" :alt="photo.caption || '图集照片'" loading="lazy" decoding="async" />
                <span class="manage-tile-check">
                  <UCheckbox
                    :model-value="isItemSelected(photo)"
                    :disabled="deleteSaving"
                    :aria-label="`选择照片${photo.caption ? `：${photo.caption}` : ''}`"
                    @update:model-value="toggleItem(photo)"
                  />
                </span>
              </label>
            </div>
            <UButton v-if="manageHasNext" block color="gray" variant="soft" :loading="manageLoading" :disabled="deleteSaving" @click="loadMoreManagePhotos">加载更多照片</UButton>
          </template>
        </section>

        <form v-if="managementView === 'add' && selectedAlbum && !selectedAlbum.isDefault" class="flex flex-col gap-3" @submit.prevent="savePhoto">
          <p class="muted">照片会加入「{{ selectedAlbum.name }}」，不会自动发布动态。</p>
          <UFormGroup label="本地图片"><UInput :key="uploadInputKey" type="file" accept="image/*" multiple @change="selectPhoto" /></UFormGroup>
          <UFormGroup label="图片直链"><UTextarea v-model="uploadDirectUrls" :rows="2" placeholder="每行一个图片直链，如 https://example.com/a.jpg，可与本地图片混用" /></UFormGroup>
          <UFormGroup label="说明"><UInput v-model="uploadCaption" maxlength="200" placeholder="可选" /></UFormGroup>
          <p class="muted" role="status">待上传 {{ uploadFiles.length }} 个文件、{{ directUrlList.length }} 条图片直链<span v-if="uploadPendingUrls.length">；待加入图集 {{ uploadPendingUrls.length }} 张</span></p>
          <div class="modal-actions"><UButton type="submit" icon="i-carbon-save" :loading="photoSaving" :disabled="photoSaving || (!uploadFiles.length && !directUrlList.length && !uploadPendingUrls.length)">保存照片</UButton></div>
        </form>

        <form v-if="managementView === 'create' || managementView === 'edit'" class="flex flex-col gap-3" @submit.prevent="saveAlbum">
          <UFormGroup label="图集名称" required><UInput v-model="albumEditor.name" maxlength="80" placeholder="例如：城市漫步" /></UFormGroup>
          <UFormGroup label="描述"><UTextarea v-model="albumEditor.description" maxlength="500" placeholder="这一组照片记录了什么？（可选）" /></UFormGroup>
          <div class="modal-actions"><UButton type="submit" icon="i-carbon-save" :loading="albumSaving" :disabled="!albumEditor.name.trim()">保存图集</UButton></div>
        </form>

        <section v-if="managementView === 'featured'" class="flex flex-col gap-3">
          <div class="flex flex-wrap items-center gap-2">
            <UButton v-if="!featuredLoaded" icon="i-carbon-download" color="gray" variant="soft" :loading="featuredLoading" @click="loadFeaturedCandidates">加载图片</UButton>
            <UButton v-else-if="featuredHasNext" icon="i-carbon-download" color="gray" variant="soft" :loading="featuredLoading" @click="loadMoreFeaturedCandidates">加载更多图片</UButton>
            <span v-else class="count">已加载全部图片</span>
            <UInput v-if="featuredLoaded" v-model="featuredKeyword" class="min-w-0 flex-1" placeholder="仅筛选已加载图片" aria-label="筛选已加载图片" />
          </div>
          <div v-if="featuredLoading" class="loading-notice" role="status"><UIcon name="i-carbon-circle-dash" class="h-5 w-5 animate-spin" aria-hidden="true" /><span>正在加载图片，请稍候…</span></div>
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
              <span v-if="isFeatured(photo)" class="picker-badge"><UIcon name="i-carbon-star-filled" aria-hidden="true" /></span>
            </button>
          </div>
          <p v-if="featuredLoaded" class="muted" role="status">已加载 {{ featuredCandidates.length }} 张 · 待保存 {{ featuredChanges }} 项；再次点击照片可取消精选。</p>
          <div class="modal-actions"><UButton icon="i-carbon-save" :loading="featuredSaving" :disabled="!featuredLoaded" @click="saveFeatured">保存精选设置</UButton></div>
        </section>
      </div>
    </UModal>

    <UModal
      v-model="showDelete"
      :prevent-close="deleteSaving"
      :ui="{ width: 'w-[92vw] max-w-[22rem]', padding: 'p-0', container: 'fixed top-0 left-0 right-0 bottom-0 flex justify-center items-center backdrop-blur' }"
    >
      <div class="delete-panel bg-white dark:bg-neutral-800">
        <div class="flex items-start justify-between gap-4">
          <div><h2>从图集移除</h2><p class="muted">{{ selectionCount }} 张照片</p></div>
          <UButton color="gray" variant="ghost" icon="i-carbon-close" aria-label="取消移除照片" :disabled="deleteSaving" @click="showDelete = false" />
        </div>
        <div class="delete-preview">
          <img v-for="photo in pendingDeletePreview" :key="photo.id" :src="photo.thumbUrl || photo.url" :alt="photo.caption || '待移除照片'" />
          <span v-if="selectionCount > pendingDeletePreview.length" class="delete-more">+{{ selectionCount - pendingDeletePreview.length }}</span>
        </div>
        <p class="muted">照片将移出图集「{{ selectedAlbum?.name }}」；未被动态引用的上传文件会移入媒体回收站，可在文件管理中恢复，原动态与其他用户的文件不受影响。</p>
        <UProgress v-if="deleteSaving" :value="deleteDone" :max="selectionCount" size="sm" />
        <p v-if="deleteSaving" class="muted" role="status">正在移除 {{ deleteDone }} / {{ selectionCount }}…</p>
        <div class="modal-actions">
          <UButton color="gray" variant="soft" :disabled="deleteSaving" @click="showDelete = false">取消</UButton>
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

type ManagementView = 'home' | 'create' | 'album' | 'add' | 'edit' | 'featured'

const currentUser = useState<UserVO | null>('userinfo', () => null)
const global = useGlobalState()
const authUser = computed(() => global?.value?.userinfo ?? {})
const isAdmin = computed(() => Boolean(authUser.value.token) && Number(authUser.value.id ?? currentUser.value?.id) === 1)
const wall = reactive<PhotoWallVO>({ today: [], featured: [], albums: [] })
const loading = ref(true)
const wallError = ref('')
const featuredIndex = ref(0)
const albumStates = reactive<Record<number, AlbumViewState>>({})

const showAdmin = ref(false)
const managementView = ref<ManagementView>('home')
const selectedAlbumId = ref<number | null>(null)
const selectedAlbum = computed(() => wall.albums.find(album => album.id === selectedAlbumId.value) || null)

// 照片管理内的删除：只在这里移除照片，照片墙本身只做浏览
const managePhotos = ref<PhotoVO[]>([])
const managePage = ref(0)
const manageHasNext = ref(false)
const manageLoading = ref(false)
const manageError = ref('')
const selectedItems = ref(new Set<number>())
const showDelete = ref(false)
const deleteSaving = ref(false)
const deleteDone = ref(0)

// 添加照片的草稿始终绑定原图集，避免误加入其他图集
const uploadAlbumId = ref<number | null>(null)
const uploadFiles = ref<File[]>([])
const uploadDirectUrls = ref('')
const uploadCaption = ref('')
const uploadInputKey = ref(0)
const uploadPendingUrls = ref<string[]>([])
const uploadPendingAlbumId = ref<number | null>(null)
const photoSaving = ref(false)
const directUrlList = computed(() => uploadDirectUrls.value.split(/[\n,，;；\s]+/).map(item => item.trim()).filter(Boolean))

const albumSaving = ref(false)
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

const busy = computed(() => photoSaving.value || albumSaving.value || featuredSaving.value || deleteSaving.value)
const uploadHasDraft = computed(() => Boolean(uploadFiles.value.length || directUrlList.value.length || uploadPendingUrls.value.length))
const draftCount = computed(() => uploadFiles.value.length + directUrlList.value.length + uploadPendingUrls.value.length)
const draftAlbumName = computed(() => wall.albums.find(album => album.id === uploadAlbumId.value)?.name || '原图集')
const selectionCount = computed(() => selectedItems.value.size)
const pendingDeletePreview = computed(() => managePhotos.value.filter(photo => hasItemId(photo) && selectedItems.value.has(Number(photo.albumItemId))).slice(0, 4))
const allLoadedSelected = computed(() => {
  const ids = managePhotos.value.filter(hasItemId).map(photo => Number(photo.albumItemId))
  return ids.length > 0 && ids.every(id => selectedItems.value.has(id))
})
const someSelected = computed(() => selectionCount.value > 0 && !allLoadedSelected.value)
const featuredChanges = computed(() => featuredCandidates.value.filter(photo => originalFeatured.value.get(String(photo.id)) !== Boolean(photo.featured)).length)
const filteredFeaturedCandidates = computed(() => {
  const keyword = featuredKeyword.value.trim().toLowerCase()
  if (!keyword) return featuredCandidates.value
  return featuredCandidates.value.filter(photo => String(photo.caption || '').toLowerCase().includes(keyword))
})

const managementTitle = computed(() => {
  if (managementView.value === 'create') return '新建图集'
  if (managementView.value === 'featured') return '精选图片'
  if (managementView.value === 'album') return selectedAlbum.value?.name || '图集'
  if (managementView.value === 'add') return '添加照片'
  if (managementView.value === 'edit') return '编辑图集信息'
  return '照片管理'
})
const managementHint = computed(() => {
  if (managementView.value === 'home') return '先选择图集，再添加或移除照片。'
  if (managementView.value === 'featured') return '选择要展示在照片墙上的图片，完成后记得保存。'
  if (managementView.value === 'album') return selectedAlbum.value?.isDefault ? '动态照片自动汇集，只能浏览。' : `共 ${selectedAlbum.value?.count || 0} 张，勾选后可批量移除。`
  if (managementView.value === 'add') return `照片会加入「${selectedAlbum.value?.name || '图集'}」，可以同时上传本地图片和图片直链。`
  return managementView.value === 'create' ? '先创建图集，再添加照片。' : '修改当前图集的名称和描述。'
})

const hasItemId = (photo: PhotoVO) => Number.isInteger(Number(photo.albumItemId)) && Number(photo.albumItemId) > 0

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
    if (selectedAlbumId.value && !selectedAlbum.value) {
      selectedAlbumId.value = null
      if (managementView.value !== 'create' && managementView.value !== 'featured') managementView.value = 'home'
      toast.warning('当前图集已不存在，请重新选择')
    }
    if (uploadAlbumId.value && !wall.albums.some(album => album.id === uploadAlbumId.value)) {
      uploadAlbumId.value = null
      toast.warning('待加入照片所属的图集已不存在，请重新选择图集')
    }
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

// ---- 照片管理：导航 ----
const openManagementHome = () => {
  managementView.value = 'home'
  showAdmin.value = true
}
const openCreateAlbum = () => {
  selectedAlbumId.value = null
  albumEditor.name = ''
  albumEditor.description = ''
  managementView.value = 'create'
  showAdmin.value = true
}
const openManagementAlbum = async (album: PhotoAlbumVO) => {
  if (busy.value) return
  selectedAlbumId.value = album.id
  managementView.value = 'album'
  await loadManagePhotos(album)
}
const openAddPhotos = (album: PhotoAlbumVO) => {
  if (album.isDefault || busy.value) return
  if (uploadHasDraft.value && uploadAlbumId.value !== album.id) {
    toast.warning(`请先完成「${draftAlbumName.value}」的待加入照片`)
    return
  }
  selectedAlbumId.value = album.id
  uploadAlbumId.value = album.id
  managementView.value = 'add'
}
const resumeUploadDraft = () => {
  const album = wall.albums.find(item => item.id === uploadAlbumId.value)
  if (album) openAddPhotos(album)
  else toast.error('原图集已不存在，请重新选择图集')
}
const openAlbumEditor = (album?: PhotoAlbumVO) => {
  if (album?.isDefault || busy.value) return
  selectedAlbumId.value = album?.id ?? null
  albumEditor.name = album?.name || ''
  albumEditor.description = album?.description || ''
  managementView.value = album ? 'edit' : 'create'
}
const goManagementBack = () => {
  if (busy.value) return
  if (managementView.value === 'add' || managementView.value === 'edit') managementView.value = selectedAlbum.value ? 'album' : 'home'
  else managementView.value = 'home'
}

// ---- 照片管理：图集内的照片与多选 ----
const loadManagePhotos = async (album: PhotoAlbumVO, append = false) => {
  if (manageLoading.value) return
  manageLoading.value = true
  manageError.value = ''
  const nextPage = append ? managePage.value + 1 : 1
  if (!append) {
    managePhotos.value = []
    selectedItems.value = new Set()
  }
  try {
    const result = await useMyFetch<PhotoAlbumPageVO>('/photo/album', { id: album.id, page: nextPage, size: 60 })
    const known = new Set(managePhotos.value.map(photo => String(photo.id)))
    const fresh = (result.list || []).filter(photo => !known.has(String(photo.id)))
    managePhotos.value = append ? [...managePhotos.value, ...fresh] : (result.list || [])
    managePage.value = nextPage
    manageHasNext.value = Boolean(result.hasNext) && fresh.length > 0
  } catch (error: any) {
    manageError.value = error?.message || '照片加载失败，请重试'
    toast.error(manageError.value)
  } finally {
    manageLoading.value = false
  }
}
const loadMoreManagePhotos = async () => {
  if (!selectedAlbum.value || !manageHasNext.value) return
  await loadManagePhotos(selectedAlbum.value, true)
}
const isItemSelected = (photo: PhotoVO) => hasItemId(photo) && selectedItems.value.has(Number(photo.albumItemId))
const toggleItem = (photo: PhotoVO) => {
  if (deleteSaving.value || !hasItemId(photo)) return
  const id = Number(photo.albumItemId)
  const next = new Set(selectedItems.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  selectedItems.value = next
}
const toggleSelectAll = () => {
  if (deleteSaving.value) return
  if (allLoadedSelected.value) selectedItems.value = new Set()
  else selectedItems.value = new Set(managePhotos.value.filter(hasItemId).map(photo => Number(photo.albumItemId)))
}
const askDeleteSelected = () => {
  if (!selectionCount.value || deleteSaving.value) return
  showDelete.value = true
}

const confirmDelete = async () => {
  const album = selectedAlbum.value
  const ids = [...selectedItems.value]
  if (!album || album.isDefault || !ids.length || deleteSaving.value) return
  deleteSaving.value = true
  deleteDone.value = 0
  let trashed = 0
  const failed: number[] = []
  for (const id of ids) {
    try {
      const result = await useMyFetch<{ removed: boolean, mediaTrashed: boolean }>('/admin/photo/delete', { albumId: album.id, id })
      if (result?.mediaTrashed) trashed++
      managePhotos.value = managePhotos.value.filter(photo => Number(photo.albumItemId) !== id)
      // 同步移除精选候选里的悬空项，避免管理弹窗残留已删除照片
      featuredCandidates.value = featuredCandidates.value.filter(item => Number(item.albumItemId) !== id)
    } catch {
      failed.push(id)
    }
    deleteDone.value += 1
  }
  deleteSaving.value = false
  showDelete.value = false
  const removed = ids.length - failed.length
  if (failed.length) toast.error(`已移除 ${removed} 张，${failed.length} 张失败，可重新选择后重试`)
  else toast.success(trashed ? `已移除 ${removed} 张，其中 ${trashed} 张文件移入回收站` : `已从图集移除 ${removed} 张`)
  await loadWall()
  // 重新拉取列表会重置选中集，因此必须在拉取之后再恢复失败项，否则"可重试"是空话
  if (selectedAlbum.value) await loadManagePhotos(selectedAlbum.value)
  selectedItems.value = new Set(failed)
}

// ---- 添加照片 ----
const selectPhoto = (value: FileList | Event) => {
  const files = typeof FileList !== 'undefined' && value instanceof FileList
    ? value
    : ((value as Event).target as HTMLInputElement | null)?.files
  if (files) uploadFiles.value = [...uploadFiles.value, ...Array.from(files)]
  uploadInputKey.value++
}

const savePhoto = async () => {
  const albumId = selectedAlbumId.value
  if (!isAdmin.value || managementView.value !== 'add' || !albumId || selectedAlbum.value?.isDefault || photoSaving.value) return
  if (uploadAlbumId.value !== albumId || (uploadPendingUrls.value.length && uploadPendingAlbumId.value !== albumId)) return toast.warning('请回到原图集完成待加入的照片')
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
    if (uploadFiles.value.length) toast.warning(`已加入「${selectedAlbum.value?.name || '图集'}」${saved} 张，另有 ${uploadFiles.value.length} 个文件上传失败，可重试`)
    else toast.success(`${saved} 张照片已加入「${selectedAlbum.value?.name || '图集'}」`)
  } catch (error: any) {
    toast.error(`${saved ? `已加入 ${saved} 张；` : ''}剩余 ${uploadPendingUrls.value.length} 张待重试：${error?.message || '照片保存失败'}`)
  } finally {
    photoSaving.value = false
    if (saved) await loadWall()
  }
}

const saveAlbum = async () => {
  const editing = managementView.value === 'edit'
  if (!isAdmin.value || albumSaving.value || (!editing && managementView.value !== 'create')) return
  if (editing && (!selectedAlbum.value || selectedAlbum.value.isDefault)) return
  const name = albumEditor.name.trim()
  if (!name) return toast.warning('请填写图集名称')
  albumSaving.value = true
  try {
    await useMyFetch('/admin/photo/album/save', { id: editing ? selectedAlbumId.value : undefined, name, description: albumEditor.description })
    toast.success(editing ? `「${name}」图集信息已保存` : `图集「${name}」已创建`)
    await loadWall()
    // 创建接口不返回图集 ID；不能凭同名图集猜测身份，返回列表由管理员选择。
    if (!editing) selectedAlbumId.value = null
    managementView.value = editing && selectedAlbum.value ? 'album' : 'home'
  } catch (error: any) {
    toast.error(error?.message || '图集保存失败')
  } finally {
    albumSaving.value = false
  }
}

// ---- 精选图片 ----
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

const formatDate = (value?: string) => value ? new Date(value).toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' }) : ''

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
.count { color: #9ca3af; font-size: .78rem; white-space: nowrap; }
.today-grid, .album-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: .55rem; }
.photo-tile { position: relative; display: block; min-width: 0; aspect-ratio: 1; overflow: hidden; border-radius: .5rem; background: #e5e5e5; }
.photo-tile img { width: 100%; height: 100%; object-fit: cover; transition: transform .25s ease; }
.photo-tile:hover img { transform: scale(1.04); }
.photo-tile:focus-visible { outline: 2px solid #78943f; outline-offset: 2px; }
.photo-tile span { position: absolute; left: .55rem; bottom: .45rem; color: white; font-size: .7rem; text-shadow: 0 1px 4px #000; }
.album-heading { display: flex; flex-wrap: wrap; align-items: baseline; gap: .5rem; }
.album-heading p { flex-basis: 100%; margin-top: 0; }
.inline-error { margin-top: .5rem; color: #b91c1c; font-size: .82rem; }
.empty-icon { display: block; width: 2rem; height: 2rem; margin: 0 auto .5rem; color: #c3cabc; }
.empty-hint { margin-top: .25rem; color: #b0b6ac; font-size: .82rem; }
.featured-card { position: relative; display: block; overflow: hidden; border-radius: .5rem; background: #222; aspect-ratio: 4 / 3; box-shadow: 0 16px 32px rgba(0, 0, 0, .14); }
.featured-card img { width: 100%; height: 100%; object-fit: cover; }
.featured-caption { position: absolute; inset: auto 0 0; padding: 2.5rem 1rem .85rem; color: #fff; background: linear-gradient(transparent, rgba(0, 0, 0, .72)); font-size: .75rem; }
.featured-caption p { margin-top: .3rem; font-size: .9rem; }
.album-section { margin-bottom: 2rem; }
.status, .empty { padding: 2.5rem 0; text-align: center; color: #9ca3af; }
.admin-panel { display: flex; flex-direction: column; gap: 1rem; width: 100%; min-width: 0; box-sizing: border-box; max-height: 88vh; overflow-y: auto; padding: 1.25rem; border-radius: .5rem; }
.modal-actions { display: flex; justify-content: flex-end; gap: .5rem; }
.loading-notice { display: flex; min-height: 5rem; align-items: center; justify-content: center; gap: .5rem; color: #737373; font-size: .9rem; }
.compact-empty { padding: 1.5rem 0; }
.manage-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: .5rem; }
.manage-tile { position: relative; display: block; aspect-ratio: 1; overflow: hidden; border-radius: .5rem; background: #e5e5e5; cursor: pointer; box-shadow: inset 0 0 0 2px transparent; }
.manage-tile img { width: 100%; height: 100%; object-fit: cover; }
.manage-tile--selected { box-shadow: inset 0 0 0 2px #78943f; }
.manage-tile--selected img { opacity: .72; }
.manage-tile-check { position: absolute; top: .3rem; left: .3rem; z-index: 1; }
.picker-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: .5rem; max-height: 60vh; overflow-y: auto; padding: .25rem; }
.picker-tile { position: relative; display: block; aspect-ratio: 1; overflow: hidden; border-radius: .5rem; background: #e5e5e5; border: 2px solid transparent; cursor: pointer; }
.picker-tile img { width: 100%; height: 100%; object-fit: cover; }
.picker-tile--active { border-color: #88a943; }
.picker-tile:disabled { cursor: progress; }
.picker-badge { position: absolute; top: .25rem; right: .25rem; color: #ffd54f; font-size: 1rem; text-shadow: 0 1px 4px #000; }
.delete-panel { display: flex; flex-direction: column; gap: .8rem; width: 100%; min-width: 0; box-sizing: border-box; padding: 1.25rem; border-radius: .5rem; }
.delete-preview { position: relative; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: .3rem; }
.delete-preview img { width: 100%; aspect-ratio: 1; object-fit: cover; border-radius: .35rem; background: #e5e5e5; }
.delete-more { position: absolute; right: .3rem; bottom: .3rem; padding: 0 .35rem; border-radius: .3rem; color: #fff; background: rgba(0, 0, 0, .62); font-size: .75rem; }
.delete-panel .count, .delete-panel .muted { margin-top: 0; }
:global(.dark) .subtitle, :global(.dark) .muted, :global(.dark) .album-heading p { color: #a1a1aa; }
:global(.dark) .inline-error { color: #fca5a5; }
:global(.dark) .empty-icon, :global(.dark) .empty-hint { color: #71717a; }
:global(.dark) .photo-tile, :global(.dark) .picker-tile, :global(.dark) .manage-tile { background: #3f3f46; }
@media (max-width: 640px) {
  .manage-grid, .picker-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
}
@media (max-width: 640px) {
  .photos-content { padding-left: .85rem; padding-right: .85rem; }
  .hero-row { align-items: flex-start; }
  .featured-card { aspect-ratio: 1 / 1.08; }
  .album-grid:not(.album-grid--expanded) { display: flex; overflow-x: auto; scroll-snap-type: x mandatory; padding-bottom: .45rem; }
  .album-grid:not(.album-grid--expanded) .photo-tile { flex: 0 0 31%; scroll-snap-align: start; }
  .album-grid--expanded { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .today-grid { gap: .4rem; }
  .album-title { align-items: center; }
}
@media (prefers-reduced-motion: reduce) { .photo-tile img { transition: none; } }
</style>
