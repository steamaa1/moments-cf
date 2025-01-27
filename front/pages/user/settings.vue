<template>
  <Header :user="currentUser"/>

  <div class="space-y-4  flex flex-col p-4 my-4 dark:bg-neutral-800">
    <UFormGroup label="头像" name="avatarUrl" :ui="{label:{base:'font-bold'}}">
      <UInput type="file" size="sm" icon="i-heroicons-folder" @change="uploadAvatarUrl"/>
      <div class="text-gray-500 text-sm my-2">或者输入在线地址</div>
      <UInput v-model="state.avatarUrl" class="mb-2"/>
      <UAvatar :src="state.avatarUrl" size="lg"/>
    </UFormGroup>
    <UFormGroup label="顶部图片" name="coverUrl" :ui="{label:{base:'font-bold'}}">
      <UInput type="file" size="sm" icon="i-heroicons-folder" @change="uploadCoverUrl"/>
      <div class="text-gray-500 text-sm my-2">或者输入在线地址</div>
      <UInput v-model="state.coverUrl" class="mb-2"/>
      <img :src="state.coverUrl" class="w-full rounded object-cover" alt="" />
    </UFormGroup>
    <UFormGroup label="登录名" name="username" :ui="{label:{base:'font-bold'}}">
      <UInput v-model="state.username" disabled />
    </UFormGroup>
    <UFormGroup label="昵称" name="nickname" :ui="{label:{base:'font-bold'}}">
      <UInput v-model="state.nickname"/>
    </UFormGroup>
    <UFormGroup label="心情状态" name="slogan" :ui="{label:{base:'font-bold'}}">
      <UInput v-model="state.slogan"/>
    </UFormGroup>
    <UFormGroup label="密码" name="slogan" :ui="{label:{base:'font-bold'}}">
      <UInput v-model="state.password" type="password" placeholder="留空则不修改密码"/>
    </UFormGroup>
    <UFormGroup label="是否启用邮件通知" name="enableEmail" :ui="{label:{base:'font-bold'}}">
      <UToggle v-model="state.enableEmail"/>
    </UFormGroup>
    <UFormGroup label="smtp服务器" name="smtpHost" :ui="{label:{base:'font-bold'}}">
      <UInput v-model="state.smtpHost" placeholder="smtp.qq.com"/>
    </UFormGroup>
    <UFormGroup label="smtp端口" name="smtpPort" :ui="{label:{base:'font-bold'}}">
      <UInput v-model="state.smtpPort" placeholder="465"/>
    </UFormGroup>
    <UFormGroup label="smtp用户名" name="smtpUsername" :ui="{label:{base:'font-bold'}}">
      <UInput v-model="state.smtpUsername" placeholder="******@qq.com"/>
    </UFormGroup>
    <UFormGroup label="smtp密码/授权码" name="smtpPassword" :ui="{label:{base:'font-bold'}}">
      <UInput v-model="state.smtpPassword" type="password"/>
    </UFormGroup>
    <UButton class="justify-center" @click="save">保存</UButton>
  </div>
</template>

<script setup lang="ts">
import type {UserVO} from "~/types";
import {toast} from "vue-sonner";
import {useUpload} from "~/utils";
import {useGlobalState} from "~/store";
const global = useGlobalState()
const currentUser = useState<UserVO>('userinfo')
const state = reactive({
  password: "",
  username: "",
  nickname: "",
  slogan: "",
  avatarUrl: "",
  coverUrl: "",
  css: "",
  js: "",
  enableEmail: false,
  smtpHost: "",
  smtpPort: "",
  smtpUsername: "",
  smtpPassword: "",
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
  await reload()
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