<template>
  <article v-if="url" class="x-card" aria-label="保存的 X 原帖快照">
    <header class="x-card__header">
      <img v-if="avatar" :src="mediaSource(avatar)" class="x-card__avatar" :alt="`${authorName || 'X 用户'} 的头像`" loading="lazy" referrerpolicy="no-referrer"/>
      <div v-else class="x-card__avatar x-card__avatar--fallback" aria-hidden="true">𝕏</div>
      <div class="min-w-0 flex-1 leading-tight">
        <div class="flex items-center gap-1"><span class="truncate font-bold">{{ authorName || 'X 用户' }}</span><span v-if="verified" class="x-card__verified" aria-label="已认证">✓</span></div>
        <div class="mt-1 flex items-center gap-1 text-gray-500"><span v-if="authorUsername" class="truncate">@{{ authorUsername }}</span><span v-if="authorUsername && createdAt">·</span><time v-if="createdAt" class="whitespace-nowrap" :datetime="createdAt">{{ formatDate(createdAt) }}</time></div>
      </div>
      <a :href="url" target="_blank" rel="noopener noreferrer" class="x-card__logo" aria-label="在 X 中查看原帖">𝕏</a>
    </header>
    <p class="x-card__text">{{ text || '该 X 原帖未保存正文快照。' }}</p>
    <div v-if="media.length" class="x-card__media" :class="`x-card__media--${Math.min(media.length, 4)}`">
      <a v-for="(item, index) in media" :key="`${item.url}-${index}`" :href="url" target="_blank" rel="noopener noreferrer" class="x-card__media-link" aria-label="在 X 中查看媒体">
        <img :src="mediaSource(item.previewUrl || item.url)" :alt="item.type === 'video' ? 'X 视频预览' : 'X 图片'" loading="lazy" referrerpolicy="no-referrer"/>
        <span v-if="item.type === 'video' || item.type === 'animated_gif'" class="x-card__play" aria-hidden="true">▶</span>
      </a>
    </div>
    <footer class="x-card__footer">
      <div v-if="likes || replies || reposts" class="x-card__metrics" aria-label="互动数据">
        <span v-if="likes">♡ {{ formatCount(likes) }}</span><span v-if="reposts">↻ {{ formatCount(reposts) }}</span><span v-if="replies">◌ {{ formatCount(replies) }}</span>
      </div>
      <a :href="url" target="_blank" rel="noopener noreferrer" class="x-card__origin">在 X 中查看 <UIcon name="i-carbon-launch" class="h-3.5 w-3.5"/></a>
    </footer>
  </article>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { XEmbed } from '~/types'
const props = defineProps<XEmbed>()
const media = computed(() => props.media || [])
const mediaSource = (value?: string) => value ? `/x-media?url=${encodeURIComponent(value)}` : ''
const formatCount = (value?: number) => {
  const count = Number(value || 0)
  return count >= 10000 ? `${(count / 10000).toFixed(count >= 100000 ? 0 : 1)}万` : String(count)
}
const formatDate = (value?: string) => {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const year = date.getFullYear()
  const now = new Date().getFullYear()
  return `${year === now ? '' : year + '年'}${date.getMonth() + 1}月${date.getDate()}日`
}
</script>

<style scoped>
.x-card { overflow: hidden; max-width: 550px; border: 1px solid #cfd9de; border-radius: 16px; background: #fff; color: #0f1419; }
.dark .x-card { border-color: #536471; background: #000; color: #e7e9ea; }
.x-card__header { display: flex; align-items: flex-start; gap: 10px; padding: 14px 14px 0; font-size: 15px; }
.x-card__avatar { width: 44px; height: 44px; flex: none; border-radius: 999px; object-fit: cover; background: #e7e9ea; }
.x-card__avatar--fallback { display: flex; align-items: center; justify-content: center; color: #536471; font-weight: 700; }
.x-card__verified { display: inline-flex; width: 17px; height: 17px; align-items: center; justify-content: center; border-radius: 999px; background: #1d9bf0; color: #fff; font-size: 11px; font-weight: 800; }
.x-card__logo { color: inherit; font-size: 24px; font-weight: 700; line-height: 1; text-decoration: none; }
.x-card__logo:focus-visible, .x-card__origin:focus-visible { outline: 2px solid #1d9bf0; outline-offset: 3px; border-radius: 4px; }
.x-card__text { margin: 12px 14px; white-space: pre-wrap; overflow-wrap: anywhere; font-size: 16px; line-height: 1.45; }
.x-card__media { display: grid; overflow: hidden; margin: 0 14px; border: 1px solid #cfd9de; border-radius: 12px; background: #f7f9f9; }
.dark .x-card__media { border-color: #536471; background: #16181c; }
.x-card__media--1 { grid-template-columns: 1fr; }.x-card__media--2 { grid-template-columns: repeat(2, 1fr); }.x-card__media--3, .x-card__media--4 { grid-template-columns: repeat(2, 1fr); }
.x-card__media-link { position: relative; min-height: 160px; overflow: hidden; border: 1px solid rgb(207 217 222 / .65); }.x-card__media--1 .x-card__media-link { max-height: 440px; }.x-card__media-link img { display: block; width: 100%; height: 100%; min-height: 160px; object-fit: cover; }
.x-card__play { position: absolute; left: 12px; bottom: 12px; display: flex; width: 34px; height: 34px; align-items: center; justify-content: center; border-radius: 999px; background: rgb(15 20 25 / .72); color: #fff; font-size: 13px; }
.x-card__footer { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 11px 14px 14px; }.x-card__metrics { display: flex; gap: 12px; color: #536471; font-size: 12px; }.x-card__origin { display: inline-flex; align-items: center; gap: 4px; color: #536471; font-size: 13px; text-decoration: none; }.x-card__origin:hover { text-decoration: underline; }.dark .x-card__metrics, .dark .x-card__origin { color: #8b98a5; }
@media (max-width: 640px) { .x-card { max-width: 100%; }.x-card__text { font-size: 15px; }.x-card__media-link, .x-card__media-link img { min-height: 120px; } }
</style>
