<template>
  <article v-if="url" class="weibo-card" aria-label="嵌入的微博原帖">
    <div class="weibo-card__bar">
      <div class="flex min-w-0 items-center gap-2"><span class="weibo-card__dot" aria-hidden="true"></span><span class="truncate font-medium">微博原帖</span></div>
      <a :href="url" target="_blank" rel="noopener noreferrer" class="weibo-card__origin">查看原微博 <UIcon name="i-carbon-launch" class="h-3.5 w-3.5"/></a>
    </div>
    <iframe
      :src="widgetUrl"
      class="weibo-card__frame"
      title="微博原帖嵌入"
      loading="lazy"
      referrerpolicy="strict-origin-when-cross-origin"
      sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
    />
    <p class="weibo-card__hint">若微博卡片无法加载，可点击“查看原微博”。</p>
  </article>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { WeiboEmbed } from '~/types'
const props = defineProps<WeiboEmbed>()
const widgetUrl = computed(() => `https://widget.weibo.com/weiboshow/index.php?language=zh_CN&width=0&height=520&url=${encodeURIComponent(props.url || '')}&refer=weibo`)
</script>

<style scoped>
.weibo-card { overflow: hidden; border: 1px solid #e4e4e7; border-radius: 12px; background: #fff; box-shadow: 0 1px 2px rgb(0 0 0 / .04); }
.dark .weibo-card { border-color: #3f3f46; background: #27272a; }
.weibo-card__bar { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 14px; color: #3f3f46; font-size: 14px; }
.dark .weibo-card__bar { color: #f4f4f5; }
.weibo-card__dot { width: 8px; height: 8px; flex: none; border-radius: 999px; background: #d84137; }
.weibo-card__origin { display: inline-flex; flex: none; align-items: center; gap: 3px; color: #576b95; font-size: 12px; text-decoration: none; }
.weibo-card__origin:hover { text-decoration: underline; }
.weibo-card__frame { display: block; width: 100%; height: 520px; border: 0; background: #fafafa; }
.dark .weibo-card__frame { background: #18181b; }
.weibo-card__hint { margin: 0; padding: 8px 14px; border-top: 1px solid #f4f4f5; color: #71717a; font-size: 12px; line-height: 1.5; }
.dark .weibo-card__hint { border-color: #3f3f46; color: #a1a1aa; }
@media (max-width: 640px) { .weibo-card__frame { height: 460px; } }
@media (prefers-reduced-motion: reduce) { .weibo-card * { transition: none !important; } }
</style>
