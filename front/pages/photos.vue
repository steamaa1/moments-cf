<template>
  <main class="photos-page px-4 pb-12" aria-labelledby="photos-title">
    <Header :user="currentUser" />
    <section class="hero mb-8">
      <p class="eyebrow">VISUAL JOURNAL</p>
      <div class="flex items-end justify-between gap-4">
        <div><h1 id="photos-title">照片墙</h1><p class="subtitle">把值得记住的光影，留在这里。</p></div>
        <UButton v-if="isAdmin" icon="i-carbon-add" color="primary" size="lg" class="min-h-11 shadow-sm" aria-label="添加照片或图集" @click="showAdmin = true">添加照片</UButton>
      </div>
    </section>

    <section v-if="wall.today.length" class="mb-10" aria-labelledby="today-title">
      <div class="section-heading"><div><p class="eyebrow">MEMORY RETURNS</p><h2 id="today-title">历史上的今天</h2></div><span class="count">{{ wall.today.length }} 张</span></div>
      <div class="today-grid"><button v-for="photo in wall.today" :key="photo.id" class="photo-tile" @click="openPhoto(photo)"><img :src="photo.thumbUrl" :alt="photo.caption || '历史照片'" loading="lazy" /><span>{{ formatDate(photo.createdAt) }}</span></button></div>
    </section>

    <section v-if="wall.featured.length" class="mb-10" aria-labelledby="featured-title">
      <div class="section-heading"><div><p class="eyebrow">CURATED</p><h2 id="featured-title">精选图片</h2></div><div class="flex gap-2"><UButton aria-label="上一张精选图片" icon="i-carbon-arrow-left" color="gray" variant="soft" :disabled="featuredIndex === 0" @click="featuredIndex--" /><UButton aria-label="下一张精选图片" icon="i-carbon-arrow-right" color="gray" variant="soft" :disabled="featuredIndex >= wall.featured.length - 1" @click="featuredIndex++" /></div></div>
      <div class="featured-card"><img :src="wall.featured[featuredIndex]?.url" :alt="wall.featured[featuredIndex]?.caption || '精选图片'" loading="lazy" decoding="async" /><div class="featured-caption"><span>精选 {{ featuredIndex + 1 }} / {{ wall.featured.length }}</span><p v-if="wall.featured[featuredIndex]?.caption">{{ wall.featured[featuredIndex].caption }}</p></div></div>
    </section>

    <section aria-labelledby="albums-title"><div class="section-heading"><div><p class="eyebrow">COLLECTIONS</p><h2 id="albums-title">所有图集</h2></div></div><div v-if="loading" class="status">正在加载照片…</div><div v-else-if="!wall.albums.length" class="empty">还没有图集。</div><div v-for="album in wall.albums" :key="album.id" class="album-section"><div class="album-title"><div><h3>{{ album.name }}</h3><p v-if="album.description">{{ album.description }}</p></div><UButton variant="ghost" color="gray" @click="viewAll(album)">查看全部 <UIcon name="i-carbon-arrow-right" /></UButton></div><div class="album-grid"><button v-for="photo in (album.photos || []).slice(0, 9)" :key="photo.id" class="photo-tile" @click="openPhoto(photo)"><img :src="photo.thumbUrl" :alt="photo.caption || album.name" loading="lazy" /></button></div></div></section>

    <UModal v-model="showAdmin"><div class="admin-panel"><h2>照片管理</h2><p class="muted">基础管理入口，按后端契约调用。</p><UFormGroup label="新建图集"><UInput v-model="newAlbum.name" placeholder="图集名称" /></UFormGroup><UTextarea v-model="newAlbum.description" placeholder="描述（可选）" /><UButton :loading="adminLoading" @click="saveAlbum">新建图集</UButton><div class="admin-divider" /><UFormGroup label="上传到图集"><USelectMenu v-model="uploadAlbumId" :options="wall.albums.filter(a => !a.isDefault).map(a => ({ label: a.name, value: a.id }))" value-attribute="value" option-attribute="label" placeholder="选择图集" /><UInput type="file" accept="image/*" @change="uploadPhoto" /></UFormGroup><p class="muted">上传后可通过后台接口设置精选；移除图集图片不会删除媒体文件。</p><UFormGroup label="精选动态图片"><div class="flex gap-2"><UInput v-model="featuredMemoId" type="number" placeholder="动态 ID"/><UInput v-model="featuredIndexInput" type="number" placeholder="图片序号"/><UButton size="sm" @click="setFeatured">设为精选</UButton></div></UFormGroup></div></UModal>
    <UModal v-model="lightbox"><div class="lightbox"><img v-if="selectedPhoto" :src="selectedPhoto.url" :alt="selectedPhoto.caption || '照片'" /><p v-if="selectedPhoto?.caption">{{ selectedPhoto.caption }}</p></div></UModal>
  </main>
</template>

<script setup lang="ts">
import { toast } from 'vue-sonner'
import type { PhotoAlbumVO, PhotoVO, PhotoWallVO, UserVO } from '~/types'
import { useGlobalState } from '~/store'
import { useUpload } from '~/utils'

