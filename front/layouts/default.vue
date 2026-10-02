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
          v-if="authUser.token && $route.path === '/'"
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
          v-if="!authUser.token && $route.path === '/'"
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
const authUser = computed(() => global?.value?.userinfo ?? {});
const open = useState<boolean>("sidebarOpen", () => false);
const currentUser = useState<UserVO>("userinfo");
const sysConfig = useState<SysConfigVO>("sysConfig", () => ({} as SysConfigVO));
const [currentProfile, loadedSysConfig] = await Promise.all([
  useMyFetch<UserVO>("/user/profile"),
  useMyFetch<SysConfigVO>("/sysConfig/get"),
]);
if (currentProfile) currentUser.value = currentProfile;
if (loadedSysConfig) sysConfig.value = { ...sysConfig.value, ...loadedSysConfig };
const { y } = useWindowScroll();
const route = useRoute();
const seoTitle = computed(() => sysConfig.value.title || site.title);
const seoDescription = computed(() => sysConfig.value.seoDescription || ((sysConfig.value as any).slogan ? `${(sysConfig.value as any).slogan} · ${seoTitle.value}` : site.description));
const seoKeywords = computed(() => sysConfig.value.seoKeywords || site.keywords);
const canonicalBase = computed(() => (sysConfig.value.siteUrl || (typeof window !== 'undefined' ? window.location.origin : '')).replace(/\/+$/, ''));
// 规范 URL 统一无尾斜杠（根路径除外），与 Worker 注入值和 sitemap 对齐。
// unhead 对 link[rel=canonical] 使用固定去重键，运行时会接管并更新服务端已渲染的同名标签，
// 因此这里若保留 route.path 的尾斜杠，最终生效的 canonical 就会与 sitemap 不一致。
const canonicalPath = computed(() => route.path.replace(/\/+$/, '') || '/');
const canonicalUrl = computed(() => canonicalBase.value ? canonicalBase.value + canonicalPath.value : '');
// og:image 需绝对地址才能被社交与部分搜索引擎爬虫识别；默认站点封面
const seoOgImage = computed(() => canonicalBase.value + (site.ogImage || '/cover.webp'));
// 后台关闭 SEO 总开关时全站 noindex；Googlebot 会执行 JS，若不在这里同步，
// 运行时的 "index, follow" 会覆盖 Worker 注入的 noindex
const noindex = computed(() => sysConfig.value.enableSeo === false || ['/new', '/edit', '/user/login', '/user/reg', '/user/settings', '/sys/'].some(prefix => route.path.startsWith(prefix)));
useHead(() => ({
  title: seoTitle.value,
  link: [
    {
      rel: "shortcut icon",
      type: "image/png",
      href: sysConfig.value.favicon || "/favicon.png",
    },
    {
      rel: "apple-touch-icon-precomposed",
      href: sysConfig.value.favicon || "/favicon.png",
    },
    {
      rel: "alternate",
      type: "application/rss+xml",
      title: "我的 RSS 订阅",
      href: sysConfig.value.rss || `/rss`,
    },
    ...(canonicalUrl.value ? [{ rel: "canonical", href: canonicalUrl.value }] : []),
  ],
  meta: [
    { name: "description", content: seoDescription.value },
    { name: "keywords", content: seoKeywords.value },
    { name: "robots", content: noindex.value ? "noindex, nofollow" : "index, follow" },
    { property: "og:site_name", content: seoTitle.value },
    { property: "og:type", content: "website" },
    { property: "og:title", content: seoTitle.value },
    { property: "og:description", content: seoDescription.value },
    { property: "og:image", content: seoOgImage.value },
    ...(canonicalUrl.value ? [{ property: "og:url", content: canonicalUrl.value }] : []),
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:title", content: seoTitle.value },
    { name: "twitter:description", content: seoDescription.value },
  ],
  style: [
    {
      innerHTML: sysConfig.value.css || "",
    },
  ],
}));

// 自定义 JS：SPA 路由切换后新页面 DOM 已渲染，此时执行才能挂载页脚/天气/统计等元素。
// 管理员脚本自带防重复检查，重复执行是幂等的。
function runCustomJs() {
  const code = sysConfig.value.js || "";
  if (!code) return;
  try { new Function(code)(); } catch (error) { console.error("自定义 JS 执行失败", error); }
}
onMounted(() => { runCustomJs(); const router = useRouter(); router.afterEach(() => { nextTick(() => runCustomJs()); }); });

if (sysConfig.value.enableTurnstile) {
  useHead({
    script: [{
      type: "text/javascript",
      src: "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit",
      async: true,
      defer: true,
    }],
  });
} else if (sysConfig.value.enableGoogleRecaptcha) {
  useHead({
    script: [
      {
        type: "text/javascript",
        src: `https://recaptcha.net/recaptcha/api.js?render=${sysConfig.value.googleSiteKey}`,
      },
    ],
  });
}
</script>
