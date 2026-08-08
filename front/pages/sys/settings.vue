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
    <div class="rounded-xl border border-gray-200 p-4 space-y-3 dark:border-gray-700">
      <div class="flex items-center justify-between gap-4"><div><p class="font-semibold">关于页面</p><p class="text-xs text-gray-500">开启后导航中显示“关于”，内容支持 Markdown 与 HTML。</p></div><UToggle v-model="state.enableAbout"/></div>
      <UFormGroup v-if="state.enableAbout" label="关于内容" name="aboutContent" :ui="{label:{base:'font-bold'}}">
        <UTextarea v-model="state.aboutContent" :rows="12" placeholder="# 关于我&#10;&#10;支持 Markdown，也可直接使用 HTML。"/>
      </UFormGroup>
    </div>
    <div class="rounded-xl border border-gray-200 dark:border-gray-700 p-4 space-y-3">
      <div class="flex items-start gap-3">
        <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"><UIcon name="i-carbon-link" class="h-5 w-5"/></span>
        <div><p class="font-semibold text-gray-800 dark:text-gray-100">友情链接申请与须知</p><p class="mt-1 text-sm leading-6 text-gray-500 dark:text-gray-400">配置友情链接页展示的申请须知与接收申请的邮箱。</p></div>
      </div>
      <UFormGroup label="申请须知" :ui="{label:{base:'font-bold'}}"><UTextarea v-model="state.friendNotice" :rows="7"/></UFormGroup>
      <UFormGroup label="申请邮箱" :ui="{label:{base:'font-bold'}}"><UInput v-model="state.friendEmail" type="email" placeholder="admin@example.com"/></UFormGroup>
    </div>
    <UFormGroup label="备案信息" name="beiAnNo" :ui="{label:{base:'font-bold'}}">
      <UTextarea v-model="state.beiAnNo" :rows="3" placeholder='<a href="https://beian.miit.gov.cn/" target="_blank">京ICP备...</a>'/>
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
          <UInput v-model="state.googleSecretKey" type="password" autocomplete="new-password" :placeholder="state.googleSecretKeyConfigured ? '已配置，留空保持不变' : ''"/>
        </UFormGroup>
      </template>
      <UFormGroup label="是否启用 Cloudflare 人机验证" name="enableTurnstile" :ui="{label:{base:'font-bold'}}">
        <UToggle v-model="state.enableTurnstile"/>
      </UFormGroup>
      <template v-if="state.enableTurnstile">
        <UFormGroup label="Turnstile Site Key" name="turnstileSiteKey" :ui="{label:{base:'font-bold'}}"><UInput v-model="state.turnstileSiteKey"/></UFormGroup>
        <UFormGroup label="Turnstile Secret Key" name="turnstileSecretKey" :ui="{label:{base:'font-bold'}}"><UInput v-model="state.turnstileSecretKey" type="password" autocomplete="new-password" :placeholder="state.turnstileSecretKeyConfigured ? '已配置，留空保持不变' : ''"/></UFormGroup>
        <p class="text-xs text-gray-500">启用后评论和点赞优先使用 Cloudflare Turnstile。</p>
      </template>
    <div class="rounded-xl border border-gray-200 dark:border-gray-700 p-4 space-y-3">
      <div class="flex items-center justify-between"><div><p class="font-semibold">评论邮件通知</p><p class="text-xs text-gray-500">支持 SMTP 465/587；填入 re_ 开头的 Resend API Key 时使用 Resend。</p></div><UToggle v-model="state.enableEmail"/></div>
      <template v-if="state.enableEmail">
        <UFormGroup label="服务器"><UInput v-model="state.smtpHost" placeholder="smtp.example.com"/></UFormGroup>
        <UFormGroup label="端口"><USelectMenu v-model="state.smtpPort" :options="['465','587']"/></UFormGroup>
        <UFormGroup label="用户名（即发件邮箱）"><UInput v-model="state.smtpUsername" type="email" placeholder="noreply@example.com"/></UFormGroup>
        <UFormGroup label="密码 / 授权码"><UInput v-model="state.smtpPassword" type="password" autocomplete="new-password" :placeholder="state.smtpPasswordConfigured ? '已配置，留空保持不变' : 'SMTP 授权码或 re_ 开头的 Resend API Key'"/></UFormGroup>
      </template>
    </div>
    <div class="rounded-xl border border-gray-200 dark:border-gray-700 p-4 space-y-3">
      <div class="flex items-center justify-between"><div><p class="font-semibold">Telegram 评论通知</p><p class="text-xs text-gray-500">配置 Bot Token；用户在自己的“用户中心”填写 Telegram User ID 后，评论时通过 Bot 发送提醒（模板与邮件一致）。</p></div><UToggle v-model="state.enableTelegram"/></div>
      <template v-if="state.enableTelegram">
        <UFormGroup label="Bot Token"><UInput v-model="state.telegramBotToken" type="password" autocomplete="new-password" placeholder="123456:ABC-DEF..."/></UFormGroup>
        <UFormGroup label="Bot 用户名（可选）" help="用于在个人设置中提醒用户关注该 Bot"><UInput v-model="state.telegramBotUsername" placeholder="meimeicomment_bot"/></UFormGroup>
      </template>
    </div>
    <div class="rounded-xl border border-gray-200 dark:border-gray-700 p-4 space-y-3">
      <div class="flex items-start gap-3">
        <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300"><UIcon name="i-carbon-data-1" class="h-5 w-5"/></span>
        <div><p class="font-semibold text-gray-800 dark:text-gray-100">媒体存储</p><p class="mt-1 text-sm leading-6 text-gray-500 dark:text-gray-400">上传文件写入所选后端；切换后旧 R2 媒体仍可访问（读旧写新）。S3/WebDAV 凭据加密存储。</p></div>
      </div>
      <URadioGroup v-model="state.storageType" :options="[{value:'r2',label:'Cloudflare R2（默认）'},{value:'s3',label:'S3 兼容存储'},{value:'webdav',label:'WebDAV'}]" value-attribute="value"/>
      <template v-if="state.storageType === 's3'">
        <UFormGroup label="Endpoint"><UInput v-model="state.s3Storage.endpoint" placeholder="https://s3.example.com"/></UFormGroup>
        <div class="grid grid-cols-2 gap-3">
          <UFormGroup label="Region"><UInput v-model="state.s3Storage.region" placeholder="auto"/></UFormGroup>
          <UFormGroup label="Bucket"><UInput v-model="state.s3Storage.bucket"/></UFormGroup>
        </div>
        <UFormGroup label="Access Key"><UInput v-model="state.s3Storage.accessKeyId"/></UFormGroup>
        <UFormGroup label="Secret Key"><UInput v-model="state.s3Storage.secretAccessKey" type="password" autocomplete="new-password" :placeholder="state.s3Storage.secretAccessKeyConfigured ? '已配置，留空保持不变' : ''"/></UFormGroup>
      </template>
      <template v-else-if="state.storageType === 'webdav'">
        <UFormGroup label="WebDAV URL"><UInput v-model="state.webdavStorage.url" placeholder="https://dav.example.com/remote.php/dav/files/user"/></UFormGroup>
        <div class="grid grid-cols-2 gap-3">
          <UFormGroup label="用户名"><UInput v-model="state.webdavStorage.username"/></UFormGroup>
          <UFormGroup label="密码"><UInput v-model="state.webdavStorage.password" type="password" autocomplete="new-password" :placeholder="state.webdavStorage.passwordConfigured ? '已配置，留空保持不变' : ''"/></UFormGroup>
        </div>
        <p class="text-xs text-gray-500">WebDAV 无预签名直传，单文件上限 25MB；大视频请使用 R2 或 S3。</p>
      </template>
    </div>
    <div class="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/80 dark:bg-neutral-900/40 p-4 space-y-3">
      <div class="flex items-start gap-3">
        <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300">
          <UIcon name="i-carbon-cloud" class="h-5 w-5"/>
        </span>
        <div>
          <p class="font-semibold text-gray-800 dark:text-gray-100">Cloudflare R2 媒体存储</p>
          <p class="mt-1 text-sm leading-6 text-gray-500 dark:text-gray-400">未引用文件会先进入回收站并保留 7 天，期间可恢复；到期文件会在下次清理时永久删除。当前存储为 S3/WebDAV 时，回收站同样作用于所选后端。</p>
        </div>
      </div>
      <div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <UButton block color="red" variant="soft" icon="i-carbon-clean" @click="showCleanFileModal = true">扫描未引用文件</UButton>
        <UButton block color="gray" variant="soft" icon="i-carbon-trash-can" @click="openTrash">查看回收站</UButton>
      </div>
    </div>
    <div class="rounded-xl border border-gray-200 dark:border-gray-700 p-4 space-y-3">
      <div class="flex items-center justify-between gap-3">
        <div><p class="font-semibold">本地备份</p><p class="mt-1 text-xs text-gray-500">将数据库导出为 SQL 文件，下载到本地保存。</p></div>
        <UButton size="sm" icon="i-carbon-download" :loading="localBackupLoading" @click="exportLocalBackup">导出文件</UButton>
      </div>
    </div>
    <div class="rounded-xl border border-gray-200 dark:border-gray-700 p-4 space-y-3">
      <div class="flex items-center justify-between gap-3">
        <div><p class="font-semibold">D1 生产备份</p><p class="mt-1 text-xs text-gray-500">按配置的间隔自动备份到所选目标，恢复前会自动再创建一份安全备份。</p></div>
        <UToggle v-model="state.enableD1Backup"/>
      </div>
      <template v-if="state.enableD1Backup">
        <div class="flex items-start justify-between gap-3"><UButton size="sm" icon="i-carbon-renew" :loading="backupLoading" @click="createBackup">立即备份</UButton></div>
        <div class="grid grid-cols-2 gap-3">
          <UFormGroup label="自动备份间隔（天）"><UInput v-model.number="state.backupIntervalDays" type="number" min="1" max="365"/></UFormGroup>
          <UFormGroup label="保留天数"><UInput v-model.number="state.backupRetentionDays" type="number" min="1" max="3650"/></UFormGroup>
        </div>
        <UFormGroup label="备份目标" help="仅显示已配置的存储"><USelectMenu v-model="state.backupTarget" :options="backupTargetOptions" value-attribute="value" option-attribute="label"/></UFormGroup>
        <UButton block color="gray" variant="soft" icon="i-carbon-data-backup" @click="openBackups">管理备份</UButton>
      </template>
    </div>
    <div class="rounded-xl border border-gray-200 dark:border-gray-700 p-4 space-y-3">
      <div class="flex items-start justify-between gap-3"><div><p class="font-semibold">一键导入</p><p class="mt-1 text-xs text-gray-500">上传本地转换器生成的迁移包（旧 Docker 站），预检后导入 D1 与所选存储。</p></div></div>
      <UButton block color="gray" variant="soft" icon="i-carbon-import-export" to="/sys/migration">打开一键导入器</UButton>
    </div>
    <UButton block class="min-h-11 justify-center" @click="save">保存设置</UButton>
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

  <UModal v-model="showBackupModal" :ui="{container:'flex justify-center items-center backdrop-blur'}">
    <div class="max-h-[85vh] overflow-auto rounded-xl bg-white p-5 shadow-xl dark:bg-neutral-800">
      <div class="mb-4 flex items-start justify-between"><div><h2 class="text-lg font-semibold">D1 备份</h2><p class="text-sm text-gray-500">恢复会覆盖当前数据库，需管理员密码和完整备份名称。</p></div><UButton color="gray" variant="ghost" icon="i-carbon-close" @click="showBackupModal=false"/></div>
      <div v-if="backupLoading" class="py-10 text-center text-sm text-gray-500">正在处理备份…</div>
      <div v-else-if="backups.length===0" class="rounded-lg border border-dashed p-8 text-center text-sm text-gray-500">暂无备份</div>
      <div v-else class="space-y-3"><div v-for="backup in backups" :key="backup.key" class="rounded-lg border border-gray-200 p-3 dark:border-gray-700"><div class="flex items-center justify-between gap-3"><div class="min-w-0"><p class="truncate text-sm font-medium">{{ backup.name }}</p><p class="mt-1 text-xs text-gray-500">{{ formatBytes(backup.size) }} · {{ $dayjs(backup.uploaded).format('YYYY-MM-DD HH:mm') }}</p></div><div class="flex gap-1"><UButton size="xs" color="gray" variant="soft" @click="downloadBackup(backup.key)">下载</UButton><UButton size="xs" color="red" variant="soft" @click="selectRestore(backup)">恢复</UButton></div></div></div></div>
      <div v-if="restoreBackup" class="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950/20"><p class="font-semibold text-red-700 dark:text-red-300">恢复 {{ restoreBackup.name }}</p><UInput v-model="restoreConfirmName" class="mt-3" placeholder="输入完整备份名称"/><UInput v-model="restorePassword" class="mt-2" type="password" placeholder="当前管理员密码"/><div class="mt-3 flex justify-end gap-2"><UButton color="gray" variant="soft" @click="restoreBackup=null">取消</UButton><UButton color="red" :loading="backupLoading" @click="confirmRestore">确认覆盖恢复</UButton></div></div>
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
            <p class="mt-1 text-xs text-gray-500">{{ formatBytes(file.size) }} · {{ $dayjs.utc(file.trashedAt).local().format('YYYY-MM-DD HH:mm') }}</p>
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
import {useGlobalState} from "~/store";

