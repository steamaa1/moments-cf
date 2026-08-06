# Moments Cloudflare Worker

当前是 **Phase 5**：核心功能已迁移至 Worker，并完成公开邮箱/评论隐私、Markdown XSS、reCAPTCHA 服务端验证、评论批量查询、R2/D1 上传回滚、点赞计数一致性及错误脱敏加固。

## 资源绑定

| Binding | Cloudflare 资源 |
| --- | --- |
| `DB` | D1：`moments-db` |
| `MEDIA` | R2：`moments-media` |
| `ASSETS` | `../front/.output/public` 的 Nuxt SPA 静态资源 |

## Cloudflare Workers Builds：只需两条命令

在 Dashboard → Workers Builds 中填写：

| 项目 | 填写 |
| --- | --- |
| 路径 | `worker` |
| 构建命令 | `npm run build:cf` |
| 部署命令 | `npm run deploy:cf` |

**不需要** `D1_DATABASE_ID` Build Variable。部署脚本会通过 Workers Builds 已使用的 API Token 查询已存在的 `moments-db`，在构建环境临时生成完整 Wrangler 配置，自动执行未应用的 D1 Migration 后部署。

Workers Builds 使用的 API Token 需有：`D1 Read`、`D1 Write`、`Workers Scripts Edit`，以及 R2 绑定/访问所需权限。仓库不会保存任何账户专属 D1 ID。

## 部署前必须设置的 Secrets

在 Cloudflare Worker 的 **Settings → Variables and Secrets** 添加加密 Secret：

| 名称 | 用途 |
| --- | --- |
| `JWT_SECRET` | 至少 32 字符的随机密钥，用于登录令牌签名 |
| `INIT_SECRET` | 首次管理员初始化接口的单次保护密钥，至少 24 字符 |

可选变量：`PBKDF2_ITERATIONS`，默认 `100000`。不要把任何 Secret 写入 `wrangler.toml` 或 Git。

## Phase 5 API

所有 API 保持 Moments 原本的 `{ code, message?, data }` 响应格式。登录后的请求继续兼容 `x-api-token`。

| 路径 | 方法 | 说明 |
| --- | --- | --- |
| `/api/health` | GET | Worker 与 Binding 状态 |
| `/api/admin/initialize` | POST | 首次建立管理员；需 `x-init-secret`，仅无用户时可用 |
| `/api/user/login` | POST | 登录，返回 `x-api-token` 兼容 JWT |
| `/api/user/profile` | POST | 当前登录用户资料；游客回退管理员资料 |
| `/api/user/profile/:username` | POST | 指定公开用户资料 |
| `/api/user/saveProfile` | POST | 保存当前用户资料/密码 |
| `/api/sysConfig/get` | POST | 公开系统配置，自动剔除敏感字段 |
| `/api/sysConfig/getFull` | POST | 管理员完整配置 |
| `/api/sysConfig/save` | POST | 管理员保存配置 |
| `/api/file/upload` | POST | 登录后上传 `files` 表单字段到 R2，单文件最大 25MB |
| `/api/memo/list` | POST | 动态分页列表、标签/用户/时间筛选 |
| `/api/memo/get?id=` | POST | 动态详情 |
| `/api/memo/save` | POST | 登录后发布或编辑动态 |
| `/api/memo/remove?id=` | POST | 作者或管理员删除动态 |
| `/api/memo/setPinned?id=` | POST | 管理员切换唯一置顶动态 |
| `/api/memo/like?id=&token=` | POST | 匿名访客点赞；同一浏览器去重；启用 reCAPTCHA 时服务端验证 token |
| `/api/tag/list` | POST | 当前登录用户的标签列表 |
| `/rss` | GET | 最近 15 条公开动态 RSS |
| `/api/comment/add` | POST | 添加评论（访客或登录用户）；启用 reCAPTCHA 时服务端验证 token |
| `/api/comment/remove?id=` | POST | 动态作者或管理员删除评论 |
| `/api/friend/list` | POST | 公开友链列表 |
| `/api/friend/add` | POST | 管理员添加友链 |
| `/api/friend/delete?id=` | POST | 管理员删除友链 |
| `/api/memo/getFaviconAndTitle?url=` | POST | 登录后抓取网页标题/Favicon；禁止内网/重定向 SSRF

## D1 Migration

首次部署后，在 Cloudflare Dashboard 的 D1 数据库 `moments-db` 中执行：

```text
worker/migrations/0001_schema.sql
worker/migrations/0002_memos.sql
worker/migrations/0003_comments_friends.sql
worker/migrations/0004_like_counters.sql
```

正常的 Workers Builds 部署命令 `npm run deploy:cf` 会在发布 Worker 前自动执行尚未应用的 Migration。`0004_like_counters.sql` 会按 `memo_likes` 修正已有点赞数，并通过 D1 Trigger 原子维护后续计数。仅在不使用该部署命令时，才需要在 Dashboard 手动执行。

## 本地检查

```bash
cd worker
npm run check
```

无需安装 Worker 专属依赖；检查包含 Worker/API 回归、安全与隐私、SQL Migration 真实 SQLite 行为、只读迁移工具和部署前检查。上线后可按 `scripts/release/README.md` 执行只读冒烟测试。
