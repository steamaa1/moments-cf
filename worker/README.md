# Moments Cloudflare Worker

这是 Moments 的 Cloudflare 迁移入口。当前为 **Phase 1**：仅提供静态资源分流、健康检查及 R2 媒体读取的运行时骨架，尚未迁移任何业务 API 或创建 Cloudflare 资源。

## 当前路由

| 路径 | Phase 1 行为 |
| --- | --- |
| `GET /api/health` | 返回 Worker 与 Binding 状态 |
| `/api/*` | 返回 404，等待后续 API 迁移 |
| `/upload/*` | 从 `MEDIA` R2 Binding 读取对象；未绑定时返回 503 |
| `/rss` | 返回 501，等待 RSS 迁移 |
| 其他路径 | 交由 Workers Assets 返回 Nuxt SPA 静态资源 |

## 本地检查

无需安装 Worker 专属依赖：

```bash
cd worker
npm run check
```

该命令执行 Worker 语法检查、`wrangler.toml` Phase 1 配置守卫和路由行为测试。

## 后续部署前准备

暂不执行。开始部署前需在 Cloudflare 创建 D1 数据库和 R2 Bucket，再取消 `wrangler.toml` 中相关 Binding 的注释并填入真实 ID；密钥一律通过 `wrangler secret put` 配置，不提交到 Git。
