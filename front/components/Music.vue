<template>
  <UPopover :ui="{base:'w-[360px]'}" :popper="{ arrow: true }" mode="click">
    <UIcon name="i-carbon-music" class="cursor-pointer w-6 h-6"/>
    <template #panel="{close}">
      <div class="max-h-[520px] overflow-y-auto p-4"><div class="flex flex-col gap-3">
        <UFormGroup label="选择平台" :ui="{label:{base:'font-bold'}}">
          <USelectMenu v-model="mode" :options="modes" value-attribute="value" option-attribute="label"/>
        </UFormGroup>
        <template v-if="mode === 'direct'">
          <UFormGroup label="音频链接" :ui="{label:{base:'font-bold'}}"><UInput v-model="url" type="url" placeholder="https://example.com/music.mp3"/></UFormGroup>
          <UFormGroup label="歌曲名" :ui="{label:{base:'font-bold'}}"><UInput v-model="name" placeholder="输入歌曲名称"/></UFormGroup>
          <UFormGroup label="滚动歌词（LRC）" :ui="{label:{base:'font-bold'}}"><UTextarea v-model="lrc" :rows="7" placeholder="[00:00.00] 歌词&#10;[00:12.50] 第一行"/></UFormGroup>
        </template>
        <template v-else>
          <UFormGroup label="音乐平台" :ui="{label:{base:'font-bold'}}"><USelectMenu v-model="server" :options="servers" value-attribute="value" option-attribute="label"/></UFormGroup>
          <UFormGroup label="类型" :ui="{label:{base:'font-bold'}}"><USelectMenu v-model="type" :options="types" value-attribute="value" option-attribute="label"/></UFormGroup>
          <UFormGroup label="ID" :ui="{label:{base:'font-bold'}}"><UInput v-model="id" placeholder="歌曲/播放列表/专辑 ID"/></UFormGroup>
          <div class="rounded-lg border border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800/70">
            <button type="button" class="flex w-full items-center justify-between px-3 py-2 text-sm font-medium" @click="customApiOpen = !customApiOpen">
              <span>自定义 Meting API</span>
              <UIcon :name="customApiOpen ? 'i-heroicons-chevron-up' : 'i-heroicons-chevron-down'" class="h-4 w-4 text-gray-400"/>
            </button>
            <div v-show="customApiOpen" class="space-y-3 px-3 pb-3 pt-1">
              <UFormGroup label="API 地址" :ui="{label:{base:'font-bold'}}">
                <UInput v-model="api" placeholder="https://api.i-meto.com/meting/api?server=:server&type=:type&id=:id&r=:r"/>
              </UFormGroup>
              <div class="flex justify-end">
                <UButton size="xs" color="gray" variant="soft" icon="i-heroicons-arrow-path" @click="api = defaultApi">恢复默认</UButton>
              </div>
            </div>
          </div>
        </template>
        <MusicPreview v-if="previewing" v-bind="draft" class="shrink-0"/>
        <div class="flex flex-wrap gap-2">
          <UButton color="indigo" variant="soft" :loading="previewLoading" @click="preview">预览</UButton>
          <UButton @click="confirm(close)">确定</UButton>
          <UButton color="white" @click="reset(close)">清空</UButton>
        </div>
      </div></div>
    </template>
  </UPopover>
</template>

<script setup lang="ts">
import type { MetingMusicServer, MetingMusicType, MusicDTO } from '@/types'
import { toast } from 'vue-sonner'
const defaultApi = 'https://api.i-meto.com/meting/api?server=:server&type=:type&id=:id&r=:r'
const props = withDefaults(defineProps<MusicDTO>(), { mode: 'platform', id: '', url: '', name: '', lrc: '', server: 'netease', type: 'song', api: defaultApi })
const emit = defineEmits<{ confirm: [music: MusicDTO] }>()
const mode = ref<'platform' | 'direct'>(props.mode || (props.url ? 'direct' : 'platform'))
const customApiOpen = ref(false)
const id = ref(props.id || ''), url = ref(props.url || ''), name = ref(props.name || ''), lrc = ref(props.lrc || '')
const server = ref<MetingMusicServer>(props.server), type = ref<MetingMusicType>(props.type), api = ref(props.api || defaultApi)
const modes = [{value:'platform',label:'在线音乐平台'},{value:'direct',label:'直链播放'}]
const servers = [{value:'netease',label:'网易云音乐'},{value:'tencent',label:'QQ音乐'},{value:'kugou',label:'酷狗音乐'},{value:'xiami',label:'虾米音乐'},{value:'baidu',label:'百度音乐'}]
const types = [{value:'song',label:'歌曲'},{value:'playlist',label:'播放列表'},{value:'album',label:'专辑'},{value:'search',label:'搜索'},{value:'artist',label:'艺术家'}]
const draft = computed<MusicDTO>(() => mode.value === 'direct' ? { mode:'direct', url:url.value.trim(), name:name.value.trim(), lrc:lrc.value } : { mode:'platform', id:id.value.trim(), server:server.value, type:type.value, api:api.value.trim() })
const valid = () => mode.value === 'direct' ? Boolean(url.value.trim() && name.value.trim()) : Boolean(id.value.trim() && server.value && type.value && api.value.trim())
const previewing = ref(false), previewLoading = ref(false)
const preview = () => { if(!valid()){toast.error('请完整填写所需信息');return} previewing.value=false;previewLoading.value=true;setTimeout(()=>{previewing.value=true;previewLoading.value=false},200) }
const confirm = (close: Function) => { if(!valid()){toast.error('请完整填写所需信息');return} emit('confirm', draft.value); close() }
const reset = (close: Function) => { previewing.value=false;mode.value='platform';id.value='';url.value='';name.value='';lrc.value='';server.value='netease';type.value='song';api.value=defaultApi;emit('confirm',{});close() }
watch(() => props, value => { mode.value=value.mode || (value.url?'direct':'platform');id.value=value.id||'';url.value=value.url||'';name.value=value.name||'';lrc.value=value.lrc||'';server.value=value.server;type.value=value.type;api.value=value.api||defaultApi }, {deep:true})
</script>
