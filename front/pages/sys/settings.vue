<template>
  <Header :user="currentUser"/>
  <div class="space-y-4  flex flex-col p-4 my-4 dark:bg-neutral-800">
    <div class="flex flex-col items-end text-xs text-gray-400">
      <div v-if="version" class="w-32">版本号: {{ version }}</div>
      <div v-if="commitId" class="w-32">commitId: {{ commitId }}</div>
    </div>
    <UFormGroup label="管理员账号" name="adminUserName" :ui="{label:{base:'font-bold'}}">
      <UInput v-model="state.adminUserName"/>
    </UFormGroup>
    <UFormGroup label="网站标题" name="title" :ui="{label:{base:'font-bold'}}">
      <UInput v-model="state.title"/>
    </UFormGroup>
    <UFormGroup label="Favicon" name="favicon"
                :ui="{label:{base:'font-bold'}}">
      <UInput type="file" size="sm" icon="i-heroicons-folder" accept="image/*" @change="uploadFavicon"/>
      <div class="text-gray-500 text-sm my-2">或者输入在线地址</div>
      <UInput v-model="state.favicon" class="mb-2"/>
      <UAvatar :src="state.favicon"/>
    </UFormGroup>
    <UFormGroup label="首页是否自动加载下一页" name="enableAutoLoadNextPage" :ui="{label:{base:'font-bold'}}">
      <UToggle v-model="state.enableAutoLoadNextPage"/>
    </UFormGroup>
    <UFormGroup label="是否启用评论" name="enableComment" :ui="{label:{base:'font-bold'}}">
      <UToggle v-model="state.enableComment"/>
    </UFormGroup>
    <UFormGroup label="是否开启注册用户" name="enableRegister" :ui="{label:{base:'font-bold'}}">
      <UToggle v-model="state.enableRegister"/>
    </UFormGroup>
    <UFormGroup label="备案号" name="beiAnNo" :ui="{label:{base:'font-bold'}}">
      <UInput v-model="state.beiAnNo" placeholder="没有可以不填写"/>
    </UFormGroup>
    <UFormGroup label="自定义CSS" name="css" :ui="{label:{base:'font-bold'}}">
      <UTextarea v-model="state.css" :rows="5"/>
    </UFormGroup>
    <UFormGroup label="自定义JS" name="js" :ui="{label:{base:'font-bold'}}">
      <UTextarea v-model="state.js" :rows="5"/>
    </UFormGroup>
    <UFormGroup label="自定义RSS" name="rss" :ui="{label:{base:'font-bold'}}">
      <UTextarea v-model="state.rss" :rows="1"  placeholder="留空使用默认配置"/>
    </UFormGroup>
    <UFormGroup label="评论最大字数" name="maxCommentLength" :ui="{label:{base:'font-bold'}}">
      <UInput v-model.number="state.maxCommentLength"/>
    </UFormGroup>
    <UFormGroup label="发言最大高度(单位px,填0时则不限制高度)" name="memoMaxHeight" :ui="{label:{base:'font-bold'}}">
      <UInput v-model.number="state.memoMaxHeight"/>
    </UFormGroup>
    <UFormGroup label="评论排序方式(按日期)" name="commentOrder" :ui="{label:{base:'font-bold'}}">
      <USelectMenu v-model="state.commentOrder"
                   :options="[{label:'倒序,越晚发布越靠前',value:'desc'},{label:'正序,越早发布越靠前',value:'asc'}]"
                   value-attribute="value" option-attribute="label"></USelectMenu>
    </UFormGroup>
    <UFormGroup label="日期格式" name="timeFormat" :ui="{label:{base:'font-bold'}}">
      <USelectMenu v-model="state.timeFormat"
                   :options="[{label:'几分钟前',value:'timeAgo'},{label:$dayjs().format('YYYY-MM-DD HH:mm'),value:'time'}]"
                   value-attribute="value" option-attribute="label"></USelectMenu>
    </UFormGroup>
      <UFormGroup label="是否启用Google Recaptcha" name="enableGoogleRecaptcha" :ui="{label:{base:'font-bold'}}">
        <UToggle v-model="state.enableGoogleRecaptcha"/>
      </UFormGroup>
      <template v-if="state.enableGoogleRecaptcha">
        <UFormGroup label="SiteKey" name="googleSiteKey" :ui="{label:{base:'font-bold'}}">
          <UInput v-model="state.googleSiteKey"/>
        </UFormGroup>
        <UFormGroup label="SecretKey" name="googleSecretKey" :ui="{label:{base:'font-bold'}}">
          <UInput v-model="state.googleSecretKey" type="password" autocomplete="off"/>
        </UFormGroup>
      </template>
    <div class="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/80 dark:bg-neutral-900/40 p-4 space-y-3">
      <div class="flex items-start gap-3">
        <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300">
          <UIcon name="i-carbon-cloud" class="h-5 w-5"/>
        </span>
        <div>
          <p class="font-semibold text-gray-800 dark:text-gray-100">Cloudflare R2 媒体存储</p>
          <p class="mt-1 text-sm leading-6 text-gray-500 dark:text-gray-400">未引用文件会先进入回收站并保留 7 天，期间可恢复；到期文件会在下次清理时永久删除。</p>
        </div>
      </div>
      <div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <UButton block color="red" variant="soft" icon="i-carbon-clean" @click="showCleanFileModal = true">扫描未引用文件</UButton>
        <UButton block color="gray" variant="soft" icon="i-carbon-trash-can" @click="openTrash">查看回收站</UButton>
      </div>
    </div>
    <UButton class="justify-center min-h-11" @click="save">保存设置</UButton>
  </div>

  <UModal
    v-model="showCleanFileModal"
    :ui="{
      container:
        'flex justify-center items-center backdrop-blur',
    }"
  >
    <div class="p-4 bg-white dark:bg-neutral-800 rounded-lg shadow-md">
      <p class="text-lg font-bold mb-2">谨慎操作</p>
      <p class="text-gray-600 dark:text-gray-300 mb-4 leading-6">确认扫描未使用的图片和视频吗？未引用文件会进入回收站并保留 7 天，不会立即从 R2 删除。</p>
      <div class="flex justify-end gap-2 mt-4">
        <UButton color="white" @click="showCleanFileModal = false">取消</UButton>
        <UButton @click="cleanFile">确认清理</UButton>
      </div>
        </div>
  </UModal>

  <UModal v-model="showTrashModal" :ui="{container:'flex justify-center items-center backdrop-blur'}">
    <div class="max-h-[80vh] overflow-auto rounded-xl bg-white p-5 shadow-xl dark:bg-neutral-800">
      <div class="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 class="text-lg font-semibold text-gray-900 dark:text-white">媒体回收站</h2>
          <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">文件保留 {{ trashRetentionDays }} 天，可恢复或立即永久删除。</p>
        </div>
        <UButton color="gray" variant="ghost" icon="i-carbon-close" aria-label="关闭回收站" @click="showTrashModal = false"/>
      </div>
      <div v-if="trashLoading" class="py-10 text-center text-sm text-gray-500">正在加载回收站…</div>
      <div v-else-if="trashFiles.length === 0" class="rounded-lg border border-dashed border-gray-300 py-10 text-center text-sm text-gray-500 dark:border-gray-600">回收站是空的</div>
      <div v-else class="space-y-3">
        <div v-for="file in trashFiles" :key="file.id" class="flex items-center gap-3 rounded-lg border border-gray-200 p-3 dark:border-gray-700">
          <div class="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-gray-100 dark:bg-neutral-700">
            <UIcon :name="file.contentType.startsWith('image/') ? 'i-carbon-image' : 'i-carbon-video'" class="h-5 w-5 text-gray-600 dark:text-gray-300"/>
          </div>
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm font-medium text-gray-800 dark:text-gray-100">{{ file.filename }}</p>
            <p class="mt-1 text-xs text-gray-500">{{ formatBytes(file.size) }} · {{ $dayjs(file.trashedAt).format('YYYY-MM-DD HH:mm') }}</p>
          </div>
          <div class="flex shrink-0 gap-1">
            <UButton size="xs" color="green" variant="soft" @click="restoreTrashFile(file.id)">恢复</UButton>
            <Confirm @ok="purgeTrashFile(file.id)">
              <UButton size="xs" color="red" variant="soft">永久删除</UButton>
            </Confirm>
          </div>
        </div>
      </div>
    </div>
  </UModal>
