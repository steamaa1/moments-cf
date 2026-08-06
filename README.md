# Moments CF

基于 [kingwrcy/moments](https://github.com/kingwrcy/moments) 改造的 Cloudflare 原生版本：前端与 API 由单个 Cloudflare Worker 提供，结构化数据存储在 D1，图片和视频存储在私有 R2。

> 本分支不是 Docker/SQLite 版本。需要原版自托管方案时，请查看上游仓库的 `dev` 分支。


## 原版支持

以下功能继承自上游 Docker 版，Cloudflare 版保持兼容：

- 管理员初始化、登录、注册开关、多用户资料（头像/封面/签名）
- Markdown 动态、图片上传、标签、地点、公开/私密、定时发布、置顶
- 点赞、评论（含回复）、匿名游客评论、可配置排序
- 外链卡片、在线音乐（网易云/QQ/酷狗/虾米/百度）、B站/YouTube/在线视频
- 豆瓣图书与电影卡片
- 友情链接
- RSS 订阅
- 系统设置：网站标题、Favicon、备案、自定义 CSS/JS/RSS、评论开关与字数、时间格式、注册开关、Google reCAPTCHA
- 日历检索、朋友圈式时间线
- 评论邮件通知（SMTP）

## 新增与改良

- **Cloudflare 原生部署**：单 Worker 同时提供前端与 API，D1 存储结构化数据，私有 R2 存储媒体，无服务器、免维护
- **PBKDF2-SHA256 密码哈希**：替代原版 bcrypt；旧站密码无法直接使用，迁移时保留本站管理员密码
- **R2 媒体存储**：图片/视频上传至私有 R2，同域代理访问，支持视频 Range/HEAD 请求
- **SHA-256 内容寻址秒传**：相同文件自动去重
- **浏览器生成 WebP 缩略图**：原图与缩略图分别存储，列表加载更快
- **最大 500MB R2 SigV4 预签名直传**：20MB 以上大文件绕过 Worker 直传 R2
- **未引用媒体回收站**：清理后保留 7 天，可恢复或立即永久删除
- **D1 自动备份**：备份间隔（默认 7 天）与保留天数（默认 90 天）可在后台配置，支持手动立即备份、下载、双重确认恢复
- **评论邮件通知升级**：SMTP 465/587 与 Resend（`re_` 开头凭据）双通道，凭据 AES-GCM 加密存入 D1，不回传明文
- **Cloudflare Turnstile 人机验证**：评论/点赞可选启用，启用时优先于 Google reCAPTCHA
- **豆瓣电影 JSON 接口优先**：HTML/JSON-LD 回退解析，同域封面代理，元数据更稳
- **音乐直链播放**：新增直链模式，支持音频 URL、歌曲名与 LRC 滚动歌词，服务端校验地址安全
- **可开关的“关于”页面**：导航随开关显示，内容支持 Markdown 与完整 HTML（管理员可信，不做过滤）
- **朋友圈式时间轴**：用户空间默认时间轴并可切回普通卡片，日历检索结果同样可切换；点击头像进入对应用户时间轴
- **安全加固**：匿名点赞去重（身份哈希）、评论限流（每分钟 5 条）、公开邮箱与评论隐私保护、URL 白名单与 SSRF 防护、备案信息安全 HTML 过滤、错误信息脱敏（管理员可见具体原因）
- **时间显示修正**：服务端按 UTC 存储，前端按访客本地时区显示，发表与检索不再出现 8 小时偏差
- **旧 Docker 站一键迁移**：本地转换器生成标准迁移包（目录或 tar.gz 均可），后台上传、预检、确认导入，支持 SHA-256 校验、导入前自动备份、断点重试与防重复导入
- **部署与运维**：D1 Migration 自动应用、部署前检查、线上只读冒烟检查、README 手写 API 说明（不提供公开文档页）


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
