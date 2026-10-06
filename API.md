# Moments CF 接口文档

> 适用分支 **`cf`**，实现入口 [`worker/src/index.js`](worker/src/index.js)。
> 本文件按实现逐条核对整理；**改动接口必须同步更新本文件**，否则视为改动不完整。

## 通用约定

- **响应信封**：一律 `{"code":0,"data":…}`；失败时 `code` 非 0 并带 `message`（HTTP 状态码同时反映语义）。
- **鉴权**：请求头 `x-api-token: <token>`（登录接口返回）。
  - 未登录调用需登录的接口 → `code 3`（HTTP 401）
  - 非管理员调用管理接口 → `code 4`（HTTP 403）
- **方法**：除「站点级端点」外，`/api/*` 统一用 **POST**（参数放 JSON body，少数用 query 如 `?id=`、`?key=`）。
- **分页**：`page`（从 1 起）+ `size`，返回通常含 `total` 与 `hasNext`。
- **时间**：D1 内为 UTC `YYYY-MM-DD HH:MM:SS`，出参原样返回，前端负责本地化。
- **权限列**：`公开` = 无鉴权；`公开(可选登录)` = 公开但带 token 时返回更多（如私密动态、点赞状态）；`登录` = 任意登录用户；`管理员` = 仅 id=1。

## 总览

| 分组 | 接口数 | 典型权限 |
| --- | --- | --- |
| 系统与健康 | 1 | 公开 |
| 用户 | 10 | 公开 / 登录 |
| 动态 | 10 | 公开 / 登录 |
| 评论 | 2 | 公开(可选登录) / 登录 |
| 标签 | 1 | 登录（仅本人标签） |
| 友情链接 | 3 | 公开（读）/ 管理员（写） |
| 系统配置 | 3 | 公开（读）/ 管理员（全量读、写） |
| 文件与媒体 | 10 | 登录 |
| 照片墙与图集 | 3 | 公开 / 管理员 |
| 管理（照片、备份、迁移、注册审批、邮件） | 22 | 管理员 |
| 自定义页面 | 6 | 公开（读）/ 管理员 |

## 系统与健康

| 路径 | 权限 | 参数 | 说明 |
| --- | --- | --- | --- |
| `/api/health` | 公开 | — | 返回 `{ok, service, phase, database, media}`，用于探活与确认绑定是否就绪 |

## 用户

| 路径 | 权限 | 参数 | 说明 |
| --- | --- | --- | --- |
| `/api/user/login` | 公开 | `username`、`password` | 返回 `{token}`；失败次数受登录限流约束 |
| `/api/user/reg` | 公开 | `username`、`password`、`repeatPassword`、`email`、`reason` | 仅在开启注册时可用；开启审批时返回 `awaitingApproval` 且需管理员批准 |
| `/api/user/profile` | 公开(可选登录) | — | 当前（或指定）用户资料，含微信状态 |
| `/api/user/profileById` | 公开 | `id` | 指定用户公开资料 |
| `/api/user/saveProfile` | 登录 | `nickname`、`slogan`、`avatarUrl`、`coverUrl`、`email`、`telegramChatId`、`password` 等 | 保存资料；密码留空表示不修改 |
| `/api/user/status/set` | 登录 | `icon`、`content`、`remark`、`durationHours` | 设置微信状态（默认 24 小时） |
| `/api/user/status/clear` | 登录 | — | 清除状态 |
| `/api/user/status/get` | 公开 | `userId` | 查询某用户状态 |
| `/api/user/status/list` | 公开 | `users` | 批量查询状态（供时间线一次性取回） |
| `/api/user/profile/<name>` | 公开 | 路径段为用户名 | 按用户名取公开资料（`/api/user/profile` 的兼容别名，供旧链接使用） |

## 动态