</template>

<script setup lang="ts">
import type {SysConfigVO, UserVO} from "~/types";
import {toast} from "vue-sonner";
import {useUpload} from "~/utils";

const currentUser = useState<UserVO>('userinfo')
const version = ref('')
const commitId = ref('')
const state = reactive({
  enableGoogleRecaptcha: false,
  googleSiteKey:"",
  googleSecretKey:"",
  enableAutoLoadNextPage: true,
  enableComment: true,
  enableRegister: true,
  maxCommentLength: 120,
  memoMaxHeight: 300,
  commentOrder: 'desc',
  timeFormat: 'timeAgo',
  adminUserName: "admin",
  title: "极简朋友圈",
  favicon: "/favicon.ico",
  beiAnNo: "",
  css: "",
  js: "",
  rss: "",
})

type TrashFile = { id: number; path: string; filename: string; contentType: string; size: number; trashedAt: string }
const showCleanFileModal = ref(false)
const showTrashModal = ref(false)
const trashLoading = ref(false)
const trashFiles = ref<TrashFile[]>([])
const trashRetentionDays = ref(7)

const reload = async () => {
  const res = await useMyFetch<SysConfigVO>('/sysConfig/getFull')
  if (res) {
    Object.assign(state, res)
    version.value = res.version
    commitId.value = res.commitId
  }
}

