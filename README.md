# Moments CF

基于 [kingwrcy/moments](https://github.com/kingwrcy/moments) 改造的 Cloudflare 原生版本：前端与 API 由单个 Cloudflare Worker 提供，结构化数据存储在 D1，图片和视频存储在私有 R2。

> 本分支不是 Docker/SQLite 版本。需要原版自托管方案时，请查看上游仓库的 `dev` 分支。


## 已支持

- 管理员初始化、登录、注册开关、多用户资料
- Markdown 动态、标签、地点、公开/私密、定时发布、置顶
- 图片和视频上传、R2 同域访问、Range/HEAD 视频请求
- 外部链接、在线音乐、B站/YouTube/在线视频
- 豆瓣图书和电影元数据抓取与卡片展示
- 匿名点赞去重、评论、评论限流与可配置排序
- 友情链接、RSS、自定义 CSS/JS、reCAPTCHA 服务端验证
- 公开邮箱/评论隐私保护、错误脱敏和 URL 白名单
- 未引用媒体 7 天回收站、恢复和立即永久删除
- D1 Migration、部署前检查、线上只读冒烟检查

## 新增与改良

- 评论邮件通知：后台按“服务器→端口→用户名（发件邮箱）→密码/授权码”配置 SMTP 465/587；`re_` 开头凭据使用 Resend，凭据经 AES-GCM 加密后存入 D1
- 浏览器生成 WebP 缩略图，原图与缩略图写入私有 R2
- SHA-256 秒传
- 最大 500MB 的 R2 SigV4 预签名直传
- D1 自动备份到 R2（备份间隔与保留天数可在后台配置）、后台下载与双重确认恢复
- RSS 扩展内容等价输出
- Cloudflare Turnstile 人机验证（评论/点赞，启用时优先于 Google reCAPTCHA）
- 备案信息 HTML 与服务端安全过滤
- 豆瓣电影 JSON 接口优先、HTML/JSON-LD 回退与同域封面代理
- 音乐平台与音频直链播放，支持歌曲名和 LRC 滚动歌词
- 可关闭的“关于”页面，支持 Markdown 与安全 HTML
- 旧 Docker 站一键迁移：本地转换器生成标准迁移包，后台预检后导入 D1/R2，支持 SHA-256 校验、自动备份、断点重试和防重复导入
- 用户空间默认朋友圈式时间轴，日历检索结果可切换时间轴排列


## Workers Builds 部署

在 Cloudflare Dashboard 连接本仓库的 `cf` 分支，然后设置：

| 项目 | 值 |
| --- | --- |
| Root directory | `worker` |
| Build command | `npm run build:cf` |
| Deploy command | `npm run deploy:cf` |

部署脚本会按名称查询 `moments-db` 的 UUID，临时生成被 Git 忽略的 `worker/wrangler.build.toml`，依次应用 D1 Migration，再部署 Worker。仓库不会保存账户专属 D1 ID。

Workers Builds 使用的 Cloudflare API Token 至少需要：

- D1 Read / Write
- Workers Scripts Edit
- 绑定和访问 R2 所需权限

在“Bindings”里查看 D1 R2 是否绑定

### 变量

在 Worker 的 **Settings → Variables and Secrets** 中添加加密 Secret：

| 名称 | 要求 |
| --- | --- |
| `JWT_SECRET` | 至少 32 字符随机值，用于 JWT 和匿名身份签名 |
| `INIT_SECRET` | 至少 24 字符随机值，仅用于首次管理员初始化 |
| `R2_ACCESS_KEY_ID` | R2 S3 API Access Key，用于最大500MB直传签名 |
| `R2_SECRET_ACCESS_KEY` | R2 S3 API Secret Key |
| `D1_BACKUP_API_TOKEN` | 目标账户 D1 Read/Write，用于导出与恢复 |
| `SMTP_PASSWORD` | 可选，SMTP密码/授权码 |
| `RESEND_API_KEY` | 可选，SMTP失败时的Resend回退 |

可选变量：

- `PBKDF2_ITERATIONS`：默认并最大为 `100000`
- `CORS_ORIGIN`：允许的 Origin 列表；同域部署通常无需修改

不要将 Secret、Cloudflare Token 或账户资源 ID 提交到 Git。

### Cloudflare 资源

默认资源名称：

| 类型 | 名称 | Binding |
| --- | --- | --- |
| Worker | `moments-cf` | — |
| D1 | `moments-db` | `DB` |
| R2 | `moments-media` | `MEDIA` |
| Workers Assets | `front/.output/public` | `ASSETS` |

可使用 `scripts/cloudflare-bootstrap.mjs` 创建或复用 D1/R2。脚本默认只处理资源；只有显式传入 `--deploy` 才会执行 Migration 和部署。详见 [`scripts/README.md`](scripts/README.md)。

## 首次使用

部署完成后访问站点。若数据库尚无用户，使用初始化接口创建管理员：

```bash
curl -X POST "https://your-worker.workers.dev/api/admin/initialize" \
  -H "content-type: application/json" \
  -H "x-init-secret: <INIT_SECRET>" \
  -d '{"username":"admin","nickname":"管理员","password":"至少8位密码"}'
```

初始化只能在用户表为空时成功一次。初始化完成后可在后台修改账号和站点设置。

## 本地验证

Worker 检查不需要安装额外的 Worker 运行时依赖：

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

部署前只读检查：

```bash
node scripts/release/preflight.mjs
```

部署后只读冒烟检查：

```bash
MOMENTS_BASE_URL=https://your-worker.workers.dev \
node scripts/release/smoke-test.mjs
```

## 数据与媒体迁移辅助

`scripts/migrate/` 提供旧 SQLite 和上传目录的只读导出/校验工具。它们不会直接写入生产 D1 或 R2。详见 [`scripts/migrate/README.md`](scripts/migrate/README.md)。


## 架构

```text
浏览器
  └─ Cloudflare Worker
      ├─ /api/*       Worker API
      ├─ /upload/*    私有 R2 媒体代理
      ├─ /rss         RSS
      └─ /*            Nuxt Workers Assets

D1: 用户、配置、动态、评论、友链、媒体索引
R2: 图片和视频对象
```


## 许可证与上游

本项目继承上游的 GPL-3.0 许可证。原项目、贡献者及 Docker/SQLite 版本说明请访问：

- 上游仓库：https://github.com/kingwrcy/moments
- 当前 Cloudflare Worker 说明：[`worker/README.md`](worker/README.md)

## API 使用说明

网站前端通过同域 `/api/*` 调用 Worker。接口统一返回：

```json
{"code": 0, "data": {}}
```

失败时 `code` 非 0，并可能包含 `message`。需要登录的接口使用请求头：

```http
x-api-token: <登录返回的 token>
```

主要接口：

| 方法 | 路径 | 认证 | 用途 |
|---|---|---:|---|
| GET | `/api/health` | 否 | 检查 Worker、D1、R2 状态 |
| POST | `/api/user/login` | 否 | 用户登录 |
| POST | `/api/user/profile` | 可选 | 当前公开资料或登录用户资料 |
| POST | `/api/memo/list` | 可选 | 动态分页、用户、日期、内容和标签筛选 |
| POST | `/api/memo/get?id=<id>` | 可选 | 获取动态详情 |
| POST | `/api/memo/save` | 是 | 新建或修改动态 |
| POST | `/api/memo/like?id=<id>` | 否 | 点赞；启用人机验证时附带 `token` |
| POST | `/api/comment/add` | 可选 | 添加评论 |
| POST | `/api/file/upload` | 是 | 小文件上传至 R2 |
| POST | `/api/file/direct/init` | 是 | 初始化 20MB–500MB R2 直传 |
| POST | `/api/file/direct/complete` | 是 | 校验并完成 R2 直传 |
| POST | `/api/sysConfig/get` | 否 | 获取公开系统设置 |
| POST | `/api/sysConfig/getFull` | 管理员 | 获取完整系统设置（敏感值不回传） |
| POST | `/api/sysConfig/save` | 管理员 | 保存系统设置 |
| POST | `/api/admin/backup/list` | 管理员 | 查询 D1 备份 |
| POST | `/api/admin/backup/create` | 管理员 | 立即创建 D1 备份 |
| GET | `/rss` | 否 | RSS 订阅 |

示例：

```bash
curl -X POST https://your-worker.example/api/memo/list \
  -H 'content-type: application/json' \
  -d '{"page":1,"size":10}'
```

接口以当前 `cf` 分支实现为准。网站不提供公开 Swagger/OpenAPI 页面；如用于第三方客户端，请先核对 Worker 路由和权限逻辑。