| 路径 | 权限 | 参数 | 说明 |
| --- | --- | --- | --- |
| `/api/memo/list` | 公开(可选登录) | `page`、`size`、`showType`、`userId`、`username`（历史别名 `user`，二者等价）、`tag`、`contentContains`、`start`、`end` | 时间线；未登录只返回已发布的公开动态 |
| `/api/memo/get` | 公开(可选登录) | `id`、`latest` | 单条动态（含评论）；私密/定时未发布仅作者可见，否则 403 |
| `/api/memo/save` | 登录 | `id`、`content`、`imgs`、`location`、`tags`、`showType`、`createdAt`、`externalUrl`/`externalTitle`/`externalFavicon`、`ext` | 发表或编辑；`ext` 承载扩展内容（见下） |
| `/api/memo/remove` | 登录 | `id` | 删除（作者或管理员） |
| `/api/memo/setPinned` | 管理员 | `id` | 置顶/取消置顶（全站仅一条置顶） |
| `/api/memo/like` | 公开 | `id`、`token` | 点赞；开启人机验证时需 `token`，匿名按网络指纹去重 |
| `/api/memo/preview` | 登录 | `kind`（`memo`/`x`/`git`）、`url` | 抓取并返回预览快照（站内动态引用 / X 原帖 / Git 仓库） |
| `/api/memo/getFaviconAndTitle` | 登录 | `url` | 外链卡片的 favicon 与标题 |
| `/api/memo/getDoubanBookInfo` | 登录 | `id` | 豆瓣图书卡片 |
| `/api/memo/getDoubanMovieInfo` | 登录 | `id` | 豆瓣电影卡片 |

**`ext` 结构**（`sanitizeMemoExt` 白名单校验，未知字段丢弃）：

| 字段 | 含义 |
| --- | --- |
| `music` | 音乐（平台 ID 或直链） |
| `video` | 视频（`bilibili` / `youtube` / `online`） |
| `git` / `x` / `memoRef` | Git 仓库、X 原帖、站内动态引用的冻结快照 |
| `doubanBook` / `doubanMovie` / `doubanBooks` / `doubanMovies` | 豆瓣卡片（单卡兼容 + 数组） |
| `attachments` | 附件数组 `[{path,name,size,type}]`，`path` 为 `/upload/…` |
| `order` | 内容块展示顺序（string[]），key 为单块名或 `attachment:<path>` / `doubanBook:<id>` / `doubanMovie:<id>` |

## 评论

| 路径 | 权限 | 参数 | 说明 |
| --- | --- | --- | --- |
| `/api/comment/add` | 公开(可选登录) | `memoId`、`content`、`replyCommentId`、`username`、`email`、`website`、`token` | 发表评论；按 IP/网络限流，开启人机验证时需 `token` |
| `/api/comment/remove` | 登录 | `id` | 删除评论 |

## 标签与友情链接

| 路径 | 权限 | 参数 | 说明 |
| --- | --- | --- | --- |
| `/api/tag/list` | 登录 | — | **当前登录用户**的动态标签（非全站） |
| `/api/friend/list` | 公开 | — | 友链列表 |
| `/api/friend/add` | 管理员 | `name`、`url`、`desc`、`icon` | 新增友链 |
| `/api/friend/delete` | 管理员 | `id` | 删除友链 |

## 系统配置

| 路径 | 权限 | 参数 | 说明 |
| --- | --- | --- | --- |
| `/api/sysConfig/get` | 公开 | — | 站点公开配置（标题、SEO、开关、附件限额等）；**服务端强制 `enableS3=false`** 并净化备案 HTML |
| `/api/sysConfig/getFull` | 管理员 | — | 完整配置（含存储凭据的“已配置”标记，密钥不回传明文） |
| `/api/sysConfig/save` | 管理员 | 见「可配置项」 | 保存配置；服务端对数值型做范围钳制 |

**可配置项要点**

| 键 | 说明 |
| --- | --- |
| `title`、`seoDescription`、`seoKeywords`、`siteUrl`、`favicon`、`beiAnNo` | 站点基础与 SEO |
| `enableSeo` | **SEO 总开关**：关闭后全站 noindex、`sitemap.xml` 与 `llms*.txt` 返回 404、`robots.txt` 全站 `Disallow`、不再输出 canonical/og:url |
| `attachmentMaxSize`（1–25，默认 10） | 单个附件上限（MB） |
| `attachmentMaxCount`（1–20，默认 5） | 单次上传附件数量上限 |
| `enableComment`、`maxCommentLength`、`commentOrder` | 评论开关、最大字数、排序 |
| `enableRegister`、`enableRegisterApproval` | 注册开关与审批 |
| `memoMaxHeight`、`timeFormat`、`enableAutoLoadNextPage` | 时间线展示 |
| `storageType`、`s3Storage`、`webdavStorage` | 媒体存储后端与凭据（凭据 AES-GCM 加密存储） |
| `enableD1Backup`、`backupIntervalDays`、`backupRetentionDays`、`backupTarget` | D1 备份策略 |
| `enableEmail`、`smtp*`、`enableTelegram`、`telegramBot*` | 通知渠道 |

