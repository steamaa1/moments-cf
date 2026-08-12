// 站点静态 SEO 配置：nuxt generate 时写入 index.html，
// 供不执行 JS 的搜索引擎爬虫（如 Bingbot）直接读取。
// 运行时 layouts/default.vue 会用后台 sysConfig（title/slogan）覆盖，
// 这里仅作为默认兜底（后台 slogan/title 为空时爬虫仍能看到完整 meta）。
export default {
  title: '极简朋友圈',
  description: '极简朋友圈 - 记录生活的每个瞬间，分享日常、心情与见闻的个人博客。',
  keywords: '朋友圈, 动态, 博客, 极简朋友圈, 个人博客, 生活记录',
  ogImage: '/cover.webp',
}
