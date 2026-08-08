<template>
  <div class="px-4 py-2 flex flex-col gap-2 mt-2" v-if="currentCommentBox === pid">
    <div class="relative">
      <UTextarea :rows="4" autofocus :placeholder="replyTo ? `回复给${replyTo}` : ''" v-model="state.content"/>
      <div class="flex gap-2 absolute right-3 bottom-2">
        <UIcon v-if="!global.userinfo.token" class="text-[#9fc84a] w-6 h-6 cursor-pointer" name="i-carbon-user-avatar" @click="toggleUser"/>
        <UIcon class="text-[#9fc84a] w-6 h-6 cursor-pointer select-none" name="i-carbon-face-satisfied" @click="toggleEmoji"/>
        <UButton class="cursor-pointer text-xs" color="white" @click="comment">发送</UButton>
      </div>
    </div>
    <Emoji v-if="emojiShow" @selected="emojiSelected"/>
    <div v-if="userShow" class="grid grid-cols-3 gap-1">
      <template v-if="!global.userinfo.token">
        <UInput class="min-w-0" placeholder="姓名" v-model="state.username"/>
        <UInput class="min-w-0" placeholder="网站" v-model="state.website"/>
        <UInput class="min-w-0" placeholder="邮箱" v-model="state.email"/>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import {toast} from "vue-sonner";
import {memoChangedEvent} from "~/event";
import Emoji from "~/components/Emoji.vue";
import {useGlobalState} from "~/store";
import {useStorage} from '@vueuse/core'
import type {SysConfigVO} from "~/types";

const props = defineProps<{
  commentId: number
  memoId: number
  replyTo?: string
  replyEmail?: string
}>()
const pid = computed(() => {
  return `${props.memoId}#${props.commentId}`
})
const global = useGlobalState()
const localCommentUserinfo = useStorage('localCommentUserinfo', {
  username: "",
  website: "",
  email: "",
})
const userShow = ref(!global.value.userinfo.token)
const emojiShow = ref(false)
const currentCommentBox = useState('currentCommentBox')
const sysConfig = useState<SysConfigVO>('sysConfig')
const state = reactive({
  content: "",
  memoId: props.memoId,
  replyTo: props.replyTo,
  replyEmail: props.replyEmail,
  username: localCommentUserinfo.value.username,
  website: localCommentUserinfo.value.website,
  email: localCommentUserinfo.value.email,
})


const { verify } = useHumanVerification()
const comment = async () => {
  try {
    await doComment(await verify('newComment'))
  } catch (error) {
    toast.error(error instanceof Error ? error.message : '人机验证失败')
  }
}

const doComment = async (token?: string) => {
  if (!global.value.userinfo.token) {
    localCommentUserinfo.value = {
      username: state.username,
      website: state.website,
      email: state.email,
    }
  }
  if (state.content.length > sysConfig.value.maxCommentLength) {
    toast.error("评论字数超过限制长度:" + sysConfig.value.maxCommentLength)
    return
  }
  await useMyFetch(`/comment/add`, {...state, token:token})
  toast.success("评论成功!")
  currentCommentBox.value = ''
  state.username = ''
  state.content = ''
  state.website = ''
  state.email = ''
  memoChangedEvent.emit(props.memoId)
}

const toggleUser = () => {
  userShow.value = !userShow.value
}
const toggleEmoji = () => {
  emojiShow.value = !emojiShow.value
}
const emojiSelected = (emoji: string) => {
  state.content = state.content + emoji
}
</script>

<style scoped>

</style>