const currentUser = useState<UserVO>('userinfo')
const version = ref('')
const commitId = ref('')
const state = reactive({
  enableGoogleRecaptcha: false,
  googleSiteKey:"",
  googleSecretKey:"",
  googleSecretKeyConfigured: false,
  enableTurnstile: false,
  turnstileSiteKey: "",
  turnstileSecretKey: "",
  turnstileSecretKeyConfigured: false,
  enableAutoLoadNextPage: true,
  enableComment: true,
  enableRegister: true,
  backupIntervalDays: 7,
  backupRetentionDays: 90,
  enableD1Backup: true,
  storageType: 'r2',
  backupTarget: 'r2',
  s3Storage: { endpoint: '', region: 'auto', bucket: '', accessKeyId: '', secretAccessKey: '', secretAccessKeyConfigured: false },
  webdavStorage: { url: '', username: '', password: '', passwordConfigured: false },
  enableAbout: false,
  aboutContent: "",
  friendNotice: "",
  friendEmail: "",
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
  enableEmail: false,
  enableTelegram: false,
  telegramBotUsername: "",
  telegramBotToken: "",
  smtpHost: "",
  smtpPort: "465" as '465' | '587',
  smtpUsername: "",
  smtpPassword: "",
  smtpPasswordConfigured: false,
})

