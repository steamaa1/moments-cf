<template>
  <Header :user="currentUser"/>

  <div class="space-y-4  flex flex-col p-4 my-4 dark:bg-neutral-800">
    <UFormGroup label="头像" name="avatarUrl" :ui="{label:{base:'font-bold'}}">
      <UInput type="file" size="sm" icon="i-heroicons-folder" accept="image/*" @change="uploadAvatarUrl"/>
      <div class="text-gray-500 text-sm my-2">或者输入在线地址</div>
      <UInput v-model="state.avatarUrl" class="mb-2"/>
      <UAvatar :src="state.avatarUrl" size="lg"/>
    </UFormGroup>
    <UFormGroup label="顶部图片" name="coverUrl" :ui="{label:{base:'font-bold'}}">
      <UInput type="file" size="sm" icon="i-heroicons-folder" accept="image/*" @change="uploadCoverUrl"/>
      <div class="text-gray-500 text-sm my-2">或者输入在线地址</div>
      <UInput v-model="state.coverUrl" class="mb-2"/>
      <img :src="state.coverUrl" class="w-full rounded object-cover" alt="" />
    </UFormGroup>
    <UFormGroup label="登录名" name="username" :ui="{label:{base:'font-bold'}}">
      <UInput v-model="state.username" disabled />
    </UFormGroup>
    <UFormGroup label="昵称" name="nickname" :ui="{label:{base:'font-bold'}}">
      <UInput v-model="state.nickname" autocomplete="nickname"/>
    </UFormGroup>
    <UFormGroup label="心情状态" name="slogan" :ui="{label:{base:'font-bold'}}">
      <UInput v-model="state.slogan"/>
    </UFormGroup>
    <UFormGroup label="密码" name="slogan" :ui="{label:{base:'font-bold'}}">
      <UInput v-model="state.password" type="password" placeholder="留空则不修改密码" autocomplete="new-password"/>
    </UFormGroup>
    <UFormGroup label="邮箱" name="email" :ui="{label:{base:'font-bold'}}">
      <UInput v-model="state.email" type="email" placeholder="若管理员启用了邮件通知，将在收到评论时发送邮件通知" autocomplete="email"/>
    </UFormGroup>
    <UFormGroup label="Telegram User ID" name="telegramChatId" :ui="{label:{base:'font-bold'}}">
      <UInput v-model="state.telegramChatId" placeholder="向 @userinfobot 发送任意消息获取，填数字 ID"/>
      <p v-if="telegramBotUsername" class="text-xs text-gray-500 mt-1">提醒 Bot：@{{ telegramBotUsername }}。请先向 @{{ telegramBotUsername }} 发送一条消息以接收提醒；若管理员启用 Telegram 通知，评论时将推送。</p>
      <p v-else class="text-xs text-gray-500 mt-1">向 @userinfobot 发送任意消息获取你的数字 ID；若管理员启用 Telegram 通知，评论时将推送。</p>
    </UFormGroup>
    <UButton class="justify-center" @click="save">保存</UButton>
  </div>
</template>

<script setup lang="ts">
import type {SysConfigVO, UserVO} from "~/types";
import {toast} from "vue-sonner";
import {useUpload} from "~/utils";
import {useGlobalState} from "~/store";
const global = useGlobalState()
const currentUser = useState<UserVO>('userinfo')
const sysConfigState = useState<SysConfigVO>('sysConfig')
const telegramBotUsername = computed(() => sysConfigState.value?.telegramBotUsername || '')
const state = reactive({
  password: "",
  username: "",
  nickname: "",
  slogan: "",
  avatarUrl: "",
  coverUrl: "",
  email: "",
  telegramChatId: "",
  css: "",
  js: "",
})
const logout = async () => {
  global.value.userinfo = {}
  await navigateTo('/')
}
const reload = async () => {
  const res = await useMyFetch<UserVO>('/user/profile')
  if (res) {
    Object.assign(state, res)
    currentUser.value = res
  }
}

const save = async () => {
  await useMyFetch('/user/saveProfile', state)
  toast.success("保存成功")
  location.reload()
}

const uploadAvatarUrl = async (files: FileList) => {
  for (let i = 0; i < files.length; i++) {
    if (files[i].type.indexOf("image") < 0){
      toast.error("只能上传图片");
      return
    }
  }
  const result = await useUpload(files)
  if (result.length) {
    toast.success("上传成功")
    state.avatarUrl = result[0]
  }
}

const uploadCoverUrl = async (files: FileList) => {
  for (let i = 0; i < files.length; i++) {
    if (files[i].type.indexOf("image") < 0){
      toast.error("只能上传图片");
      return
    }
  }
  const result = await useUpload(files)
  if (result.length) {
    toast.success("上传成功")
    state.coverUrl = result[0]
  }
}

onMounted(async () => {
  Object.assign(state,currentUser.value)
})

</script>

<style scoped>

</style>