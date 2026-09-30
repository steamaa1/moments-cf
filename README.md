# Moments CF

> 基于 [kingwrcy/moments](https://github.com/kingwrcy/moments) 改造的 Cloudflare 原生版朋友圈/动态博客。无需服务器，一个 Cloudflare Worker 同时提供前端与 API，数据存 D1，媒体存私有 R2。

本分支不是 Docker/SQLite 版本。需要原版自托管方案时，请查看上游仓库的 `dev` 分支。

> 🎮 在线演示：<https://wb.me-i.top>

>本项目使用**GPT-5.6-Sol** 和 **DeepSeek-V4-Flash**进行开发

## 目录

- [特性](#特性)
- [快速开始](#快速开始)
- [使用指南](#使用指南)
- [配置](#配置)
- [本地开发](#本地开发)
- [架构](#架构)
- [相关文档](#相关文档)
- [许可证与致谢](#许可证与致谢)

## 特性

### 原版支持（继承自上游 Docker 版）

- 完整朋友圈功能：Markdown 动态、多图上传、标签、地点、公开/私密、定时发布、置顶、点赞、评论（含回复与匿名游客评论）、外链卡片、在线音乐、B站/YouTube 视频、豆瓣图书/电影卡片、友情链接、RSS
- 系统设置：网站标题、Favicon、备案、自定义 CSS/JS、评论开关与排序、注册开关、Google reCAPTCHA
- 日历检索

### 新增与改良

- **无服务器部署**：单 Cloudflare Worker 提供前端、API、RSS 与媒体代理，D1 存结构化数据，R2 存图片/视频，无需服务器
- **可插拔媒体存储**：R2 / S3 兼容 / WebDAV 三选一，切换后旧 R2 媒体仍可访问（读旧写新），凭据 AES-GCM 加密存储
- **大文件直传**：SHA-256 内容寻址秒传去重；20MB～500MB 走 SigV4 预签名直传；浏览器生成 WebP 缩略图
- **附件上传**：动态可携带文档、压缩包与纯文本等附件（类型白名单，刻意排除 html/svg/js 等同源可执行类型）；单个大小与单次数量上限可在系统设置里配置；附件一律以「另存为」下发，中文文件名不乱码
- **照片墙与图集**：动态图片自动汇总为时间线，可按图集浏览与分页加载；图集管理集中在管理面板（新建/编辑/添加照片/精选），删除统一收进照片管理并支持多选批量移除，未被动态引用的上传文件移入回收站
- **数据安全**：D1 自动备份（间隔与保留天数可配置，目标可选 R2/S3/WebDAV）、手动备份、本地导出、双重确认恢复、未引用媒体 7 天回收站
- **微信状态**：每用户一个带 emoji 的状态（默认 24 小时，时长可自定义），封面昵称与动态作者昵称旁展示，内置 30+ 微信同款状态
- **人机验证**：Cloudflare Turnstile（可优先于 Google reCAPTCHA）
- **安全加固**：PBKDF2 密码、匿名点赞去重、评论限流、SSRF 防护、URL 白名单、错误信息脱敏、音乐直链播放（LRC 滚动歌词）
- **旧站一键迁移**：本地转换器生成标准迁移包，后台预检后导入 D1 与所选存储，支持断点重试与防重复导入
- **X 原帖快照卡片**：发表时从 X syndication 抓取作者/头像/正文/图片/互动数据并永久保存，媒体走同域代理，刷新不依赖 iframe 或 X Widget
- **Git 静态嵌入**：支持 GitHub、GitLab、Gitea、Forgejo、Codeberg 等公开 Git 托管平台的仓库、文件、Issue、PR、Commit、Release 链接；发表时抓取公开元数据并保存为静态卡片，不依赖第三方 iframe
- **站内动态引用**：发表面板粘贴 `/memo/{id}` 或本站动态链接，自动抓取被引用动态的作者、正文与图片生成静态卡片，点击可跳转回原动态，仅支持本站 `/memo/*`
- **内容块手动排序**：图片、链接、音乐、Git/X 嵌入、站内引用、附件、豆瓣卡片与视频可按需拖拽排序（左侧圆点手柄，触屏可用，聚焦后亦可用方向键微调）；编辑面板与动态展示共用同一顺序，所见即所得
- **照片墙选图**：发表面板可直接引用照片墙/图集中已有图片，支持关键词搜索、分页加载与已添加去重
- **动态分享**：每条动态的「更多」操作里可一键复制动态链接
- **豆瓣多卡片**：读书/电影各最多 10 个，兼容旧单卡片数据
- **音乐直链增强**：支持歌手与封面（上传或直链），LRC 滚动歌词
- **友情链接申请与须知**：系统可配置须知内容与申请邮箱，友链页展示申请表单
- **Telegram 评论通知**：系统配置 Bot Token/用户名，个人配置 User ID，评论时推送
- **评论通知免打扰**：评论者即动态作者本人时不发送邮件/Telegram 通知，避免打扰自己；作者回复他人评论时仍通知被回复人
- **SEO 与 GEO**：动态 sitemap、全站 meta/canonical/lang；详情页/主页注入页面级 meta 与 JSON-LD，私密动态 noindex；llms.txt 供 AI 摘要；robots 放行搜索引用类 AI 和预览爬虫，屏蔽训练类；系统设置可一键关闭全站收录。
- **体验优化**：上传媒体短随机命名（约 14 字符）、自定义 JS 路由切换后重新执行、系统设置按分区标签页陈列并支持 `?tab=` 深链与未保存更改提示
- **其它**：添加关于页面、朋友圈式时间线

## 快速开始

### 前置要求

- 一个 Cloudflare 账号（Free 计划即可）
- 仓库 `cf` 分支

### 1. 连接仓库并配置构建

在 Cloudflare Dashboard 连接本仓库的 `cf` 分支（Workers & Pages → Create → Workers → Connect to Git），然后设置：

| 项目 | 值 |
| --- | --- |
| Root directory | `worker` |
| Build command | `npm run build:cf` |
| Deploy command | `npm run deploy:cf` |

部署脚本会按名称查询 D1 `moments-db`，自动应用 Migration、设置 R2 CORS 并部署 Worker。**构建 API Token** 至少需要 D1 Read/Write、Workers Scripts Edit 和 R2 权限。

### 2. 配置 Secrets

Worker 的 **Settings → Variables and Secrets** 添加加密 Secret：

| 名称 | 要求 |
| --- | --- |
| `JWT_SECRET` | 至少 32 字符随机值，用于 JWT 与配置加密 |
| `INIT_SECRET` | 至少 24 字符随机值，仅用于首次管理员初始化 |
| `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` | R2 S3 API 凭据，用于大文件直传签名（可选） |
| `D1_BACKUP_API_TOKEN` | 目标账户 D1 Read/Write，用于备份导出与恢复（可选） |

其它变量：`SMTP_PASSWORD`、`RESEND_API_KEY`（评论邮件回退）、`PBKDF2_ITERATIONS`（默认并最大 100000）、`CORS_ORIGIN`。

> 不要将 Secret 或 Token 提交到 Git。

### 3. 初始化管理员

部署完成后，通过初始化接口创建管理员：

```bash
curl -X POST "https://your-worker.workers.dev/api/admin/initialize" \
  -H "content-type: application/json" \
  -H "x-init-secret: <INIT_SECRET>" \
  -d '{"username":"admin","nickname":"管理员","password":"至少8位密码"}'
```

## 配置

### Cloudflare 资源

| 类型 | 名称 | Binding |
| --- | --- | --- |
| Worker | `moments-cf` | — |
| D1 | `moments-db` | `DB` |
| R2 | `moments-media` | `MEDIA` |
| Workers Assets | `front/.output/public` | `ASSETS` |

可用 `scripts/cloudflare-bootstrap.mjs` 创建或复用 D1/R2（默认只处理资源，`--deploy` 才应用 Migration 并部署）。见 [scripts/README.md](scripts/README.md)。

### 检查与手动绑定

部署完成后，进入 Worker 的 **Settings → Bindings**，确认以下绑定均已连接：

| 绑定名 | 类型 | 目标 |
| --- | --- | --- |
| `DB` | D1 Database | `moments-db` |
| `MEDIA` | R2 Bucket | `moments-media` |
| `ASSETS` | Workers Assets | `front/.output/public` |

若某项显示未绑定，需手动添加：

1. **D1**：Bindings → Add → **D1 Database** → 选择 `moments-db`
2. **R2**：Bindings → Add → **R2 Bucket** → 选择 `moments-media`

绑定缺失时站点会出现“DB binding is not configured”或“R2 binding is not configured”等错误。

## 使用指南

- **系统设置**（`/sys/settings`）：按五个分区陈列——**站点**（标题/域名/Favicon/备案/自定义 CSS·JS·RSS/展示偏好）、**SEO**（总开关、描述与关键词）、**内容与互动**（评论、注册与审批、关于页、友链申请）、**安全与通知**（reCAPTCHA/Turnstile、邮件与 Telegram 通知）、**存储与数据**（存储后端、附件大小与单次数量上限、媒体回收站、本地备份、D1 备份、一键导入）。支持 `?tab=storage` 这类深链直达分区（旧的 `?tab=attachment` 会落到「存储与数据」），底部保存条仅在存在未保存更改时出现
- **一键导入**（`/sys/migration`）：旧 Docker 站数据迁移。先用本地转换器生成迁移包（见 [迁移文档](scripts/migrate/README.md)），再后台上传预检导入；数据库导出异常时可勾选“跳过导入前备份”
- **微信状态**：自己空间页封面昵称左侧点击设置（内置状态/自定义/备注/时长），他人状态显示在动态作者昵称右侧


## 本地开发

Worker 检查无需额外运行时依赖：

```bash
cd worker
npm run check
```

完整前端构建：

```bash
cd front
pnpm install --frozen-lockfile
pnpm run generate
```

部署前只读检查与部署后冒烟检查：

```bash
node scripts/release/preflight.mjs
MOMENTS_BASE_URL=https://your-worker.workers.dev node scripts/release/smoke-test.mjs
```

## API 使用说明

网站前端通过同域 `/api/*` 调用 Worker。接口统一返回 `{"code":0,"data":{}}`；失败时 `code` 非 0 并带 `message`（未登录 `code 3`、无权限 `code 4`）。需要登录的接口使用请求头 `x-api-token: <token>`。

**完整接口清单见 [API.md](API.md)**（按分组列出全部 65 个 `/api/*` 接口与站点级端点，含权限与参数）。下面是几个最常用的：

| 方法 | 路径 | 说明 | 权限 |
| --- | --- | --- | --- |
| POST | `/api/user/login` | 登录，返回 token | 公开 |
| POST | `/api/memo/list` | 动态列表（分页/筛选/含状态） | 公开（私密需登录） |
| POST | `/api/memo/save` | 发表 / 编辑 | 登录 |
| POST | `/api/file/upload` | 上传媒体（图片/音频/视频） | 登录 |
| POST | `/api/file/attachment` | 上传附件（文档/压缩包/纯文本） | 登录 |
| POST | `/api/sysConfig/get` | 站点公开配置 | 公开 |
| GET | `/upload/*` | 媒体与附件访问（`?download=1` 强制下载） | 公开 |

调用示例（登录获取 Token）：

```bash
curl -X POST "https://your-worker.workers.dev/api/user/login" \
  -H "content-type: application/json" \
  -d '{"username":"admin","password":"你的密码"}'
# 返回 {"code":0,"data":{"token":"eyJ..."}}
```

站点级端点（`/rss`、`/sitemap.xml`、`/robots.txt`、`/llms.txt`、`/llms-full.txt`、`/x-media`、`/douban-cover`）与全部管理接口同样收录在 [API.md](API.md)。完整接口以当前 `cf` 分支实现为准；网站不提供公开 Swagger/OpenAPI 页面。

## 架构

```text
浏览器
  └─ Cloudflare Worker
      ├─ /api/*        Worker API（动态/评论/用户/状态/备份/迁移）
      ├─ /upload/*     媒体代理（R2 / S3 / WebDAV，读旧写新）
      ├─ /rss          RSS
      ├─ /sitemap.xml、/robots.txt、/llms.txt   SEO/GEO 端点
      └─ /*            Nuxt Workers Assets（SPA）

D1: 用户、配置、动态、评论、友链、媒体索引、状态、迁移记录
R2/S3/WebDAV: 图片、视频、备份文件
```

## 相关文档

- [接口文档](API.md)：全部 `/api/*` 接口与站点级端点（权限、参数、约定）
- [Worker 说明](worker/README.md)：部署、Bindings 与 Secrets、Phase 7 能力、Migration 与自检
- [部署与资源脚本](scripts/README.md)：bootstrap、preflight、smoke test
- [旧站迁移工具](scripts/migrate/README.md)：本地转换器与迁移包格式

## 许可证与致谢

本项目继承上游的 [GPL-3.0](LICENSE) 许可证。

- 上游仓库：[kingwrcy/moments](https://github.com/kingwrcy/moments)
- 贡献者与社区支持请查阅上游仓库