type TrashFile = { id: number; path: string; filename: string; contentType: string; size: number; trashedAt: string }
type BackupFile = { key: string; name: string; size: number; uploaded: string }
const showBackupModal = ref(false)
const backupLoading = ref(false)
const backups = ref<BackupFile[]>([])
const restoreBackup = ref<BackupFile | null>(null)
const backupTargetOptions = computed(() => {
  const options: Array<{value:string;label:string}> = [{value:'r2',label:'Cloudflare R2'}]
  if (state.s3Storage.endpoint && state.s3Storage.bucket && state.s3Storage.accessKeyId) options.push({value:'s3',label:'S3 兼容存储'})
  if (state.webdavStorage.url) options.push({value:'webdav',label:'WebDAV'})
  return options
})
const restoreConfirmName = ref('')
const restorePassword = ref('')
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

const loadBackups = async () => {
  backupLoading.value = true
  try { backups.value = (await useMyFetch<{list: BackupFile[]}>('/admin/backup/list')).list || [] }
  finally { backupLoading.value = false }
}
const openBackups = async () => { showBackupModal.value = true; await loadBackups() }
const createBackup = async () => { backupLoading.value = true; try { await useMyFetch('/admin/backup/create'); toast.success('备份已创建'); if(showBackupModal.value) await loadBackups() } finally { backupLoading.value = false } }
const localBackupLoading = ref(false)
const exportLocalBackup = async () => {
  localBackupLoading.value = true
  try {
    const token = useGlobalState().value.userinfo.token
    const response = await fetch('/api/admin/backup/export', { method:'POST', headers:{'x-api-token':token} })
    if (!response.ok) { let message = '备份导出失败'; try { const body = await response.json(); message = body.message || message } catch { /* ignore */ } toast.error(message); return }
    const blob = await response.blob()
    const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `moments-backup-${new Date().toISOString().slice(0,10)}.sql`; link.click(); URL.revokeObjectURL(link.href)
    toast.success('备份已下载到本地')
  } finally { localBackupLoading.value = false }
}
const downloadBackup = async (key: string) => {
  const token = useGlobalState().value.userinfo.token
  const response = await fetch(`/api/admin/backup/download?key=${encodeURIComponent(key)}`, {method:'POST',headers:{'x-api-token':token}})
  if(!response.ok) { toast.error('备份下载失败'); return }
  const blob = await response.blob(); const link=document.createElement('a'); link.href=URL.createObjectURL(blob); link.download=key.split('/').pop() || 'backup.sql'; link.click(); URL.revokeObjectURL(link.href)
}
const selectRestore = (backup: BackupFile) => { restoreBackup.value=backup; restoreConfirmName.value=''; restorePassword.value='' }
const confirmRestore = async () => {
  if(!restoreBackup.value) return
  backupLoading.value=true
  try { await useMyFetch('/admin/backup/restore',{key:restoreBackup.value.key,confirmName:restoreConfirmName.value,password:restorePassword.value}); toast.success('数据库恢复完成，请重新登录'); location.href='/' }
  finally { backupLoading.value=false }
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
