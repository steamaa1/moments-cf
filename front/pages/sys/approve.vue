<template>
  <Header v-bind:user="currentUser" />
  <div class="p-4 max-w-2xl mx-auto">
    <div class="flex items-center justify-between mb-4">
      <h1 class="text-2xl font-bold">用户注册审批</h1>
      <UButton color="gray" variant="soft" @click="refresh">
        刷新列表
      </UButton>
    </div>

    <div v-if="pending" class="text-center py-8">
      <UButton :loading="pending" color="gray" variant="soft">加载中…</UButton>
    </div>

    <div v-else-if="requests.length === 0" class="text-center py-12 text-gray-500">
      暂无待审批注册
    </div>

    <div v-else class="space-y-4">
      <div
        v-for="req in requests"
        :key="req.id"
        class="bg-white dark:bg-neutral-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6"
      >
        <div class="flex items-center justify-between mb-4">
          <div>
            <p class="font-medium">{{ req.username }}（{{ req.nickname || '未设置' }}）</p>
            <p class="text-sm text-gray-500">{{ req.email }}</p>
          </div>
          <div class="flex gap-2">
            <UButton color="red" variant="soft" @click="reject(req)">拒绝</UButton>
            <UButton color="green" variant="solid" @click="approve(req)">批准</UButton>
          </div>
        </div>

        <div class="text-sm text-gray-500 mb-2">申请理由：</div>
        <div class="bg-gray-50 dark:bg-neutral-900 p-3 rounded mb-3 whitespace-pre-wrap">
          {{ req.reason || '（未填写理由）' }}
        </div>

        <div class="text-xs text-gray-400">
          申请时间：{{ $dayjs.utc(req.createdAt).local().format('YYYY-MM-DD HH:mm') }}
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { UserVO } from "~/types";
import { useGlobalState } from "~/store";
import { toast } from "vue-sonner";

const global = useGlobalState();
const currentUser = useState<UserVO>("userinfo");
const requests = ref<any[]>([]);

// 仅管理员可访问审批页
if (global.value.userinfo.id !== 1) await navigateTo("/", { replace: true });

const pending = ref(false);
const refresh = async () => {
  if (pending.value) return;
  pending.value = true;
  try {
    const res = await useMyFetch<any>("/admin/registration/requests");
    requests.value = res || [];
  } catch (error: any) {
    toast.error(error.message || "加载失败");
  } finally {
    pending.value = false;
  }
};

const approve = async (req: any) => {
  try {
    await useMyFetch("/admin/registration/approve", { id: req.id });
    toast.success("已批准");
    await refresh();
  } catch (error: any) {
    toast.error(error.message || "批准失败");
  }
};

const reject = async (req: any) => {
  try {
    await useMyFetch("/admin/registration/reject", { id: req.id });
    toast.success("已拒绝");
    await refresh();
  } catch (error: any) {
    toast.error(error.message || "拒绝失败");
  }
};

onMounted(async () => {
  await refresh();
});
</script>