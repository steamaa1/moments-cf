<template>
  <!-- 只读：点击显示小文字框（状态名 + 备注） -->
  <UPopover v-if="!editable && localStatus" mode="click" :ui="{ base: 'max-w-[240px]' }">
    <button type="button" class="status-trigger" :title="localStatus.content">
      <span class="status-emoji">{{ localStatus.icon || '💬' }}</span>
    </button>
    <template #panel>
      <div class="px-3 py-2">
        <p class="whitespace-nowrap text-sm font-semibold">{{ localStatus.icon }} {{ localStatus.content }}</p>
        <p v-if="localStatus.remark" class="mt-0.5 break-words text-xs leading-5 text-gray-600 dark:text-gray-300">{{ localStatus.remark }}</p>
      </div>
    </template>
  </UPopover>

  <!-- 可编辑：点击打开设置面板 -->
  <UPopover v-else-if="editable" mode="click" :ui="{ base: 'w-[330px]' }">
    <button type="button" class="status-trigger" :title="localStatus ? localStatus.content : '设置状态'">
      <span v-if="localStatus" class="status-emoji">{{ localStatus.icon || '💬' }}</span>
      <span v-else class="status-add">
        <svg viewBox="0 0 1024 1024" class="status-add-svg" xmlns="http://www.w3.org/2000/svg" fill="currentColor"><path d="M512 118.153846c61.046154 0 118.153846 13.784615 171.323077 39.384616 25.6 11.815385 35.446154 43.323077 23.630769 66.953846-11.815385 25.6-43.323077 35.446154-66.953846 23.630769-39.384615-19.692308-82.707692-29.538462-128-29.538462-161.476923 0-293.415385 131.938462-293.415385 293.415385S350.523077 805.415385 512 805.415385 805.415385 673.476923 805.415385 512c0-51.2-11.815385-98.461538-37.415385-141.784615-13.784615-23.630769-3.938462-55.138462 19.692308-68.923077s55.138462-3.938462 68.923077 19.692307A393.846154 393.846154 0 0 1 905.846154 512c0 216.615385-177.230769 393.846154-393.846154 393.846154S118.153846 728.615385 118.153846 512 295.384615 118.153846 512 118.153846z" p-id="894"></path></svg>
      </span>
    </button>
    <template #panel="{ close }">
      <div class="max-h-[460px] space-y-3 overflow-auto p-4">
        <div v-if="localStatus" class="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2 dark:bg-gray-800/70">
          <span class="truncate text-sm font-medium text-gray-800 dark:text-gray-100">{{ localStatus.icon }} {{ localStatus.content }}<span v-if="localStatus.remark" class="font-normal text-gray-500 dark:text-gray-400"> · {{ localStatus.remark }}</span></span>
          <UButton size="xs" color="red" variant="soft" @click="clear(close)">清除</UButton>
        </div>
        <UFormGroup label="持续时间" :ui="{label:{base:'font-bold'}}">
          <USelectMenu v-model="duration" :options="durations" value-attribute="value" option-attribute="label"/>
        </UFormGroup>
        <div v-for="group in builtins" :key="group.group">
          <p class="mb-1 text-xs font-medium text-gray-600 dark:text-gray-300">{{ group.group }}</p>
          <div class="grid grid-cols-6 gap-1">
            <button v-for="item in group.items" :key="item.content" type="button" class="status-item" :class="{ active: selected?.content === item.content }" :title="item.content" @click="pick(item)">
              <span class="status-item-emoji">{{ item.icon }}</span>
              <span class="status-item-text">{{ item.content }}</span>
            </button>
          </div>
        </div>
        <UFormGroup label="自定义状态" :ui="{label:{base:'font-bold'}}">
          <UInput v-model="custom" placeholder="输入状态文字，如：在看海" @keyup.enter="useCustom"/>
          <div class="mt-2 flex flex-wrap items-center gap-1">
            <button v-for="e in quickEmojis" :key="e" type="button" class="status-quick-emoji" :class="{ active: customIcon === e }" :title="e" @click="customIcon = e">{{ e }}</button>
            <UButton size="xs" color="gray" variant="soft" :label="emojiOpen ? '收起' : '更多'" @click="emojiOpen = !emojiOpen"/>
          </div>
          <Emoji v-if="emojiOpen" class="mt-2" @selected="onEmojiSelected"/>
          <p class="mt-1 text-xs text-gray-500">已选 emoji：<span class="text-base align-middle">{{ customIcon || '💬' }}</span></p>
        </UFormGroup>
        <UFormGroup label="备注（可选）" :ui="{label:{base:'font-bold'}}">
          <UInput v-model="remark" placeholder="附加说明，如：和朋友一起"/>
        </UFormGroup>
        <UButton block class="min-h-10 justify-center" :loading="saving" @click="save(close)">设置状态</UButton>
      </div>
    </template>
  </UPopover>
