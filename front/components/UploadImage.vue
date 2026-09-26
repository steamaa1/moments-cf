<template>
  <UPopover :popper="{ arrow: true }" mode="click">
    <UIcon name="i-carbon-image" class="cursor-pointer w-6 h-6" />
    <template #panel="{ close }">
      <div class="p-4 flex flex-col gap-2">
        <div class="text-xs text-gray-400">本地上传</div>
        <UInput type="file" size="sm" icon="i-heroicons-folder" accept="image/*" @change="upload" multiple />

        <template v-for="img, i in imgList" :key="img">
          <div class="flex flex-wrap justify-between items-center">
            <UInput class="flex-1 mr-[6px]" :modelValue="img" />
            <UIcon name="i-heroicons-x-mark-16-solid" class="w-6 h-6" @click="removeImg(i)" />
          </div>
        </template>

        <div class="flex flex-wrap justify-between items-center">
          <UInput class="flex-1 mr-[6px]" v-model="imgUrlToAdd" />
          <UIcon name="i-heroicons-plus-16-solid" class="w-6 h-6" @click="addImg" />
        </div>

        <template v-if="isAdmin">
          <div class="text-xs text-gray-400">照片墙选图</div>
          <UButton size="xs" color="white" icon="i-carbon-image-search" block @click="toggleLib">
            {{ libOpen ? '收起照片墙' : '从照片墙选取' }}
          </UButton>
          <template v-if="libOpen">
            <div class="flex gap-1 items-center">
              <UInput
                v-model="libKeyword"
                size="sm"
                class="flex-1"
                icon="i-heroicons-magnifying-glass-20-solid"
                placeholder="按图片说明搜索"
                @keydown.enter.prevent="searchLib"
              />
              <UButton size="sm" color="white" @click="searchLib">搜索</UButton>
            </div>
            <p v-if="libError" class="text-xs text-red-500">{{ libError }}</p>
            <p v-else-if="libLoading && !libPhotos.length" class="text-xs text-gray-400">加载中…</p>
            <template v-else-if="libPhotos.length">
              <div class="lib-grid">
                <button
                  v-for="photo in libPhotos"
                  :key="String(photo.id)"
                  type="button"
                  class="lib-tile"
                  :class="{ 'lib-tile--active': isLibSelected(photo) }"
                  :disabled="isLibAdded(photo)"
                  :title="photo.caption || ''"
                  @click="toggleLibItem(photo)"
                >
                  <img :src="photo.thumbUrl || photo.url" loading="lazy" alt="" />
                  <UBadge v-if="isLibAdded(photo)" color="gray" size="xs" class="lib-flag">已添加</UBadge>
                  <UBadge v-else-if="isLibSelected(photo)" color="green" size="xs" class="lib-flag">已选</UBadge>
                </button>
              </div>
              <div class="flex gap-2 items-center">
                <UButton v-if="libHasNext" size="xs" color="white" :loading="libLoading" @click="loadLib(libPage + 1)">加载更多</UButton>
                <UButton size="xs" :disabled="!libSelectedCount" @click="confirmLibPick">加入所选({{ libSelectedCount }})</UButton>
              </div>
            </template>
            <p v-else class="text-xs text-gray-400">照片墙暂无可选图片</p>
          </template>
        </template>

        <p v-if="filename" class="text-xs text-gray-400">正在上传({{ current }}/{{ total }})</p>
        <p v-if="filename" class="text-xs text-gray-400">{{ filename }}</p>
        <UProgress :value="progress" v-if="progress > 0" indicator />

        <UButtonGroup class="w-fit">
          <UButton @click="close()">确定</UButton>
          <UButton color="white" @click="clear(close)">清空并关闭</UButton>
        </UButtonGroup>
      </div>
    </template>
  </UPopover>
</template>

<script setup lang="ts">
import { useUpload, useMyFetch } from "~/utils";
import { useGlobalState } from "~/store";
import { toast } from "vue-sonner";
import type { PhotoVO } from "~/types";

const imgs = defineModel<string>('imgs', { default: '' })
const progress = ref(0)
const filename = ref('')
const total = ref(0)
const current = ref(0)
const imgUrlToAdd = ref("")

const imgList = computed(() => {
  return imgs.value.split(',').filter(Boolean)
})

// 照片墙选图：与管理端精选选择器同源（/photo/all 为管理员接口），入口仅管理员可见
const global = useGlobalState()
const authUser = computed(() => global?.value?.userinfo ?? {})
const isAdmin = computed(() => Boolean(authUser.value.token) && Number(authUser.value.id) === 1)

