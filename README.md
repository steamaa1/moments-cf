# Moments CF

基于 [kingwrcy/moments](https://github.com/kingwrcy/moments) 改造的 Cloudflare 原生版本：前端与 API 由单个 Cloudflare Worker 提供，结构化数据存储在 D1，图片和视频存储在私有 R2。

> 本分支不是 Docker/SQLite 版本。需要原版自托管方案时，请查看上游仓库的 `dev` 分支。

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

## Phase 7 新增

- 评论邮件通知：SMTP 465/587，失败自动回退 Resend
- 浏览器生成 WebP 缩略图，原图与缩略图写入私有 R2
- SHA-256 秒传
- 最大 500MB 的 R2 SigV4 预签名直传
- D1 每周备份到 R2、90 天保留、后台下载与双重确认恢复
- OpenAPI 3.1：`/openapi.json`，文档页：`/docs`
- RSS 扩展内容等价输出
- 备案信息安全 HTML 白名单

## Cloudflare 资源

默认资源名称：

| 类型 | 名称 | Binding |
| --- | --- | --- |
| Worker | `moments-cf` | — |
| D1 | `moments-db` | `DB` |
| R2 | `moments-media` | `MEDIA` |
| Workers Assets | `front/.output/public` | `ASSETS` |

可使用 `scripts/cloudflare-bootstrap.mjs` 创建或复用 D1/R2。脚本默认只处理资源；只有显式传入 `--deploy` 才会执行 Migration 和部署。详见 [`scripts/README.md`](scripts/README.md)。

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

## 必需 Secrets

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

## 许可证与上游

本项目继承上游的 GPL-3.0 许可证。原项目、贡献者及 Docker/SQLite 版本说明请访问：

- 上游仓库：https://github.com/kingwrcy/moments
- 当前 Cloudflare Worker 说明：[`worker/README.md`](worker/README.md)
