<template>
  <div>
    <Header :user="currentUser"/>
    <main class="space-y-4 p-4 pb-12">
      <section class="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-neutral-800">
        <div class="mb-4 flex items-start gap-3">
          <span class="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300"><UIcon name="i-carbon-import-export" class="h-6 w-6"/></span>
          <div><h1 class="text-xl font-bold">一键导入</h1><p class="mt-1 text-sm leading-6 text-gray-500">上传本地转换器生成的 moments-migration-package.tar.gz（旧 Docker 站），预检后一键导入。</p></div>
        </div>
        <UFormGroup label="迁移包" help="只接受 build-package.py 生成的 .tar.gz 文件">
          <input ref="fileInput" type="file" accept=".tar.gz,.tgz,application/gzip" class="block min-h-11 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-neutral-900" @change="selectPackage"/>
        </UFormGroup>
        <div v-if="selectedFile" class="mt-3 rounded-lg bg-gray-50 p-3 text-sm dark:bg-neutral-900"><span class="font-medium">{{ selectedFile.name }}</span><span class="ml-2 text-gray-500">{{ formatBytes(selectedFile.size) }}</span></div>
        <UFormGroup v-if="report" class="mt-4" label="管理员密码" help="用于导入前创建 D1 安全备份">
          <UInput v-model="adminPassword" type="password" autocomplete="current-password" placeholder="请输入当前管理员密码"/>
        </UFormGroup>
        <div class="mt-4 flex flex-wrap gap-2">
          <UButton :loading="reading" :disabled="!selectedFile" icon="i-carbon-search" @click="inspect">读取并预检</UButton>
          <UButton v-if="report" color="red" variant="soft" :loading="importing" :disabled="!canImport" icon="i-carbon-arrow-down" @click="startImport">确认导入</UButton>
        </div>
      </section>

      <section v-if="report" class="rounded-2xl border border-gray-200 p-5 dark:border-gray-700">
        <h2 class="font-bold">预检结果</h2>
        <div class="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div class="stat"><span>用户</span><strong>{{ report.manifest.tables?.['users.json'] || 0 }}</strong></div>
          <div class="stat"><span>动态</span><strong>{{ report.manifest.tables?.['memos.json'] || 0 }}</strong></div>
          <div class="stat"><span>评论</span><strong>{{ report.manifest.tables?.['comments.json'] || 0 }}</strong></div>
          <div class="stat"><span>媒体</span><strong>{{ report.manifest.mediaCount || 0 }}</strong></div>
        </div>
        <ul class="mt-4 list-disc space-y-1 pl-5 text-sm text-amber-700 dark:text-amber-300"><li v-for="warning in report.warnings" :key="warning">{{ warning }}</li></ul>
        <p v-if="!report.backupAvailable" class="mt-3 text-sm text-amber-700 dark:text-amber-300">当前未配置 D1 备份 API。可勾选下方“跳过导入前备份”直接导入。</p>
        <label class="mt-3 flex items-center gap-2 rounded-lg border border-amber-300/60 bg-amber-50 px-3 py-2 text-sm dark:border-amber-500/40 dark:bg-amber-900/20">
          <input v-model="skipBackup" type="checkbox" class="h-4 w-4 accent-amber-600"/>
          <span>跳过导入前 D1 备份（数据库导出异常或等待太久时勾选；勾选后直接导入，不创建备份）</span>
        </label>
      </section>

      <section v-if="progress.message || progress.error" class="rounded-2xl border border-gray-200 p-5 dark:border-gray-700" aria-live="polite">
        <div class="flex items-center justify-between text-sm"><span>{{ progress.message }}</span><strong>{{ progress.percent }}%</strong></div>
        <div class="mt-2 h-2 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700"><div class="h-full rounded-full bg-sky-500 transition-all" :style="{width: `${progress.percent}%`}"/></div>
        <p v-if="progress.error" class="mt-3 text-sm text-red-600">{{ progress.error }}</p>
        <p v-if="progress.done" class="mt-3 text-sm text-green-600">{{ progress.done }}</p>
      </section>
    </main>
  </div>
</template>

<script setup lang="ts">
import type { UserVO } from '~/types'
import { uploadFile } from '~/utils/upload'
import { useGlobalState } from '~/store'
import { toast } from 'vue-sonner'

