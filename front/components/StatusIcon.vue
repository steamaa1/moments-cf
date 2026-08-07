<template>
  <UPopover mode="click" :ui="{ base: 'w-[330px]' }">
    <button type="button" class="status-trigger" :title="status ? status.content : (editable ? '设置状态' : '')">
      <span v-if="status" class="status-emoji">{{ status.icon || '💬' }}</span>
      <span v-else-if="editable" class="status-add">
        <svg viewBox="0 0 1024 1024" class="status-add-svg" xmlns="http://www.w3.org/2000/svg" fill="currentColor"><path d="M512 118.153846c61.046154 0 118.153846 13.784615 171.323077 39.384616 25.6 11.815385 35.446154 43.323077 23.630769 66.953846-11.815385 25.6-43.323077 35.446154-66.953846 23.630769-39.384615-19.692308-82.707692-29.538462-128-29.538462-161.476923 0-293.415385 131.938462-293.415385 293.415385S350.523077 805.415385 512 805.415385 805.415385 673.476923 805.415385 512c0-51.2-11.815385-98.461538-37.415385-141.784615-13.784615-23.630769-3.938462-55.138462 19.692308-68.923077s55.138462-3.938462 68.923077 19.692307A393.846154 393.846154 0 0 1 905.846154 512c0 216.615385-177.230769 393.846154-393.846154 393.846154S118.153846 728.615385 118.153846 512 295.384615 118.153846 512 118.153846z" p-id="894"></path></svg>
      </span>
    </button>
    <template #panel="{ close }">
      <div class="max-h-[440px] space-y-3 overflow-auto p-4">
        <template v-if="editable">
          <div v-if="status" class="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2 dark:bg-gray-800/70">
            <span class="truncate text-sm">{{ status.icon }} {{ status.content }}<span v-if="status.remark" class="text-gray-500"> · {{ status.remark }}</span></span>
            <UButton size="xs" color="red" variant="soft" @click="clear(close)">清除</UButton>
          </div>
          <UFormGroup label="持续时间" :ui="{label:{base:'font-bold'}}">
            <USelectMenu v-model="duration" :options="durations" value-attribute="value" option-attribute="label"/>
          </UFormGroup>
          <div v-for="group in builtins" :key="group.group">
            <p class="mb-1 text-xs text-gray-500">{{ group.group }}</p>
            <div class="grid grid-cols-6 gap-1">
              <button v-for="item in group.items" :key="item.content" type="button" class="status-item" :class="{ active: currentContent === item.content }" :title="item.content" @click="pick(item, close)">{{ item.icon }}</button>
            </div>
          </div>
          <UFormGroup label="自定义状态" :ui="{label:{base:'font-bold'}}">
            <div class="flex gap-2">
              <UInput v-model="custom" placeholder="输入状态文字，如：在看海"/>
              <UButton @click="submitCustom(close)">设置</UButton>
            </div>
          </UFormGroup>
          <UFormGroup label="备注（可选）" :ui="{label:{base:'font-bold'}}"><UInput v-model="remark" placeholder="附加说明，如：和朋友一起"/></UFormGroup>
        </template>
        <template v-else>
          <div class="py-2 text-center">
            <span class="text-3xl">{{ status?.icon || '💬' }}</span>
            <p class="mt-2 font-semibold">{{ status?.content || '暂无状态' }}</p>
            <p v-if="status?.remark" class="mt-1 text-sm text-gray-500">{{ status.remark }}</p>
          </div>
        </template>
      </div>
    </template>
  </UPopover>
</template>

<script setup lang="ts">
import type { UserStatusVO } from '~/types'
import { useGlobalState } from '~/store'
import { toast } from 'vue-sonner'