const currentUser = useState<UserVO | null>('userinfo', () => null)
const global = useGlobalState()
const authUser = computed(() => global?.value?.userinfo ?? {})
const isAdmin = computed(() => Boolean(authUser.value.token) && Number(authUser.value.id ?? currentUser.value?.id) === 1)
const wall = reactive<PhotoWallVO>({ today: [], featured: [], albums: [] }); const loading = ref(true); const featuredIndex = ref(0)
const lightbox = ref(false); const selectedPhoto = ref<PhotoVO | null>(null); const showAdmin = ref(false); const adminLoading = ref(false); const uploadAlbumId = ref<number>(); const featuredMemoId = ref<number>(); const featuredIndexInput = ref(0); const newAlbum = reactive({ name: '', description: '' })
const loadWall = async () => { loading.value = true; try { Object.assign(wall, await useMyFetch<PhotoWallVO>('/photo/wall')) } catch (e: any) { toast.error(e?.message || '照片墙加载失败') } finally { loading.value = false } }
onMounted(loadWall)
const openPhoto = (photo: PhotoVO) => { selectedPhoto.value = photo; lightbox.value = true }
const formatDate = (value?: string) => value ? new Date(value).toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' }) : ''
const viewAll = async (album: PhotoAlbumVO) => await navigateTo(`/photos/album/${album.id}`)
const saveAlbum = async () => { if (!newAlbum.name.trim()) return toast.warning('请填写图集名称'); adminLoading.value = true; try { await useMyFetch('/admin/photo/album/save', newAlbum); toast.success('图集已创建'); newAlbum.name = ''; newAlbum.description = ''; await loadWall() } finally { adminLoading.value = false } }
const uploadPhoto = async (files: FileList | Event) => { const list = typeof FileList !== 'undefined' && files instanceof FileList ? files : (files.target as HTMLInputElement)?.files; if (!uploadAlbumId.value || !list?.length) return toast.warning('请先选择图集'); const urls = await useUpload(list); for (const url of urls || []) await useMyFetch('/admin/photo/album/add', { albumId: uploadAlbumId.value, url }); toast.success('图片已加入图集'); await loadWall() }
const setFeatured = async () => { if (!featuredMemoId.value) return toast.warning('请输入动态 ID'); await useMyFetch('/admin/photo/featured/set', { memoId: featuredMemoId.value, sourceIndex: featuredIndexInput.value, featured: true, sortOrder: 0 }); toast.success('已设为精选'); featuredMemoId.value = undefined; await loadWall() }
useHead({ title: '照片墙', meta: [{ name: 'description', content: '浏览历史上的今天、精选图片与所有照片图集。' }, { property: 'og:title', content: '照片墙' }, { property: 'og:type', content: 'website' }] })
</script>

<style scoped>
.photos-page { min-height: 100vh; background: linear-gradient(180deg, rgba(159,200,74,.08), transparent 28rem); }
.hero { padding-top: 1rem; } h1 { font-size: 2.15rem; font-weight: 750; letter-spacing: -.04em; } h2 { font-size: 1.35rem; font-weight: 700; } h3 { font-size: 1.08rem; font-weight: 700; }.subtitle,.muted,.album-title p { color: #737373; font-size: .9rem; margin-top: .35rem; }.eyebrow { color: #88a943; font-size: .68rem; font-weight: 700; letter-spacing: .16em; margin-bottom: .35rem; }.section-heading,.album-title { display:flex; align-items:end; justify-content:space-between; gap:1rem; margin-bottom:1rem; }.count { color:#9ca3af; font-size:.78rem; }.today-grid,.album-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:.55rem; }.photo-tile { position:relative; min-width:0; aspect-ratio:1; overflow:hidden; border-radius:.65rem; background:#e5e5e5; }.photo-tile img { width:100%; height:100%; object-fit:cover; transition:transform .25s ease; }.photo-tile:hover img { transform:scale(1.04); }.photo-tile span { position:absolute; left:.55rem; bottom:.45rem; color:white; font-size:.7rem; text-shadow:0 1px 4px #000; }.featured-card { position:relative; overflow:hidden; border-radius:1rem; background:#222; aspect-ratio:4/3; box-shadow:0 16px 32px rgba(0,0,0,.14); }.featured-card img { width:100%; height:100%; object-fit:cover; }.featured-caption { position:absolute; inset:auto 0 0; padding:2.5rem 1rem .85rem; color:#fff; background:linear-gradient(transparent,rgba(0,0,0,.72)); font-size:.75rem; }.featured-caption p { margin-top:.3rem; font-size:.9rem; }.album-section { margin-bottom:2rem; }.status,.empty { padding:2.5rem 0; text-align:center; color:#9ca3af; }.admin-panel { display:flex; flex-direction:column; gap:.8rem; padding:1.25rem; }.admin-divider { border-top:1px solid #e5e5e5; }.lightbox { padding:1rem; max-width:90vw; }.lightbox img { max-height:80vh; max-width:100%; object-fit:contain; margin:auto; }
@media (max-width: 640px) { .photos-page { padding-left:.85rem; padding-right:.85rem; }.featured-card { aspect-ratio:1/1.08; }.album-grid { display:flex; overflow-x:auto; scroll-snap-type:x mandatory; padding-bottom:.45rem; }.album-grid .photo-tile { flex:0 0 31%; scroll-snap-align:start; }.today-grid { gap:.4rem; } }
@media (prefers-reduced-motion: reduce) { .photo-tile img { transition:none; } }
</style>
