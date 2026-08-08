<template>
  <Header v-bind:user="currentUser" @add-friend="showAddModal = true" />
  <div class="flex justify-end px-4 pt-2">
    <UButton v-if="isAdmin" icon="i-carbon-add" size="sm" @click="showAddModal = true">添加友情链接</UButton>
  </div>
  <div class="bg-white dark:bg-neutral-800">
    <div class="grid sm:grid-cols-2 grid-cols gap-4 p-4">
      <div
        v-for="friend in friendList"
        :key="friend.id"
        class="bg-neutral-100 dark:bg-neutral-700 rounded-lg shadow-md overflow-hidden transition-transform hover:scale-105 duration-300 relative"
        @mouseenter="onMouseEnter(friend.id)"
        @mouseleave="onMouseLeave(friend.id)"
      >
        <a :href="friend.url" target="_blank" class="block p-4">
          <div class="flex items-center gap-2 mb-2">
            <img
              :src="friend.icon"
              alt="Friend Avatar"
              class="w-8 h-8 rounded-full"
            />
            <span class="text font-semibold">{{ friend.name }}</span>
          </div>
          <p class="text-gray-600 dark:text-gray-300 text-sm">
            {{ friend.desc || "暂无描述" }}
          </p>
        </a>
        <div
          v-if="globalState.userinfo.id === 1 && hoverFriendId === friend.id"
          class="absolute top-0 right-0 px-1 bg-white dark:bg-gray-900 m-2 rounded hover:text-red-500 cursor-pointer"
          @click="showConfirmModal(friend.id)"
        >
          <UIcon name="i-carbon-trash-can" />
        </div>
      </div>
    </div>
    <div
      class="flex justify-center items-center text-sm text-gray-400 pt-4 pb-10"
    >
      <span v-if="friendList && friendList.length">
        共 {{ friendList.length }} 个朋友
      </span>
      <span v-else class="text-gray-600 dark:text-gray-300 font-semibold">
        空空如也{{ globalState.userinfo.id === 1 ? '，请点击右上角添加' : '' }}
      </span>
    </div>
    <div class="mx-4 mb-4 rounded-xl border border-gray-200 p-4 dark:border-gray-700">
      <div class="flex items-center gap-2 mb-2"><UIcon name="i-carbon-link" class="h-5 w-5 text-[#9fc84a]"/><p class="font-semibold">友情链接申请与须知</p></div>
      <div v-if="friendNotice" class="friend-notice text-sm leading-6 text-gray-600 dark:text-gray-300" v-html="friendNoticeHtml"></div>
      <div v-else class="text-sm text-gray-500">暂未开放友情链接申请。</div>
      <div v-if="friendEmail" class="mt-3 border-t border-gray-100 pt-3 dark:border-gray-700">
        <p class="mb-2 text-sm font-medium">提交申请</p>
        <div class="grid gap-2 sm:grid-cols-2">
          <UInput v-model="apply.name" placeholder="站点名称"/>
          <UInput v-model="apply.url" placeholder="站点网址 https://"/>
          <UInput v-model="apply.icon" placeholder="站点图标（图片链接）"/>
          <UInput v-model="apply.desc" placeholder="一句话简介"/>
          <UInput v-model="apply.email" type="email" placeholder="你的邮箱"/>
        </div>
        <UButton class="mt-2" icon="i-carbon-send" @click="sendApply">发送申请</UButton>
      </div>
    </div>
  </div>

  <UModal
    v-model="showAddModal"
    :ui="{
      container:
        'fixed top-0 left-0 right-0 bottom-0 flex justify-center items-center backdrop-blur',
    }"
  >
    <div class="p-4">
      <p class="text-center text-lg font-bold mb-2">添加友情链接</p>
      <UForm class="space-y-4" size="sm" :state="friend">
        <UFormGroup
          label="名称"
          name="name"
          required
          :ui="{ label: { base: 'font-bold' } }"
        >
          <UInput v-model="friend.name" class="mb-2" required />
        </UFormGroup>
        <UFormGroup
          label="图标"
          name="icon"
          required
          :ui="{ label: { base: 'font-bold' } }"
        >
          <UInput v-model="friend.icon" class="mb-2" />
        </UFormGroup>
        <UFormGroup
          label="网址"
          name="url"
          required
          :ui="{ label: { base: 'font-bold' } }"
        >
          <UInput
            v-model="friend.url"
            class="mb-2"
            placeholder="必须以 http(s):// 开头"
          />
        </UFormGroup>
        <UFormGroup
          label="描述"
          name="desc"
          :ui="{ label: { base: 'font-bold' } }"
        >
          <UInput v-model="friend.desc" class="mb-2" />
        </UFormGroup>
        <div class="flex justify-end gap-2 mt-4">
          <UButton color="white" @click="showAddModal = false">取消</UButton>
          <UButton @click="addFriend">确认添加</UButton>
        </div>
      </UForm>
    </div>
  </UModal>

  <UModal
    v-model="showDeleteModal"
    :ui="{
      container:
        'fixed top-0 left-0 right-0 bottom-0 flex justify-center items-center',
    }"
  >
    <div class="p-4 bg-white dark:bg-neutral-800 rounded-lg shadow-md">
      <p class="text-center text-lg font-bold mb-2">确认删除</p>
      <p class="text-gray-600 mb-4">你确定要删除这个友情链接吗？</p>
      <div class="flex justify-end gap-2 mt-4">
        <UButton color="white" @click="cancelDelete">取消</UButton>
        <UButton @click="deleteFriend(friendIdToDelete)">确认删除</UButton>
      </div>
    </div>
  </UModal>