type TarMeta = { name: string; size: number; type: number; offset: number }
type PackageManifest = { format: string; version: number; packageId: string; tables: Record<string, number>; mediaCount: number; mediaBytes: number; media: Array<{path:string;size:number;sha256:string;contentType:string}> }
type Report = { packageId:string; existingRun?:{status:string;summary:string}|null; manifest: PackageManifest; destination: {users:number;memos:number}; backupAvailable:boolean; warnings:string[] }
const currentUser = useState<UserVO>('userinfo')
const global = useGlobalState()
if (global.value.userinfo.id !== 1) await navigateTo('/', { replace: true })
const selectedFile = ref<File | null>(null)
const adminPassword = ref('')
const reading = ref(false), importing = ref(false)
const skipBackup = ref(false)
const report = ref<Report | null>(null)
const packageData = ref<Record<string, unknown>>({})
const tarData = ref<Uint8Array>(new Uint8Array(0))
const mediaMetas = ref<TarMeta[]>([])
const maps = reactive({ users: {} as Record<string,number>, memos: {} as Record<string,number>, media: {} as Record<string,string> })
const progress = reactive({ message:'', percent:0, error:'', done:'' })
const canImport = computed(() => Boolean((report.value?.backupAvailable || skipBackup.value) && report.value?.existingRun?.status !== 'completed' && adminPassword.value && !importing.value && packageData.value['tables/users.json']))
const tokenHeaders = () => global.value.userinfo.token ? {'x-api-token': global.value.userinfo.token} : {}
async function api<T>(path:string, body:unknown) {
  let response: Response
  try {
    response = await fetch(`/api${path}`, { method:'POST', headers:{'content-type':'application/json',...tokenHeaders()}, body:JSON.stringify(body), signal: AbortSignal.timeout(360000) })
  } catch (error) {
    throw new Error(error instanceof Error && error.name === 'TimeoutError' ? '请求超时：导入前 D1 备份可能需要 1-3 分钟，请稍后重新点击导入' : '网络请求失败，请检查网络连接后重试')
  }
  let result: { code:number; message?:string; data?:T }
  try { result = await response.json() } catch { throw new Error(`服务器响应异常（HTTP ${response.status}），请稍后重试`) }
  if (!response.ok || result.code !== 0) throw new Error(result.message || '请求失败')
  return result.data as T
}
function formatBytes(value:number) { if(value<1024) return `${value} B`; if(value<1024*1024) return `${(value/1024).toFixed(1)} KB`; if(value<1024*1024*1024) return `${(value/1024/1024).toFixed(1)} MB`; return `${(value/1024/1024/1024).toFixed(2)} GB` }
function selectPackage(event:Event) { selectedFile.value = (event.target as HTMLInputElement).files?.[0] || null; report.value=null; packageData.value={}; tarData.value=new Uint8Array(0); mediaMetas.value=[]; progress.message=''; progress.error=''; progress.done='' }
async function gunzip(data:ArrayBuffer) { if(typeof DecompressionStream==='undefined') throw new Error('当前浏览器不支持 gzip 解压，请使用最新版 Chrome/Edge/Firefox'); const stream=new Blob([data]).stream().pipeThrough(new DecompressionStream('gzip')); return new Uint8Array(await new Response(stream).arrayBuffer()) }
function tarMetaEntries(data:Uint8Array) {
  const metas: TarMeta[] = []
  let pendingName = ''
  const read = (start: number, length: number) => new TextDecoder().decode(data.slice(start, start + length)).replace(/\0.*$/, '').trim()
  for (let offset = 0; offset + 512 <= data.length;) {
    const header = data.slice(offset, offset + 512)
    if (header.every(byte => byte === 0)) break
    const name = read(offset, 100)
    const size = parseInt(read(offset + 124, 12) || '0', 8) || 0
    const type = header[156]
    const start = offset + 512
    const content = data.slice(start, start + size)
    if (type === 76 || type === 120 || type === 121) {
      const raw = new TextDecoder().decode(content)
      if (type === 76) pendingName = raw.replace(/\0.*$/, '')
      else for (const record of raw.split('\n')) { const match = record.match(/^\d+ path=(.*)$/); if (match) pendingName = match[1] }
      offset = start + Math.ceil(size / 512) * 512
      continue
    }
    let fullName = name
    if (pendingName) { fullName = pendingName; pendingName = '' }
    else { const prefix = read(offset + 345, 155); if (prefix) fullName = `${prefix}/${name}` }
    if (fullName && type !== 53) metas.push({ name: fullName, size, type, offset: start })
    offset = start + Math.ceil(size / 512) * 512
  }
  return metas
}
function rewriteConfig(row: unknown) {
  if (!row || typeof row !== 'object') return row
  const copy = { ...(row as Record<string, unknown>) }
  if (typeof copy.content === 'string') { try { copy.content = JSON.stringify(rewrite(JSON.parse(copy.content))) } catch { /* keep invalid legacy config for server to ignore */ } }
  return rewrite(copy)
}
function rewrite(value: unknown): unknown {
  if (typeof value === 'string') return value.replace(/\/upload\/([^\s"'<>),]+)/g, (_match, key) => maps.media[decodeURIComponent(key)] ? `/upload/${maps.media[decodeURIComponent(key)]!.replace(/^\/upload\//, '')}` : _match)
  if (Array.isArray(value)) return value.map(rewrite)
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, rewrite(item)]))
  return value
}
async function inspect() {
  if (!selectedFile.value) return
  reading.value = true
  progress.message = ''
  progress.error = ''
  progress.done = ''
  try {
    const bytes = await gunzip(await selectedFile.value.arrayBuffer())
    tarData.value = bytes
    const metas = tarMetaEntries(bytes)
    const manifestMeta = metas.find(entry => entry.name === 'manifest.json' || entry.name.endsWith('/manifest.json'))
    if (!manifestMeta) throw new Error('迁移包缺少 manifest.json')
    const prefix = manifestMeta.name.slice(0, -'manifest.json'.length)
    const readText = (name: string) => {
      const meta = metas.find(entry => entry.name === name || entry.name === `${prefix}${name}`)
      return meta ? new TextDecoder().decode(bytes.slice(meta.offset, meta.offset + meta.size)) : ''
    }
    const manifest = JSON.parse(readText('manifest.json')) as PackageManifest
    if (manifest.format !== 'moments-cf-migration' || manifest.version !== 1) throw new Error('迁移包格式或版本不受支持')
    const data: Record<string, unknown> = {}
    for (const name of ['tables/users.json', 'tables/memos.json', 'tables/comments.json', 'tables/friends.json', 'tables/sys_config.json']) {
      const text = readText(name)
      if (text) data[name] = JSON.parse(text)
    }
    mediaMetas.value = metas
      .filter(meta => meta.name.startsWith(`${prefix}media/`) && meta.type !== 53)
      .map(meta => ({ ...meta, name: meta.name.slice(`${prefix}media/`.length) }))
    for (const [filename, expected] of Object.entries(manifest.tables || {})) {
      const rows = data[`tables/${filename}`]
      if (!Array.isArray(rows) || rows.length !== Number(expected)) throw new Error(`表数量不一致：${filename}，清单 ${expected}，实际 ${Array.isArray(rows) ? rows.length : 0}`)
    }
    if (mediaMetas.value.length !== Number(manifest.mediaCount || 0)) throw new Error(`媒体数量不一致：清单 ${manifest.mediaCount || 0}，实际 ${mediaMetas.value.length}`)
    const actualMediaBytes = mediaMetas.value.reduce((total, meta) => total + meta.size, 0)
    if (actualMediaBytes !== Number(manifest.mediaBytes || 0)) throw new Error(`媒体总大小不一致：清单 ${manifest.mediaBytes || 0}，实际 ${actualMediaBytes}`)
    const mediaByPath = new Map(mediaMetas.value.map(meta => [meta.name, meta]))
    for (const item of manifest.media || []) {
      const meta = mediaByPath.get(item.path)
      if (!meta || meta.size !== Number(item.size)) throw new Error(`媒体缺失或大小不一致：${item.path}`)
    }
    packageData.value = data
    report.value = await api<Report>('/admin/migration/preflight', {
      manifest: {
        format: manifest.format,
        version: manifest.version,
        packageId: manifest.packageId,
        tables: manifest.tables,
        mediaCount: manifest.mediaCount,
        mediaBytes: manifest.mediaBytes,
      },
    })
    progress.message = `预检通过：${manifest.mediaCount || 0} 个媒体、${manifest.tables?.['memos.json'] || 0} 条动态、${manifest.tables?.['users.json'] || 0} 个用户`
    toast.success('迁移包预检通过')
  } catch (error) {
    progress.message = '读取或预检失败'
    progress.error = error instanceof Error ? error.message : String(error)
  } finally {
    reading.value = false
  }
}
async function importBatch(kind:string, rows:unknown[], extra:Record<string,unknown>={}) { for(let i=0;i<rows.length;i+=50) { const result=await api<{userMap?:Record<string,number>;memoMap?:Record<string,number>}>( '/admin/migration/import', {packageId:report.value?.packageId,kind,rows:rows.slice(i,i+50),...extra}); if(result.userMap) Object.assign(maps.users,result.userMap); if(result.memoMap) Object.assign(maps.memos,result.memoMap) } }
async function startImport() {
  if (!report.value || importing.value) return
  const activeReport = report.value
  let prepared = false
  importing.value = true
  progress.error = ''
  progress.done = ''
  try {
    progress.message = '创建导入前 D1 安全备份'
    progress.percent = 1
    const preparedState = await api<{ready:boolean;resumed:boolean;bookmark?:string;skipped?:boolean}>('/admin/migration/prepare', { password: adminPassword.value, packageId: activeReport.packageId, skipBackup: skipBackup.value })
    const activeBookmark = preparedState.bookmark || ''
    prepared = true
    if (!preparedState.ready) {
      let waitSeconds = 0
      let backupReady = false
      let pollErrors = 0
      while (waitSeconds < 600) {
        await new Promise(resolve => setTimeout(resolve, 2500))
        waitSeconds += 2.5
        progress.message = `等待 D1 导出完成（已等待 ${Math.round(waitSeconds)} 秒）`
        try {
          const status = await api<{ready:boolean}>('/admin/migration/backup/status', { packageId: activeReport.packageId, bookmark: activeBookmark })
          pollErrors = 0
          if (status.ready) { backupReady = true; break }
        } catch (error) {
          pollErrors += 1
          if (pollErrors >= 8) throw new Error(`D1 备份状态查询连续失败：${error instanceof Error ? error.message : error}`)
        }
      }
      if (!backupReady) throw new Error('D1 备份等待超时，请稍后重新点击导入（断点继续，不会重复导入）')
      progress.message = 'D1 安全备份完成'
    }

    const mediaList = activeReport.manifest.media || []
    for (let index = 0; index < mediaList.length; index += 1) {
      const item = mediaList[index]
      progress.message = `上传媒体 ${index + 1}/${mediaList.length}：${item.path}`
      progress.percent = Math.round(index / Math.max(1, mediaList.length) * 55)
      const meta = mediaMetas.value.find(value => value.name === item.path)
      if (!meta) throw new Error(`迁移包缺少媒体：${item.path}`)
      if (meta.size !== Number(item.size)) throw new Error(`媒体大小不一致：${item.path}`)
      const file = new File([tarData.value.slice(meta.offset, meta.offset + meta.size)], item.path.split('/').pop() || 'media', { type: item.contentType || 'application/octet-stream' })
      const path = await uploadFile(file, value => {
        progress.percent = Math.round((index + value) / Math.max(1, mediaList.length) * 55)
      }, item.sha256)
      maps.media[item.path] = path
    }

    const users = (packageData.value['tables/users.json'] || []) as unknown[]
    progress.message = '导入用户'
    await importBatch('users', users.map(row => rewrite(row)))

    const memos = (packageData.value['tables/memos.json'] || []) as unknown[]
    progress.message = '导入动态'
    await importBatch('memos', memos.map(row => rewrite(row)), { userMap: maps.users })

    const comments = (packageData.value['tables/comments.json'] || []) as unknown[]
    progress.message = '导入评论'
    await importBatch('comments', comments, { memoMap: maps.memos })

    const friends = (packageData.value['tables/friends.json'] || []) as unknown[]
    progress.message = '导入友情链接'
    await importBatch('friends', friends.map(row => rewrite(row)))

    const configs = (packageData.value['tables/sys_config.json'] || []) as unknown[]
    if (configs.length) {
      progress.message = '合并网站设置'
      await importBatch('config', configs.map(row => rewriteConfig(row)))
    }

    await api('/admin/migration/finish', {
      packageId: activeReport.packageId,
      imported: { users: users.length, memos: memos.length, comments: comments.length, friends: friends.length, media: mediaList.length },
    })
    progress.percent = 100
    progress.message = '导入完成'
    progress.done = '数据已导入。请检查首页、用户页、图片和视频播放。'
    toast.success('迁移完成')
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    progress.error = message
    if (prepared) await api('/admin/migration/fail', { packageId: activeReport.packageId, error: message }).catch(() => undefined)
    toast.error(message)
  } finally {
    importing.value = false
  }
}

</script>

<style scoped>
.stat { display:flex; min-height:72px; flex-direction:column; justify-content:center; border-radius:12px; background:rgba(14,165,233,.08); padding:12px; }
.stat span { color:#71717a; font-size:.75rem; }.stat strong { margin-top:4px; font-size:1.2rem; }
</style>