const props = withDefaults(defineProps<{ status?: UserStatusVO | null; userId: number; editable?: boolean }>(), { status: null, editable: false })
const emit = defineEmits<{ refresh: [] }>()
const global = useGlobalState()
const builtins = [
  { group: '心情想法', items: [{ icon: '😄', content: '美滋滋' }, { icon: '😞', content: '郁闷' }, { icon: '😴', content: '数羊' }, { icon: '😶', content: '发呆' }, { icon: '🤔', content: '胡思乱想' }, { icon: '🦲', content: '头秃' }, { icon: '😪', content: '疲惫' }, { icon: '💔', content: '裂开' }, { icon: '🌤️', content: '等天晴' }, { icon: '⚡', content: '冲' }, { icon: '🧊', content: '融化' }] },
  { group: '工作学习', items: [{ icon: '💼', content: '忙' }, { icon: '🐟', content: '摸鱼' }, { icon: '🧱', content: '搬砖' }, { icon: '✈️', content: '出差' }, { icon: '📚', content: '沉迷学习' }, { icon: '🏃', content: '飞奔回家' }, { icon: '💻', content: '写代码' }] },
  { group: '活动', items: [{ icon: '📝', content: '打卡' }, { icon: '🍽️', content: '聚餐' }, { icon: '☕', content: '喝咖啡' }, { icon: '🍻', content: '喝酒' }, { icon: '🏋️', content: '运动' }, { icon: '🛍️', content: '买买买' }, { icon: '🧋', content: '喝奶茶' }, { icon: '🍚', content: '干饭' }, { icon: '👶', content: '带娃' }, { icon: '🦸', content: '拯救世界' }, { icon: '🌊', content: '浪' }] },
  { group: '休息', items: [{ icon: '🎧', content: '听歌' }, { icon: '📺', content: '追剧' }, { icon: '🍉', content: '吃瓜' }, { icon: '🎮', content: '玩游戏' }, { icon: '📱', content: '看直播' }, { icon: '😴', content: '睡觉' }, { icon: '🧘', content: '闭关' }, { icon: '🏠', content: '宅' }] },
]
const durations = [{ value: 1, label: '1 小时' }, { value: 4, label: '4 小时' }, { value: 8, label: '8 小时' }, { value: 12, label: '12 小时' }, { value: 24, label: '24 小时（默认）' }, { value: 72, label: '3 天' }, { value: 168, label: '7 天' }]
const currentContent = computed(() => props.status?.content || '')
const duration = ref(24)
const custom = ref('')
const remark = ref('')
const tokenHeaders = () => global.value.userinfo.token ? { 'x-api-token': global.value.userinfo.token } : {}
async function api<T>(path: string, body?: unknown) {
  const response = await fetch(`/api${path}`, { method: 'POST', headers: { 'content-type': 'application/json', ...tokenHeaders() }, body: body ? JSON.stringify(body) : null })
  const result = await response.json() as { code: number; message?: string; data?: T }
  if (!response.ok || result.code !== 0) throw new Error(result.message || '请求失败')
  return result.data as T
}
async function save(status: { icon: string; content: string; remark: string }, close: Function) {
  try {
    await api('/user/status/set', { ...status, durationHours: duration.value })
    toast.success('状态已更新')
    emit('refresh')
    close()
  } catch (error) { toast.error(error instanceof Error ? error.message : String(error)) }
}
function pick(item: { icon: string; content: string }, close: Function) { void save({ icon: item.icon, content: item.content, remark: remark.value }, close) }
function submitCustom(close: Function) {
  const content = custom.value.trim()
  if (!content) { toast.error('请输入状态内容'); return }
  void save({ icon: '', content, remark: remark.value }, close)
}
async function clear(close: Function) {
  try {
    await api('/user/status/clear')
    toast.success('状态已清除')
    emit('refresh')
    close()
  } catch (error) { toast.error(error instanceof Error ? error.message : String(error)) }
}
</script>

<style scoped>
.status-trigger { display: inline-flex; align-items: center; justify-content: center; width: 22px; height: 22px; border-radius: 9999px; transition: transform 120ms ease; }
.status-trigger:hover { transform: scale(1.12); }
.status-emoji { font-size: 15px; line-height: 1; filter: drop-shadow(0 1px 1px rgba(0,0,0,.4)); }
.status-add { display: inline-flex; align-items: center; justify-content: center; width: 22px; height: 22px; border-radius: 9999px; color: rgba(255,255,255,.92); background: rgba(255,255,255,.22); border: 1px dashed rgba(255,255,255,.5); }
.status-add-svg { width: 13px; height: 13px; }
.status-item { display: inline-flex; align-items: center; justify-content: center; height: 34px; font-size: 17px; border-radius: 8px; transition: background 120ms ease, transform 120ms ease; }
.status-item:hover { background: rgba(159,200,74,.16); transform: scale(1.08); }
.status-item.active { background: rgba(159,200,74,.28); box-shadow: inset 0 0 0 1.5px #9fc84a; }
</style>