**SMTP 端口与加密**：`smtpPort` 只接受 `465`/`587`（缺失或非法回退 `465`），`smtpEncryption` 固定由端口推导——`465` → `ssl`（隐式 TLS）、`587` → `tls`（STARTTLS）。保存配置与 `/api/admin/mail/test` 都会按端口规范化，提交 `587`+`ssl` 这类不匹配组合不会被直连握手失败坑到。

## 自定义页面

管理员创建的独立页面，存储在 `custom_pages` 表（migration 0018），以**根级 `/<slug>`** 访问（如 `/about-lab`），是站点唯一的根级可路由数据内容；正文由 markdown + 组件块混合构成（协议见下）。数据库字段为 snake_case，**接口出入参一律 camelCase**（`showInNav`、`sortOrder`、`seoDescription`），由 `pageView` 统一转换。

| 路径 | 权限 | 参数 | 说明 |
| --- | --- | --- | --- |
| `/api/admin/page/list` | 管理员 | — | 全部页面（**含停用**），按 `sortOrder` 升序、其次最近更新；条目为完整 camelCase 视图 |
| `/api/admin/page/get` | 管理员 | `id` | 单条完整视图；不存在返回 404「页面不存在」 |
| `/api/admin/page/save` | 管理员 | `id`（可选）、`slug`、`title`、`content`、`seoDescription`、`sortOrder`、`enabled`、`showInNav` | 带 `id` 为更新、缺省为新建并返回 `{id}`；`slug` 全站唯一（重复返回 **409**）；非法输入返回 400 |
| `/api/admin/page/remove` | 管理员 | `id` | 物理删除（自定义页面无回收站）；不存在不报错 |
| `/api/page/get` | 公开 | `slug` | 仅返回启用中页面，键集合精确为 `{slug, title, content, seoDescription}`（不含 `enabled`）；停用/不存在一律 404 |
| `/api/page/nav` | 公开 | — | 导航用启用页面列表 `[{slug, title}]`，仅含 `showInNav=1`，按 `sortOrder` 升序 |

**读参规范**：本组所有接口按全站统一规范以 **POST + JSON body** 传参——`/api/page/get` 传 `{slug}`、`/api/admin/page/get` 与 `/api/admin/page/remove` 传 `{id}`、`/api/admin/page/save` 传全字段 JSON。这三个读参接口同时保留 query 读取（如 `?id=`、`?slug=`）作旧客户端兼容：**body 优先、query 兜底，query 不是规范用法**。

**校验规则**（服务端强制，非法输入 400 且不落库）：

- `slug`：正则 `^[a-z0-9-]{1,40}$`（小写字母、数字、连字符，1–40 位）；命中 15 个保留字 `about friend photos new edit user sys memo tags api upload rss x-media douban-cover page` 直接 400「该 slug 为系统保留」（保留字同时约束根级 URL，前端解析器持有同序清单）；与其他页面重复返回 **409**（新建与更新都查重）。
- `title`：trim 后 1–60 字。
- `content`：上限 100000 字符，服务端静默截断。
- `seoDescription`：上限 300 字符；`sortOrder` 钳制 0–999（默认 0）。
- `enabled`：`0` 视为停用，其余按启用；`showInNav` 任意真值即 1。`enabled=0` 的页面 `/api/page/get` 与根级 URL 都不可见。

