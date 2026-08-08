<template>
  <article v-if="url" class="weibo-card" aria-label="引用的微博内容">
    <div class="weibo-card__accent" aria-hidden="true"></div>
    <div class="weibo-card__body">
      <div class="weibo-card__meta">
        <div class="flex min-w-0 items-center gap-2">
          <span class="weibo-card__mark" aria-hidden="true">微</span>
          <span class="font-semibold">微博</span>
          <span class="weibo-card__tag">外部引用</span>
        </div>
        <UIcon name="i-carbon-quote" class="h-5 w-5 text-[#d84137]/70" aria-hidden="true"/>
      </div>
      <p class="weibo-card__title">此动态引用了一条微博</p>
      <p class="weibo-card__domain">{{ hostname }}</p>
      <a :href="url" target="_blank" rel="noopener noreferrer" class="weibo-card__action">
        查看原微博 <UIcon name="i-carbon-launch" class="h-4 w-4"/>
      </a>
    </div>
  </article>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { WeiboEmbed } from '~/types'

const props = defineProps<WeiboEmbed>()
const hostname = computed(() => {
  try { return new URL(props.url || '').hostname.replace(/^www\./, '') }
  catch { return 'weibo.com' }
})
</script>

<style scoped>
.weibo-card { position: relative; overflow: hidden; border: 1px solid #ead8d5; border-radius: 12px; background: linear-gradient(135deg, #fffafa 0%, #fff 56%); box-shadow: 0 1px 2px rgb(0 0 0 / .04); }
.dark .weibo-card { border-color: #613d3a; background: linear-gradient(135deg, #352524 0%, #27272a 62%); }
.weibo-card__accent { position: absolute; inset: 0 auto 0 0; width: 4px; background: #d84137; }
.weibo-card__body { padding: 16px 18px 16px 20px; }
.weibo-card__meta { display: flex; align-items: center; justify-content: space-between; gap: 12px; color: #4a3030; font-size: 14px; }
.dark .weibo-card__meta { color: #f5e2df; }
.weibo-card__mark { display: inline-flex; width: 22px; height: 22px; align-items: center; justify-content: center; border-radius: 7px; background: #d84137; color: white; font-size: 12px; font-weight: 700; line-height: 1; }
.weibo-card__tag { border: 1px solid #f0d4d1; border-radius: 999px; padding: 2px 7px; color: #a4544e; font-size: 11px; font-weight: 500; }
.dark .weibo-card__tag { border-color: #764742; color: #e7aaa3; }
.weibo-card__title { margin: 14px 0 4px; color: #27272a; font-size: 15px; font-weight: 600; line-height: 1.5; }
.dark .weibo-card__title { color: #f4f4f5; }
.weibo-card__domain { margin: 0; color: #71717a; font-size: 12px; line-height: 1.5; }
.weibo-card__action { display: inline-flex; min-height: 32px; align-items: center; gap: 5px; margin-top: 14px; border-radius: 8px; color: #c83b32; font-size: 13px; font-weight: 600; text-decoration: none; transition: background-color 150ms ease, transform 150ms ease; }
.weibo-card__action:hover { background: #fff0ee; transform: translateX(2px); }
.weibo-card__action:focus-visible { outline: 2px solid #d84137; outline-offset: 3px; }
.dark .weibo-card__action { color: #f19991; }
.dark .weibo-card__action:hover { background: rgb(216 65 55 / .14); }
@media (prefers-reduced-motion: reduce) { .weibo-card__action { transition: none; } }
</style>