const libOpen = ref(false)
const libPhotos = ref<PhotoVO[]>([])
const libPage = ref(0)
const libHasNext = ref(false)
const libLoading = ref(false)
const libError = ref('')
const libKeyword = ref('')
const libSelected = ref(new Set<string>())

const imgSet = computed(() => new Set(imgList.value))
const libSelectedCount = computed(() => libSelected.value.size)

const isLibAdded = (photo: PhotoVO) => imgSet.value.has(photo.url)
const isLibSelected = (photo: PhotoVO) => libSelected.value.has(photo.url)

const loadLib = async (page = 1) => {
  if (libLoading.value) return
  libLoading.value = true
  libError.value = ''
  try {
    const result = await useMyFetch<{ list: PhotoVO[], hasNext: boolean }>("/photo/all", {
      page,
      size: 60,
      keyword: libKeyword.value.trim(),
    })
    // 同一张图会以 memo 与 upload 两种来源同时出现在 /photo/all（发表后必然如此），
    // 选取与「已添加」都按 URL 判定，因此除按 id 去重外还必须按 URL 去重（同屏内也生效）
    const known = new Set(libPhotos.value.map(photo => String(photo.id)))
    const knownUrls = new Set(libPhotos.value.map(photo => photo.url))
    const fresh = (result.list || []).filter(photo => {
      if (known.has(String(photo.id)) || knownUrls.has(photo.url)) return false
      known.add(String(photo.id))
      knownUrls.add(photo.url)
      return true
    })
    libPhotos.value = page > 1 ? [...libPhotos.value, ...fresh] : fresh
    libPage.value = page
    libHasNext.value = Boolean(result.hasNext) && fresh.length > 0
  } catch (error: any) {
    libError.value = error?.message || "照片墙加载失败，请重试"
  } finally {
    libLoading.value = false
  }
}

const toggleLib = async () => {
  libOpen.value = !libOpen.value
  if (libOpen.value && !libPhotos.value.length) await loadLib(1)
}

const searchLib = () => {
  libPhotos.value = []
  libPage.value = 0
  libHasNext.value = false
  loadLib(1)
}

const toggleLibItem = (photo: PhotoVO) => {
  if (isLibAdded(photo)) return
  const next = new Set(libSelected.value)
  const url = photo.url
  if (next.has(url)) next.delete(url)
  else next.add(url)
  libSelected.value = next
}

const confirmLibPick = () => {
  const urls = [...libSelected.value]
  if (!urls.length) return
  imgs.value = [imgs.value, ...urls].filter(Boolean).join(",")
  libSelected.value = new Set()
  toast.success(`已加入 ${urls.length} 张照片墙图片`)
}

const upload = async (files: FileList) => {
  const containsOtherFile = [...files].some(file => !file.type.startsWith('image/'))
  if (containsOtherFile) {
    toast.error("只能上传图片");
    return
  }

  const result = await useUpload(files, (totalSize: number, index: number, name: string, p: number) => {
    progress.value = Math.round(p * 100)
    filename.value = name
    total.value = totalSize
    current.value = index
  })
  if (result && result.length) {
    toast.success("上传成功")
    imgs.value = [imgs.value, ...result].filter(Boolean).join(',')
  }
}

const addImg = () => {
  if (!imgUrlToAdd.value) {
    return
  }

  imgs.value = [imgs.value, imgUrlToAdd.value].filter(Boolean).join(',')
  imgUrlToAdd.value = ''
}

const removeImg = (index: number) => {
  const imgsArr = imgs.value.split(',').filter(Boolean)
  imgsArr.splice(index, 1)
  imgs.value = imgsArr.join(',')
}

const clear = (close: Function) => {
  imgs.value = ''
  close()
}
</script>

<style scoped>
.lib-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 4px;
  width: min(17rem, 80vw);
  max-height: 12rem;
  overflow-y: auto;
}
.lib-tile {
  position: relative;
  /* min-size 0：Firefox 系内核里 grid 项默认 min-width/height:auto，
     大图的固有尺寸会撑破 aspect-ratio 轨道导致溢出 */
  min-width: 0;
  min-height: 0;
  aspect-ratio: 1;
  padding: 0;
  border: 2px solid transparent;
  border-radius: 4px;
  overflow: hidden;
  cursor: pointer;
  background: #f3f4f6;
  transition: border-color 0.15s ease;
}
.lib-tile img {
  display: block;
  width: 100%;
  height: 100%;
  min-height: 0;
  object-fit: cover;
}
.lib-tile--active {
  border-color: #9fc84a;
}
.lib-tile:disabled {
  cursor: default;
  opacity: 0.55;
}
.lib-flag {
  position: absolute;
  left: 2px;
  bottom: 2px;
}
@media (prefers-reduced-motion: reduce) {
  .lib-tile {
    transition: none;
  }
}
</style>