**根级 URL 语义**：静态路由永远优先（`/about`、`/photos` 等既有页面与全部 `/api/*`、`/upload/*`、`/rss` 等不受影响），自定义页面只承接无路由的单段路径；两段及以上路径（如 `/foo/bar`）归 SPA 通配 404，不会落到自定义页面。启用页由 `pageSeo()` 注入「页面标题 - 站点标题」、`seoDescription`（空时回退站点描述）与 JSON-LD WebSite 形态 meta；**停用或已删除页面的 URL 返回 SPA 404 并带 `noindex`**，不会泄漏存在性。`/sitemap.xml` 收录启用页（monthly、优先级 0.5、`lastmod` 取 `updated_at`），停用/已删页自动移出。

**组件块协议**：正文里用 ```` ```ui:<kind> ```` 三反引号围栏包裹一段 JSON 表示组件，围栏外内容按 markdown 渲染：

    ```ui:button
    { "items": [{ "label": "首页", "href": "/" }] }
    ```

支持的七种 `kind`：`button`（按钮组）、`card`（卡片组）、`countdown`（倒计时）、`timeline`（时间线）、`gallery`（图集）、`music`（音乐播放器）、`icons`（图标行）。解析规则：`kind` 合法且内部 JSON 解析成功才按组件渲染；**未知 kind、坏 JSON、未闭合围栏整块按原文并入 markdown 渲染**，绝不丢弃用户文字。

## 文件与媒体

| 路径 | 权限 | 参数 | 说明 |
| --- | --- | --- | --- |
| `/api/file/upload` | 登录 | multipart `files` + `sha256`（每个文件一个哈希）、可选 `thumbnail_<下标>` | 图片/音频/视频，单文件 ≤25MB；按 `owner_id+sha256` 去重 |
| `/api/file/direct/init` | 登录 | `filename`、`contentType`、`size`、`sha256` | ≥20MB 走预签名直传（R2/S3；WebDAV 不支持），返回 `uploadUrl` |
| `/api/file/direct/complete` | 登录 | `key`、`thumbnailKey` | 直传完成校验（大小、类型、校验和）后置为 `ready` |
| `/api/file/exist` | 登录 | `sha256` | 秒传预检，返回 `{exist, path, thumbPath}`；仅接受 64 位 SHA-256 |
| **`/api/file/attachment`** | 登录 | multipart `files`（可多个） | **附件上传**：类型限文档/压缩包/纯文本配置/电子书白名单（**不含 html/svg/js/xml/css**）；单文件 ≤ `attachmentMaxSize`，单次 ≤ `attachmentMaxCount`；返回 `{files:[{path,name,size,type}]}` |
| `/api/file/clean` | 登录 | — | 扫描未被引用的媒体（比对 `memos.imgs`、`ext`、头像封面与配置）→ 移入回收站 |
| `/api/file/trash/list` | 登录 | — | 回收站列表（默认保留 7 天） |
| `/api/file/trash/restore` | 登录 | `id` | 从回收站恢复 |
| `/api/file/trash/purge` | 登录 | `id` | 立即永久删除 |
| `/api/file/s3PreSigned` | 公开 | — | **遗留占位**，恒返回 400「Cloudflare 版本使用 R2 直连上传」 |

**媒体访问**：`GET /upload/<key>` —— 走所选存储后端读取；带 ETag、`Range`（206）、`x-content-type-options: nosniff` 与一年 immutable 缓存。附件类型（白名单内）**无条件下发** `Content-Disposition: attachment`；任意媒体加 `?download=1` 也按附件下发，文件名用 RFC 5987（`filename*=UTF-8''…`）以支持中文名。

## 照片墙与图集

| 路径 | 权限 | 参数 | 说明 |
| --- | --- | --- | --- |
| `/api/photo/wall` | 公开(可选登录) | — | 照片墙：往年今日、精选、各图集前 9 张（默认图集聚合全部动态图片） |
| `/api/photo/album` | 公开 | `id`、`page`、`size` | 单图集分页照片 |
| `/api/photo/all` | 管理员 | `page`、`size`、`keyword` | 合并公开动态图与图集收录项（去重），供照片管理与发表面板「照片墙选图」共用 |

## 管理接口

| 路径 | 权限 | 参数 | 说明 |
| --- | --- | --- | --- |
| `/api/admin/initialize` | 公开 | `username`、`nickname`、`password` | **首次**初始化管理员，需请求头 `x-init-secret`；已初始化后不可用 |
| `/api/admin/photo/album/save` | 管理员 | `id`、`name`、`description` | 新建/编辑图集 |
| `/api/admin/photo/album/remove` | 管理员 | `id` | 删除图集（默认图集不可删） |
| `/api/admin/photo/album/add` | 管理员 | `albumId`、`url`、`caption` | 向图集添加图片（本地/直链） |
| `/api/admin/photo/album/removeItem` | 管理员 | `id` | 从图集移除单条 |
| `/api/admin/photo/delete` | 管理员 | `albumId`、`id` | 从图集移除一条；**仅当**该上传文件未被任何动态与其他图集引用时才移入媒体回收站（默认图集直接拒绝） |
| `/api/admin/photo/featured/set` | 管理员 | `id` 或 `memoId`+`sourceIndex`、`featured`、`sortOrder` | 设置照片墙精选 |
| `/api/admin/registration/requests` | 管理员 | — | 待审批注册列表 |
| `/api/admin/registration/approve` | 管理员 | `id` | 通过注册申请 |
| `/api/admin/registration/reject` | 管理员 | `id` | 拒绝注册申请 |
| `/api/admin/mail/test` | 管理员 | `to` + `smtpHost`、`smtpPort`、`smtpEncryption`、`smtpUsername`、`smtpFromName`、`smtpPassword` | 用当前（或已保存的）配置发送测试邮件 |
| `/api/admin/backup/list` | 管理员 | — | 备份列表 |
| `/api/admin/backup/create` | 管理员 | — | 立即创建 D1 备份 |
| `/api/admin/backup/download` | 管理员 | `key` | 下载备份（SQL，附件形式） |
| `/api/admin/backup/restore` | 管理员 | `key`、`confirmName`、`password` | 覆盖恢复：需完整备份名 + 管理员密码，恢复前自动再备份一次 |
| `/api/admin/backup/export` | 管理员 | — | 导出本地备份文件 |
| `/api/admin/migration/preflight` | 管理员 | `manifest` | 迁移包预检 |
| `/api/admin/migration/prepare` | 管理员 | `packageId`、`password`、`skipBackup` | 准备导入 |
| `/api/admin/migration/import` | 管理员 | `packageId`、`kind`、`rows`、`offset`、`memoMap`、`userMap` | 分批导入（可断点续传） |
| `/api/admin/migration/backup/status` | 管理员 | `packageId`、`bookmark` | 查询导入前备份进度 |
| `/api/admin/migration/finish` | 管理员 | `packageId`、`imported` | 结束并落库统计 |
| `/api/admin/migration/fail` | 管理员 | `packageId`、`error` | 标记失败并留痕（防重复导入） |

## 站点级端点

| 端点 | 方法 | 说明 |
| --- | --- | --- |
| `/rss` | GET | RSS 订阅（最近动态） |
| `/sitemap.xml` | GET | 站点地图：图片扩展、首页 lastmod、标签聚合页；**不收录图集页**（该路由已删除）。`enableSeo=false` 时返回 404 |
| `/robots.txt` | GET | 按爬虫组分策略：搜索引用类 AI 放行、训练类屏蔽、图片/社交预览放行媒体。`enableSeo=false` 时全站 `Disallow: /` |
| `/llms.txt`、`/llms-full.txt` | GET | 面向 AI 引擎的纯文本站点摘要（后者含正文）。`enableSeo=false` 时返回 404 |
| `/x-media` | GET | X 图片同域代理（规避防盗链与跨域） |
| `/douban-cover` | GET | 豆瓣封面同域代理 |
| `/_nuxt/*`、其它静态资源 | GET | 构建产物按内容哈希永久缓存；HTML 注入动态 SEO meta 且 `no-store` |

## 维护约定

- 任何新增/修改/删除接口，**必须同步更新本文件**（含权限与参数）；测试 `tests/api/` 会校验部分契约，但文档同步靠人。
- 新增接口时优先放入既有分组；权限变化（尤其 `公开` ↔ `登录` ↔ `管理员`）属于破坏性变更，需在提交说明中写明。
- 结构与落盘格式（如 `memos.ext` 字段）变化时，同时更新本文件的「`ext` 结构」与相关章节。
