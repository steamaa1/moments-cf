import CryptoJS from 'crypto-js'
import { toast } from 'vue-sonner'
import { useGlobalState } from '~/store'
import type { ResultVO } from '~/types'

const MAX_BYTES = 500 * 1024 * 1024
const DIRECT_THRESHOLD = 20 * 1024 * 1024
const CHUNK_BYTES = 4 * 1024 * 1024

type Progress = (value: number) => void
export type TotalProgress = (total: number, current: number, name: string, progress: number) => void

function tokenHeaders() {
  const global = useGlobalState()
  return global.value.userinfo.token ? { 'x-api-token': global.value.userinfo.token } : {}
}
async function api<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`/api${path}`, { method: 'POST', headers: { 'content-type': 'application/json', ...tokenHeaders() }, body: body ? JSON.stringify(body) : null })
  const result = await response.json() as ResultVO<T>
  if (!response.ok || result.code !== 0) throw new Error(result.message || '请求失败')
  return result.data
}
export async function hashFile(file: File, progress?: Progress) {
  const hasher = CryptoJS.algo.SHA256.create()
  for (let offset = 0; offset < file.size; offset += CHUNK_BYTES) {
    const buffer = await file.slice(offset, Math.min(file.size, offset + CHUNK_BYTES)).arrayBuffer()
    hasher.update(CryptoJS.lib.WordArray.create(buffer))
    progress?.(Math.min(0.15, (offset + buffer.byteLength) / file.size * 0.15))
  }
  return hasher.finalize().toString(CryptoJS.enc.Hex)
}
export async function imageThumbnail(file: File): Promise<File | null> {
  if (!file.type.startsWith('image/') || file.type === 'image/gif') return null
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, 640 / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale))
  const context = canvas.getContext('2d'); if (!context) return null
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close()
  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/webp', 0.78))
  return blob ? new File([blob], `${file.name.replace(/\.[^.]+$/, '')}_thumb.webp`, { type: 'image/webp' }) : null
}
function xhrUpload(url: string, method: string, body: XMLHttpRequestBodyInit, headers: Record<string,string>, progress?: Progress) {
  return new Promise<string>((resolve, reject) => {
    const xhr = new XMLHttpRequest(); xhr.open(method, url, true)
    for (const [key, value] of Object.entries(headers)) xhr.setRequestHeader(key, value)
    xhr.upload.onprogress = event => { if (event.lengthComputable) progress?.(0.15 + event.loaded / event.total * 0.85) }
    xhr.onload = () => xhr.status >= 200 && xhr.status < 300 ? resolve(xhr.responseText) : reject(new Error(`上传失败 (${xhr.status})`))
    xhr.onerror = () => reject(new Error('上传网络错误')); xhr.onabort = () => reject(new Error('上传已取消')); xhr.send(body)
  })
}
async function uploadOne(file: File, progress?: Progress) {
  if (file.size <= 0 || file.size > MAX_BYTES) throw new Error('文件必须在 1B 到 500MB 之间')
  const sha256 = await hashFile(file, progress)
  const exists = await api<{exist:boolean;path:string}>(`/file/exist?sha256=${sha256}`)
  if (exists.exist) { progress?.(1); return exists.path }
  const thumbnail = await imageThumbnail(file)
  if (file.size < DIRECT_THRESHOLD) {
    const form = new FormData(); form.append('files', file); form.append('sha256', sha256); if (thumbnail) form.append('thumbnail_0', thumbnail)
    const text = await xhrUpload('/api/file/upload', 'POST', form, tokenHeaders(), progress)
    const result = JSON.parse(text) as ResultVO<string[]>; if (result.code !== 0 || !result.data?.[0]) throw new Error(result.message || '上传失败')
    return result.data[0]
  }
  const init = await api<{exists:boolean;path:string;uploadUrl:string;key:string;contentType:string;thumbnailKey:string;thumbnailUploadUrl:string}>('/file/direct/init', { filename:file.name, contentType:file.type, size:file.size, sha256 })
  if (init.exists) return init.path
  await xhrUpload(init.uploadUrl, 'PUT', file, { 'content-type': init.contentType }, progress)
  if (thumbnail && init.thumbnailUploadUrl) await xhrUpload(init.thumbnailUploadUrl, 'PUT', thumbnail, { 'content-type': 'image/webp' })
  const completed = await api<{path:string}>('/file/direct/complete', { key:init.key, thumbnailKey:thumbnail ? init.thumbnailKey : '' })
  return completed.path
}
export async function uploadFiles(files: FileList, onProgress?: TotalProgress) {
  if (!files.length) { toast.error('没有选择文件'); return [] }
  const urls: string[] = []
  for (let index=0; index<files.length; index+=1) {
    const file=files[index]
    try { urls.push(await uploadOne(file, value => onProgress?.(files.length,index+1,file.name,value))) }
    catch (error) { toast.error(`${file.name} 上传失败：${error instanceof Error ? error.message : error}`) }
  }
  return urls
}