</template>

<script setup lang="ts">
import type { Friend, SysConfigVO, UserVO } from "~/types";
import { md } from "~/utils";
import { toast } from "vue-sonner";
import { useGlobalState } from "~/store";

const DEFAULT_FRIEND = {
  name: "",
  icon: "",
  url: "",
  desc: "",
};

const globalState = useGlobalState();
// 仅“已登录的管理员（id=1）”可见；未登录访客即使 profile 返回管理员资料也不算
const isAdmin = computed(() => {
  const g = globalState.value?.userinfo || {};
  return Boolean(g.token) && (Number(g.id) === 1 || Number(currentUser.value?.id) === 1);
});
const currentUser = useState<UserVO>("userinfo");
const sysConfigState = useState<SysConfigVO>('sysConfig');
const friendNotice = computed(() => sysConfigState.value?.friendNotice || '');
const friendEmail = computed(() => sysConfigState.value?.friendEmail || '');
const apply = reactive({ name: '', url: '', icon: '', desc: '', email: '' });
const friendNoticeHtml = computed(() => friendNotice.value ? md.render(friendNotice.value) : '');
const sendApply = () => {
  const email = friendEmail.value;
  if (!email) { toast.warning('暂未开放友情链接申请'); return; }
  if (!apply.name.trim() || !apply.url.trim() || !apply.email.trim()) { toast.warning('请填写站点名称、网址和你的邮箱'); return; }
  const subject = encodeURIComponent('友情链接申请 - ' + apply.name.trim());
  const body = encodeURIComponent(`站点名称：${apply.name.trim()}\n站点网址：${apply.url.trim()}\n站点图标：${apply.icon.trim() || '无'}\n一句话简介：${apply.desc.trim()}\n你的邮箱：${apply.email.trim()}\n\n已在本站添加贵站链接，请审核。`);
  window.location.href = `mailto:${email}?subject=${subject}&body=${body}`;
};

const friendList = ref<Friend[]>([]);

const showAddModal = ref(false);
const friend = ref({ ...DEFAULT_FRIEND });

const hoverFriendId = ref<number>(0);
const showDeleteModal = ref(false);
const friendIdToDelete = ref<number>(0);

const addFriend = async () => {
  if (!friend.value.name) {
    toast.warning("名称不能为空");
    return;
  }

  if (!friend.value.icon) {
    toast.warning("图标地址不能为空");
    return;
  }

  if (!friend.value.url) {
    toast.warning("网址不能为空");
    return;
  }

  if (
    !/^https?:\/\//.test(friend.value.url) ||
    !/^https?:\/\//.test(friend.value.icon)
  ) {
    toast.warning("地址必须以 http 或 https 开头");
    return;
  }

  try {
    const response = await useMyFetch("/friend/add", friend.value);
    toast.success("友情链接添加成功");
    await getFriendList();
    showAddModal.value = false;
    friend.value = { ...DEFAULT_FRIEND };
  } catch (error) {
    toast.error(error instanceof Error ? error.message : "添加友情链接失败");
  }
};

const getFriendList = async () => {
  try {
    const response = await useMyFetch("/friend/list");
    friendList.value = response.list as Friend[];
  } catch (error) {
    friendList.value = [];
  }
};

const onMouseEnter = (id: number) => {
  hoverFriendId.value = id;
};

const onMouseLeave = (id: number) => {
  hoverFriendId.value = 0;
};

const showConfirmModal = (id: number) => {
  friendIdToDelete.value = id;
  showDeleteModal.value = true;
};

const cancelDelete = () => {
  showDeleteModal.value = false;
};

const deleteFriend = async (id: number) => {
  try {
    await useMyFetch(`/friend/delete?id=${id}`);
    toast.success("友情链接删除成功");

    await getFriendList();
    showDeleteModal.value = false;
  } catch (error) {
    toast.error(error instanceof Error ? error.message : "删除友情链接失败");
  }
};

onMounted(() => {
  getFriendList();
});
</script>

<style scoped>
.friend-notice { max-width: 100%; overflow-wrap: anywhere; word-break: break-word; }
.friend-notice :deep(p) { margin: 4px 0; }
.friend-notice :deep(ul), .friend-notice :deep(ol) { margin: 4px 0; padding-left: 20px; }
.friend-notice :deep(ul) { list-style: disc; }
.friend-notice :deep(ol) { list-style: decimal; }
.friend-notice :deep(h1), .friend-notice :deep(h2), .friend-notice :deep(h3) { margin: 10px 0 4px; font-weight: 700; }
.friend-notice :deep(a) { color: #576b95; text-decoration: underline; overflow-wrap: anywhere; word-break: break-all; }
.friend-notice :deep(blockquote) { margin: 6px 0; padding-left: 12px; border-left: 3px solid rgba(161,161,170,.35); color: #71717a; }
.friend-notice :deep(code) { background: rgba(161,161,170,.15); border-radius: 4px; padding: 1px 5px; font-size: 0.9em; }
</style>
