<template>
  <div
    class="w-full md:w-[567px] mx-auto h-full shadow-2xl dark:bg-neutral-900"
  >
    <slot />
    <Footer />
  </div>

  <div
    title="到顶部"
    v-if="y > 200"
    @click="y = 0"
    class="hidden sm:block bottom-[20%] sm:right-[20%] md:right-[10%] lg:right-[15%] xl:right-[20%] 2xl:right-[28%] fixed flex items-center justify-center"
  >
    <UIcon
      name="i-lets-icons-expand-top-stop"
      class="w-10 h-10 text-gray-500 cursor-pointer"
    ></UIcon>
  </div>

  <div class="sm:hidden relative">
    <div class="right-0 bottom-10 fixed flex items-center justify-end">
      <div class="flex flex-col items-center gap-2">
        <div
          v-if="y > 300"
          @click="y = 0"
          class="dark:bg-gray-900/85 mr-4 rounded-full bg-slate-50 w-10 h-10 flex items-center justify-center shadow-xl"
        >
          <UIcon
            name="i-lets-icons-expand-top-stop"
            class="w-6 h-6 text-[#9fc84a] cursor-pointer"
          ></UIcon>
        </div>
        <NuxtLink
          to="/new"
          v-if="global.userinfo.token && $route.path === '/'"
          class="dark:bg-gray-900/85 mr-4 rounded-full bg-slate-50 w-10 h-10 flex items-center justify-center shadow-xl"
        >
          <UIcon name="i-carbon-camera" class="w-6 h-6 text-[#9fc84a]"></UIcon>
        </NuxtLink>
        <div
          class="dark:bg-gray-900/85 mr-4 rounded-full bg-slate-50 w-10 h-10 flex items-center justify-center shadow-xl"
          @click="open = true"
        >
          <UIcon
            name="i-icon-park-solid-more-four"
            class="w-6 h-6 text-[#9fc84a] cursor-pointer"
          ></UIcon>
        </div>
        <NuxtLink
          to="/user/login"
          v-if="!global.userinfo.token && $route.path === '/'"
          class="dark:bg-gray-900/85 mr-4 rounded-full bg-slate-50 w-10 h-10 flex items-center justify-center shadow-xl"
        >
          <UIcon name="i-carbon-login" class="w-6 h-6 text-[#9fc84a]"></UIcon>
        </NuxtLink>
      </div>
    </div>

    <MobileNav :open="open" />
  </div>
</template>

<script lang="ts" setup>
import type { SysConfigVO, UserVO } from "~/types";
import { useGlobalState } from "~/store";
import site from "~/site.config";

const global = useGlobalState();
const open = useState<boolean>("sidebarOpen", () => false);
const currentUser = useState<UserVO>("userinfo");
const sysConfig = useState<SysConfigVO>("sysConfig");
const currentProfile = await useMyFetch<UserVO>("/user/profile");
const sysConfigVO = await useMyFetch<SysConfigVO>("/sysConfig/get");
if (currentProfile) {
  currentUser.value = currentProfile;
  sysConfig.value = sysConfigVO;
}
const { y } = useWindowScroll();
const seoTitle = sysConfigVO.title || site.title;
const seoDescription = sysConfigVO.seoDescription || (sysConfigVO.slogan ? `${sysConfigVO.slogan} · ${seoTitle}` : site.description);
const seoKeywords = sysConfigVO.seoKeywords || site.keywords;
useHead({
  title: seoTitle,
  link: [
    {
      rel: "shortcut icon",
      type: "image/png",
      href: sysConfigVO.favicon || "/favicon.png",
    },
    {
      rel: "apple-touch-icon-precomposed",
      href: sysConfigVO.favicon || "/favicon.png",
    },
    {
      rel: "alternate",
      type: "application/rss+xml",
      title: "我的 RSS 订阅",
      href: sysConfigVO.rss || `/rss`,
    },
  ],
  meta: [
    { name: "description", content: seoDescription },
    { name: "keywords", content: seoKeywords },
    { property: "og:site_name", content: seoTitle },
    { property: "og:type", content: "website" },
    { property: "og:title", content: seoTitle },
    { property: "og:description", content: seoDescription },
    { name: "twitter:card", content: "summary" },
    { name: "twitter:title", content: seoTitle },
    { name: "twitter:description", content: seoDescription },
  ],
  style: [
    {
      innerHTML: sysConfigVO.css || "",
    },
  ],
});

// 自定义 JS：SPA 路由切换后新页面 DOM 已渲染，此时执行才能挂载页脚/天气/统计等元素。
// 管理员脚本自带防重复检查，重复执行是幂等的。
function runCustomJs() {
  const code = sysConfigVO.js || "";
  if (!code) return;
  try { new Function(code)(); } catch (error) { console.error("自定义 JS 执行失败", error); }
}
onMounted(() => { runCustomJs(); const router = useRouter(); router.afterEach(() => { nextTick(() => runCustomJs()); }); });

if (sysConfigVO.enableTurnstile) {
  useHead({
    script: [{
      type: "text/javascript",
      src: "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit",
      async: true,
      defer: true,
    }],
  });
} else if (sysConfigVO.enableGoogleRecaptcha) {
  useHead({
    script: [
      {
        type: "text/javascript",
        src: `https://recaptcha.net/recaptcha/api.js?render=${sysConfigVO.googleSiteKey}`,
      },
    ],
  });
}
</script>
