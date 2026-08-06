# Moments Cloudflare Worker

单个 Worker 提供 API、Nuxt Workers Assets、RSS 和私有 R2 媒体代理；D1 保存结构化数据。

## 部署

Cloudflare Workers Builds：

| 项目 | 值 |
| --- | --- |
| Root directory | `worker` |
| Build command | `npm run build:cf` |
| Deploy command | `npm run deploy:cf` |

部署脚本会按名称查询 `moments-db`，应用 `0001`～`0007` Migration，设置 R2 CORS，再部署 Worker。计划任务每日 `03:00 UTC` 触发，按后台配置的备份间隔（默认 7 天）与保留天数（默认 90 天）执行。

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

## Migration

```text
0001_schema.sql
0002_memos.sql
0003_comments_friends.sql
0004_like_counters.sql
0005_phase6_consistency_trash.sql
0006_phase7_media.sql
0007_migration_runs.sql
```

`0006` 增加 `sha256`、`thumbnail_key`、`upload_state` 及索引；`0007` 记录迁移包状态，防止重复导入。

## 检查

```bash
cd worker
npm run check
```
