# Moments Cloudflare Worker — Phase 6

Cloudflare 版使用单个 Worker 提供 API、Nuxt Workers Assets、RSS 和私有 R2 媒体代理；D1 保存结构化数据。

## 资源绑定

| Binding | Cloudflare 资源 |
| --- | --- |
| `DB` | D1：`moments-db` |
| `MEDIA` | R2：`moments-media` |
| `ASSETS` | `../front/.output/public` |

## Workers Builds

| 项目 | 值 |
| --- | --- |
| 路径 | `worker` |
| 构建命令 | `npm run build:cf` |
| 部署命令 | `npm run deploy:cf` |

`deploy:cf` 会通过 API Token 按名称查询 D1 UUID，生成被忽略的 `wrangler.build.toml`，应用未执行的 Migration 后部署。无需设置 `D1_DATABASE_ID` Build Variable。

## Secrets

- `JWT_SECRET`：至少 32 字符
- `INIT_SECRET`：至少 24 字符
- 可选 `PBKDF2_ITERATIONS`：默认/最大 `100000`

Secret 只能保存在 Cloudflare 加密变量中。

## Phase 6 重点

- 外部链接、图片、音乐、视频和豆瓣扩展字段服务端白名单
- reCAPTCHA action、hostname 和 score 校验
- 评论计数 Trigger 及历史计数修正
- 每条动态最多读取 5 条评论，恢复 `latest=1`
- R2 媒体 Range、HEAD、ETag/304
- 豆瓣图书/电影元数据抓取；封面保留原始 HTTPS URL
- 未引用媒体进入 7 天逻辑回收站，可恢复或立即永久删除
- 公开配置使用白名单，不返回 SMTP/S3 遗留字段

## API 补充

所有 API 使用 `{ code, message?, data }` 格式；登录请求兼容 `x-api-token`。

| 路径 | 说明 |
| --- | --- |
| `GET /api/health` | Worker 和 Binding 状态，当前 `phase: 6` |
| `POST /api/admin/initialize` | 首次管理员初始化，需 `x-init-secret` |
| `POST /api/memo/getDoubanBookInfo?id=` | 登录后抓取豆瓣图书元数据 |
| `POST /api/memo/getDoubanMovieInfo?id=` | 登录后抓取豆瓣电影元数据 |
| `POST /api/file/clean` | 扫描未引用媒体并移入回收站，同时清理超过 7 天的对象 |
| `POST /api/file/trash/list` | 当前用户回收站列表 |
| `POST /api/file/trash/restore?id=` | 恢复媒体记录 |
| `POST /api/file/trash/purge?id=` | 立即永久删除 R2 对象和 D1 记录 |
| `GET/HEAD /upload/*` | 私有 R2 同域代理，支持 Range 与条件缓存 |

其他用户、动态、评论、点赞、标签、友链、配置和 RSS API 与原前端路径保持兼容。

## D1 Migration

按顺序维护：

```text
0001_schema.sql
0002_memos.sql
0003_comments_friends.sql
0004_like_counters.sql
0005_phase6_consistency_trash.sql
```

`0005` 会：

1. 根据真实评论修正 `comment_count`
2. 建立评论新增/删除 Trigger
3. 为媒体表增加 `trashed_at` 和回收站索引

正常使用 `npm run deploy:cf` 时 Migration 会自动应用。

## 检查

```bash
cd worker
npm run check
```

检查包含 Worker/API 回归、安全和隐私、豆瓣解析、R2 Range/HEAD、真实 SQLite Migration、迁移工具和部署前检查。
