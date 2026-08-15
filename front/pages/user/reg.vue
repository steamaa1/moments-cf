<template>
  <Header v-if="currentUser" v-bind:user="currentUser"/>

  <div class="pb-20">
    <UCard :ui="{base:'w-4/5 mx-auto mt-20'}">

      <p class="text-center text-2xl font-sans">注册用户</p>
      <UForm class="space-y-4" size="sm" :state="state">
        <UFormGroup label="用户名" name="email">
          <UInput v-model="state.username" autocomplete="username"/>
        </UFormGroup>

        <UFormGroup label="邮箱" name="email">
          <UInput type="email" v-model="state.email" autocomplete="email" placeholder="选填，用于接收审批结果通知"/>
        </UFormGroup>

        <UFormGroup label="密码" name="password">
          <UInput type="password" v-model="state.password" autocomplete="new-password"/>
        </UFormGroup>
        <UFormGroup label="重复密码" name="repeatPassword">
          <UInput type="password" v-model="state.repeatPassword" autocomplete="new-password"/>
        </UFormGroup>
        <UFormGroup v-if="sysConfig.enableRegisterApproval" label="注册理由" name="reason" :ui="{label:{base:'font-bold'}}">
          <UTextarea v-model="state.reason" :rows="3" placeholder="请简要说明注册理由（必填）"/>
        </UFormGroup>
        <UButtonGroup size="sm">
          <UButton @click="doReg" :disabled="pending" :loading="pending">注册</UButton>
          <UButton color="gray" variant="solid" to="/user/login">去登录</UButton>
        </UButtonGroup>
      </UForm>
    </UCard>
  </div>
</template>

<script setup lang="ts">
import type {UserVO, SysConfigVO} from "~/types";
import {toast} from "vue-sonner";

const state = reactive({
  username: "",
  email: "",
  reason: "",
  password: "",
  repeatPassword: ""
})
const pending = ref(false)
const currentUser = useState<UserVO>('userinfo')
const sysConfig = useState<SysConfigVO>('sysConfig')

onMounted(async () => {
  if (!sysConfig.value?.enableRegister) {
    await navigateTo('/')
  }
})

const doReg = async () => {
  if (state.username.length < 3) {
    toast.warning("用户名最少3个字符")
    return
  }
  if (sysConfig.value?.enableRegisterApproval && !state.reason.trim()) {
    toast.warning("请填写注册理由")
    return
  }
  let success = false
  pending.value = true
  try {
    const res = await useMyFetch<{ awaitingApproval?: boolean }>('/user/reg', state)
    if (res?.awaitingApproval) {
      toast.success("注册成功，等待管理员审批后可登录")
    } else {
      toast.success("注册成功,快去登录吧!")
    }
    success = true
  } finally {
    pending.value = false
  }
  if (success) {
    await navigateTo('/user/login')
  }
}
</script>

<style scoped>

</style>