const save = async () => {
  await useMyFetch('/sysConfig/save', state)
  toast.success("保存成功")
  location.reload()
}

const uploadFavicon = async (files: FileList) => {
  for (let i = 0; i < files.length; i++) {
    if (files[i].type.indexOf("image") < 0){
      toast.error("只能上传图片");
      return
    }
  }
  const result = await useUpload(files)
  if (result.length) {
    toast.success("上传成功")
    state.favicon = result[0]
  }
}

const cleanFile = async () => {
  const res = await useMyFetch<{num: number; purged: number; retentionDays: number}>('/file/clean')
  if (res) {
    toast.success(`已将 ${res.num} 个未引用文件移入回收站${res.purged ? `，并清理 ${res.purged} 个到期文件` : ''}`)
    trashRetentionDays.value = res.retentionDays
    showCleanFileModal.value = false
  }
}

const loadTrash = async () => {
  trashLoading.value = true
  try {
    const res = await useMyFetch<{list: TrashFile[]; retentionDays: number}>('/file/trash/list')
    trashFiles.value = res.list || []
    trashRetentionDays.value = res.retentionDays || 7
  } finally {
    trashLoading.value = false
  }
}
const openTrash = async () => {
  showTrashModal.value = true
  await loadTrash()
}
const restoreTrashFile = async (id: number) => {
  await useMyFetch(`/file/trash/restore?id=${id}`)
  toast.success('文件已恢复')
  await loadTrash()
}
const purgeTrashFile = async (id: number) => {
  await useMyFetch(`/file/trash/purge?id=${id}`)
  toast.success('文件已永久删除')
  await loadTrash()
}
const formatBytes = (size: number) => {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
}

onMounted(async () => {
  await reload()
})

</script>

<style scoped>

</style>
