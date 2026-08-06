# Moments Cloudflare Worker

当前是 **Phase 2**：Cloudflare Workers API 壳已绑定 D1 与 R2，并实现首次初始化、登录鉴权、用户资料、系统配置与基础文件上传；动态、评论、标签、RSS 等业务将在后续阶段迁移。

## 资源绑定

| Binding | Cloudflare 资源 |
| --- | --- |
| `DB` | D1：`moments-db` |
| `MEDIA` | R2：`moments-media` |
| `ASSETS` | `../front/.output/public` 的 Nuxt SPA 静态资源 |

## 部署前必须设置的 Secrets

在 Cloudflare Worker 的 **Settings → Variables and Secrets** 添加加密 Secret：

| 名称 | 用途 |
| --- | --- |
| `JWT_SECRET` | 至少 32 字符的随机密钥，用于登录令牌签名 |
| `INIT_SECRET` | 首次管理员初始化接口的单次保护密钥，至少 24 字符 |

可选变量：`PBKDF2_ITERATIONS`，默认 `210000`。不要把任何 Secret 写入 `wrangler.toml` 或 Git。

## Phase 2 API

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

## D1 Migration

首次部署后，在 Cloudflare Dashboard 的 D1 数据库 `moments-db` 中执行：

```text
worker/migrations/0001_schema.sql
```

在 Workers Builds 自动部署模式下，Migration 不会自动执行；需通过 Dashboard SQL Console 手动粘贴执行，或后续配置专门的受控 migration 工作流。

## 本地检查

```bash
cd worker
npm run check
```

无需安装 Worker 专属依赖；检查包含语法、Phase 2 配置守卫及路由/密码/JWT 行为测试。
