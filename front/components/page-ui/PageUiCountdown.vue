<script setup>
/**
 * 自定义页面组件：倒计时（kind: countdown）
 *
 * 数据协议（字段容错，target 缺失或不可解析时渲染空容器）：
 *   { "target": "2027-01-01 00:00:00", "label": "距离新年还有", "doneText": "新年快乐！" }
 *   - target:   目标时间字符串，new Date() 可解析即可（推荐 YYYY-MM-DD HH:mm:ss，按本地时区）
 *   - label:    可选前缀文案
 *   - doneText: 可选，过期后的完成态文案（默认「已结束」）
 *   每秒 setInterval 更新，组件卸载清理定时器；SPA 无 SSR，不存在水合不一致。
 *
 * 示例正文围栏：
 *   ```ui:countdown
 *   { "target": "2027-01-01 00:00:00", "label": "距离新年还有" }
 *   ```
 */
const props = defineProps({
  data: { type: null, default: () => ({}) },
})

const now = ref(Date.now())
const targetTime = computed(() => {
  const raw = props.data && props.data.target
  if (!raw) return null
  const time = new Date(String(raw)).getTime()
  return Number.isNaN(time) ? null : time
})
const label = computed(() => (props.data && props.data.label) || '')
const doneText = computed(() => (props.data && props.data.doneText) || '已结束')
const remaining = computed(() => (targetTime.value ?? 0) - now.value)
const finished = computed(() => targetTime.value !== null && remaining.value <= 0)
const parts = computed(() => {
  const total = Math.max(0, Math.floor(remaining.value / 1000))
  return [
    { value: Math.floor(total / 86400), unit: '天' },
    { value: Math.floor((total % 86400) / 3600), unit: '时' },
    { value: Math.floor((total % 3600) / 60), unit: '分' },
    { value: total % 60, unit: '秒' },
  ]
})

let timer = null
watch(
  targetTime,
  value => {
    if (timer) {
      clearInterval(timer)
      timer = null
    }
    if (value !== null) timer = setInterval(() => (now.value = Date.now()), 1000)
  },
  { immediate: true },
)
onBeforeUnmount(() => {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
})
</script>

<template>
  <div v-if="targetTime" class="page-ui-countdown my-4 not-prose">
    <p v-if="label" class="page-ui-countdown-label mb-2 text-sm">{{ label }}</p>
    <p v-if="finished" class="page-ui-countdown-done text-sm font-medium">{{ doneText }}</p>
    <div v-else class="flex flex-wrap gap-2">
      <span v-for="part in parts" :key="part.unit" class="page-ui-countdown-cell min-w-[3.5rem] rounded-xl px-3 py-2 text-center">
        <span class="page-ui-countdown-num text-lg font-semibold tabular-nums">{{ String(part.value).padStart(2, '0') }}</span>
        <span class="page-ui-countdown-unit ml-0.5 text-xs">{{ part.unit }}</span>
      </span>
    </div>
  </div>
</template>

<style scoped>
.page-ui-countdown-label { color: #71717a; }
.page-ui-countdown-cell { background: rgba(159, 200, 74, .15); }
.page-ui-countdown-num { color: #18181b; }
.page-ui-countdown-unit { color: #71717a; }
.page-ui-countdown-done { color: #78943f; }
.dark .page-ui-countdown-label { color: #a1a1aa; }
.dark .page-ui-countdown-cell { background: rgba(159, 200, 74, .22); }
.dark .page-ui-countdown-num { color: #f4f4f5; }
.dark .page-ui-countdown-unit { color: #a1a1aa; }
</style>
