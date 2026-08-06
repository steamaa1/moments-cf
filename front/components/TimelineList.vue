<template>
  <section class="timeline" aria-label="朋友圈时间轴">
    <article v-for="(memo, index) in memos" :key="memo.id" class="timeline-row">
      <time class="timeline-date" :datetime="memo.createdAt">
        <span class="timeline-day">{{ day(memo.createdAt) }}</span>
        <span class="timeline-month">{{ month(memo.createdAt) }}</span>
        <span v-if="showYear(memo.createdAt, index)" class="timeline-year">{{ year(memo.createdAt) }}</span>
      </time>
      <div class="timeline-rail" aria-hidden="true"><span class="timeline-dot"/></div>
      <div class="timeline-content"><Memo :memo="memo"/></div>
    </article>
    <div v-if="!memos.length" class="py-12 text-center text-sm text-gray-400">这段时间还没有动态</div>
  </section>
</template>

<script setup lang="ts">
import type { MemoVO } from '~/types'
import Memo from '~/components/Memo.vue'

const props = defineProps<{ memos: MemoVO[] }>()
const value = (date: string) => new Date(date)
const day = (date: string) => String(value(date).getDate()).padStart(2, '0')
const month = (date: string) => `${value(date).getMonth() + 1}月`
const year = (date: string) => value(date).getFullYear()
const showYear = (date: string, index: number) => index === 0 || year(date) !== year(props.memos[index - 1].createdAt)
</script>

<style scoped>
.timeline { padding: 8px 12px 20px; }
.timeline-row { display: grid; grid-template-columns: 58px 18px minmax(0, 1fr); align-items: stretch; }
.timeline-date { position: sticky; top: 12px; align-self: start; display: grid; grid-template-columns: auto 1fr; align-items: baseline; padding: 16px 5px 0 0; color: #18181b; }
.timeline-day { font-size: 1.45rem; font-weight: 750; letter-spacing: -.06em; line-height: 1; }
.timeline-month { margin-left: 4px; font-size: .7rem; font-weight: 650; white-space: nowrap; }
.timeline-year { grid-column: 1 / -1; margin-top: 5px; font-size: .68rem; color: #a1a1aa; }
.timeline-rail { position: relative; display: flex; justify-content: center; }
.timeline-rail::before { content: ''; position: absolute; inset: 0 auto; width: 1px; background: linear-gradient(to bottom, transparent, #d4d4d8 18px, #d4d4d8 calc(100% - 8px), transparent); }
.timeline-dot { position: relative; z-index: 1; width: 9px; height: 9px; margin-top: 20px; border: 2px solid #fff; border-radius: 999px; background: #9fc84a; box-shadow: 0 0 0 1px #9fc84a; }
.timeline-content { min-width: 0; margin: 4px 0 16px; overflow: hidden; border: 1px solid rgba(161,161,170,.18); border-radius: 14px; background: rgba(255,255,255,.72); box-shadow: 0 8px 26px rgba(24,24,27,.05); }
:global(.dark) .timeline-date { color: #f4f4f5; }
:global(.dark) .timeline-rail::before { background: linear-gradient(to bottom, transparent, #52525b 18px, #52525b calc(100% - 8px), transparent); }
:global(.dark) .timeline-dot { border-color: #262626; }
:global(.dark) .timeline-content { border-color: rgba(113,113,122,.24); background: rgba(38,38,38,.72); box-shadow: none; }
@media (max-width: 420px) { .timeline { padding-inline: 8px; } .timeline-row { grid-template-columns: 50px 14px minmax(0, 1fr); } .timeline-day { font-size: 1.25rem; } }
@media (prefers-reduced-motion: reduce) { .timeline-content { scroll-behavior: auto; } }
</style>
