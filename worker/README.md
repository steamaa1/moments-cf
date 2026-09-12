# Moments Cloudflare Worker

单个 Worker 提供 API、Nuxt Workers Assets、RSS 和私有 R2 媒体代理；D1 保存结构化数据。

## 部署

Cloudflare Workers Builds：

| 项目 | 值 |
| --- | --- |
| Root directory | `worker` |
| Build command | `npm run build:cf` |
| Deploy command | `npm run deploy:cf` |

部署脚本会按名称查询 `moments-db`，应用 `0001`～`0016` 全部 Migration，设置 R2 CORS，再部署 Worker。计划任务每日 `03:00 UTC` 触发，按后台配置的备份间隔（默认 7 天）与保留天数（默认 90 天）执行。

## Bindings 与 Variables

- `DB`：D1 `moments-db`
- `MEDIA`：私有 R2 `moments-media`
- `ASSETS`：`../front/.output/public`
- `CLOUDFLARE_ACCOUNT_ID`、`D1_DATABASE_ID`、`R2_BUCKET_NAME`：部署脚本写入生成配置

## 必需 Secrets

基础功能：

- `JWT_SECRET`：至少 32 字符
- `INIT_SECRET`：至少 24 字符

500MB R2 预签名直传：

- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`

每周 D1→R2 备份与恢复：

- `D1_BACKUP_API_TOKEN`：仅授予目标账户 D1 Read/Write 权限

邮件通知（可二选一或同时配置）：

- `SMTP_PASSWORD`：SMTP 465/587 密码/授权码
- `RESEND_API_KEY`：SMTP 不可用时回退 Resend

Host、端口、用户名和发件地址在管理员设置页保存；密码/授权码或 Resend API Key 经 AES-GCM 加密后存入 D1，不会明文回传。

## Phase 7 功能

- 浏览器分块计算 SHA-256，重复文件秒传
- 浏览器生成最大边 640px、质量 0.78 的 WebP 缩略图并存 R2
- 小文件经 Worker；20MB～500MB 使用 SigV4 预签名 PUT 直传 R2
- SMTP 465 隐式 TLS、587 STARTTLS；后台密码/授权码经 JWT_SECRET 派生 AES-GCM 密钥加密存 D1；`re_` 开头凭据使用 Resend
- Cloudflare Turnstile 评论/点赞验证，启用时优先于 Google reCAPTCHA
- 备案信息支持安全 HTML 过滤；关于页内容支持 Markdown 与完整 HTML（管理员可信）
- 豆瓣 JSON-LD 解析兜底和严格同域封面代理
- D1 按后台配置的间隔（默认 7 天）与保留天数（默认 90 天）自动备份到 R2；管理员可列表、下载、恢复，也可手动立即备份
- 恢复要求当前管理员密码和完整备份名称，并在覆盖前自动再备份
- RSS 包含 Markdown、外链、图片、音乐、视频和豆瓣卡片链接

## SEO 与 GEO

- **页面级 SEO 注入**：所有 SPA HTML 响应动态注入站点 title/描述/关键词/og/twitter/canonical；`/memo/:id` 额外注入该条动态专属的标题、摘要、首图 og:image 与 JSON-LD `SocialMediaPosting`，`/user/:id` 注入 `ProfilePage`，首页注入 `WebSite`，`/` 以外路径按需回退。私密（`show_type=0`）、定时未发布或不存在的动态/用户页注入 `noindex, nofollow`。
- **`/llms.txt` 与 `/llms-full.txt`**（GEO，零配置默认启用）：面向 AI 搜索引擎的纯文本站点摘要（llmstxt.org 格式）。`/llms.txt` 列页面链接与最近 50 条公开动态；`/llms-full.txt` 附最近 100 条动态正文（markdown 原文，单条截断 2000 字符）。D1 未配置时返回 503。
- **`/robots.txt`**：通配组禁抓 `/api/`、`/upload/` 与私密路径；`Googlebot-Image` 与社交预览爬虫（facebookexternalhit/Twitterbot/Slackbot/Discordbot）放行媒体抓取；搜索引用类 AI 爬虫（OAI-SearchBot、PerplexityBot/Perplexity-User、ClaudeBot/Claude-User/Claude-SearchBot、Applebot/Applebot-Extended、YouBot、DuckAssistBot）放行公开内容；训练类爬虫（GPTBot、CCBot、Google-Extended、meta-externalagent、Amazonbot）全站禁止。
- **`/sitemap.xml`**：Google 图片站点地图扩展（`xmlns:image`，每条 URL 最多 10 张配图）；首页 `lastmod` 取最新公开动态；收录自定义图集页（`/photos/album/:id`，默认图集除外）与标签聚合页（`/tags/:username/:tag`，按用户+标签去重）；memo `lastmod` 用 `created_at`（`updated_at` 会被点赞触发器更新）；响应 `cache-control: public, max-age=3600`。

## Migration

```text
0001_schema.sql
0002_memos.sql
0003_comments_friends.sql
0004_like_counters.sql
0005_phase6_consistency_trash.sql
0006_phase7_media.sql
0007_migration_runs.sql
0008_user_status.sql
0009_telegram_notify.sql
0010_media_storage_backend.sql
0011_comment_network_rate.sql
0012_like_network_dedup.sql
0013_login_rate_limit.sql
0014_registration_approval.sql
0015_comment_rate_buckets.sql
0016_photo_albums.sql
```

`0006` 增加 `sha256`、`thumbnail_key`、`upload_state` 及索引；`0007` 记录迁移包状态，防止重复导入；`0016` 增加照片墙图集（`photo_albums`/`photo_album_items`）。Migration 真值以 `worker/migrations/` 目录与 `deploy-cf.mjs` 为准。

## 检查

```bash
cd worker
npm run check
```
