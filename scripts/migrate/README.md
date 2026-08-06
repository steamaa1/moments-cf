# Legacy Moments migration helpers

迁移器分为两个部分：

1. 本地 Python 转换器：读取旧 Docker 目录或 `.tar.gz`，生成标准迁移包。
2. 本站后台导入器：上传标准迁移包，预检后导入 D1/R2。

所有本地读取工具都不会修改旧站 `db.sqlite` 或 `upload/`。

## 生成迁移包

旧 Docker Compose 默认把 `/var/moments` 挂载到容器 `/app/data`，因此通常直接执行：

```bash
python3 scripts/migrate/build-package.py \
  /var/moments \
  --output moments-migration-package \
  --archive moments-migration-package.tar.gz
```

也可以直接处理完整备份包：

```bash
python3 scripts/migrate/build-package.py \
  /root/moments-backup.tar.gz \
  --output moments-migration-package \
  --archive moments-migration-package.tar.gz
```

生成的结构：

```text
moments-migration-package/
├── manifest.json
├── tables/
│   ├── users.json
│   ├── memos.json
│   ├── comments.json
│   ├── friends.json
│   └── sys_config.json
└── media/
    └── 原 upload/ 下的文件
```

旧用户密码不会写入迁移包。目标站管理员保留本站当前密码；其他旧用户导入后会生成不可登录的随机密码，之后需要在目标站重新设置。

## 导入本站

登录本站管理员后台，打开“系统设置 → 数据迁移”，上传：

```text
moments-migration-package.tar.gz
```

然后依次点击：

1. 上传并解析
2. 预检迁移包
3. 确认导入

导入前本站会自动创建 D1 备份。导入器会校验表数量、数据格式、媒体大小和 SHA-256，并将媒体写入 R2。

## 旧工具

仍可单独生成旧数据审计文件：

```bash
python3 scripts/migrate/export-sqlite.py /path/to/db.sqlite --output export
python3 scripts/migrate/build-media-manifest.py /path/to/upload --output media-manifest.json
python3 scripts/migrate/verify-migration.py --export-dir export --media-manifest media-manifest.json
```

这些命令只用于审计，不会直接写入生产 D1/R2。