</template>

<script setup lang="ts">
import type { UserStatusVO } from '~/types'
import { useGlobalState } from '~/store'
import { toast } from 'vue-sonner'
import Emoji from '~/components/Emoji.vue'

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
// 本地状态：设置后立即更新，不依赖父级重新传入
const localStatus = ref<UserStatusVO | null>(props.status)
watch(() => props.status, value => { localStatus.value = value || null })
const selected = ref<{ icon: string; content: string } | null>(props.status ? { icon: props.status.icon || '', content: props.status.content } : null)
const custom = ref('')
const customIcon = ref('')
const emojiOpen = ref(false)
const quickEmojis = ['😀', '😄', '🤔', '💻', '🏃', '🍚', '🎧', '😴', '❤️', '🔥']
function onEmojiSelected(icon: string) {
  customIcon.value = icon
  emojiOpen.value = false
}
const remark = ref(props.status?.remark || '')
const duration = ref(24)
const saving = ref(false)
const tokenHeaders = () => global.value.userinfo.token ? { 'x-api-token': global.value.userinfo.token } : {}
async function api<T>(path: string, body?: unknown) {
  const response = await fetch(`/api${path}`, { method: 'POST', headers: { 'content-type': 'application/json', ...tokenHeaders() }, body: body ? JSON.stringify(body) : null })
  const result = await response.json() as { code: number; message?: string; data?: T }
  if (!response.ok || result.code !== 0) throw new Error(result.message || '请求失败')
  return result.data as T
}
function pick(item: { icon: string; content: string }) { selected.value = item; custom.value = '' }
function useCustom() {
  const content = custom.value.trim()
  if (!content) { toast.error('请输入状态内容'); return }
  selected.value = { icon: customIcon.value, content }
}
async function save(close: Function) {
  const customContent = custom.value.trim()
  const selectedValue = selected.value
  // 自定义输入框有内容时优先使用自定义状态（无需先按回车），否则用已选的预设状态
  if (!customContent && !selectedValue) { toast.error('请选择或输入状态'); return }
  const payload = customContent ? { icon: customIcon.value, content: customContent } : { icon: selectedValue!.icon, content: selectedValue!.content }
  saving.value = true
  try {
    const updated = await api<UserStatusVO>('/user/status/set', { ...payload, remark: remark.value.trim(), durationHours: duration.value })
    localStatus.value = updated
    toast.success('状态已更新')
    emit('refresh')
    close()
  } catch (error) { toast.error(error instanceof Error ? error.message : String(error)) } finally { saving.value = false }
}
async function clear(close: Function) {
  try {
    await api('/user/status/clear')
    localStatus.value = null
    selected.value = null
    remark.value = ''
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
.status-item { display: inline-flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; height: 52px; border-radius: 8px; transition: background 120ms ease, transform 120ms ease; }
.status-item-emoji { font-size: 18px; line-height: 1; }
.status-item-text { max-width: 100%; overflow: hidden; font-size: 10px; line-height: 1.2; color: #52525b; }
.status-quick-emoji { display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; border-radius: 8px; font-size: 16px; transition: background 120ms ease, transform 120ms ease; }
.status-quick-emoji:hover { background: rgba(159,200,74,.16); transform: scale(1.1); }
.status-quick-emoji.active { background: rgba(159,200,74,.22); box-shadow: inset 0 0 0 1.5px #9fc84a; }
:global(.dark) .status-item-text { color: #d4d4d8; }
.status-item:hover { background: rgba(159,200,74,.16); transform: scale(1.06); }
.status-item.active { background: rgba(159,200,74,.22); box-shadow: inset 0 0 0 1.5px #9fc84a; }
.status-item.active .status-item-text { font-weight: 600; color: #3f4f2c; }
:global(.dark) .status-item.active .status-item-text { color: #e4e4e7; }
</style>
