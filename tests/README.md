# 测试

测试按被测形态分层，统一使用 Node 内置测试运行器，**新增测试无需改任何清单**：

| 目录 | 形态 | 示例 |
| --- | --- | --- |
| `tests/api/` | 集成：`import worker` 后用 `worker.fetch()` 模拟请求（含 DB/socket/fetch 桩） | mail-notify-settings |
| `tests/source/` | 源码契约：`readFile` + 正则断言前端/Worker 源码、构建与部署脚本 | api-contract |
| `tests/unit/` | 纯逻辑 / 组件级：注入依赖的单元测试 | photo-wall（photoUrl）、phase7-core |

## 运行

```bash
# 全量（与 worker package.json 的 check 保持一致）
node --test tests/

# 单文件
node --test tests/api/mail-notify-settings.test.mjs
```

Worker 侧完整校验：`cd worker && pnpm check`（语法检查 → 配置检查 → phase1 → 本测试目录 → release 自检）。

> 注：`tests/phase5-tools.test.py` 与 `tests/migration-package.test.py` 是 Python 迁移工具测试（由
> `scripts/release/self-check.mjs` 在仓库根运行），不归本目录 Node 分层，保留在 `tests/` 根。

## 约定

- 文件名：`<功能>-<形态>.test.mjs`，例如 `photo-wall-api`（集成）与 `photo-wall-source`（源码断言）。
- 新增测试放对应子目录即可被 `node --test tests/` 自动发现。
- 保持脚本式写法（顶层 `await` + `assert` + 结尾 `console.log('…: PASS')`），与现有文件一致；每个文件独立进程运行，可安全改写 `globalThis.fetch`。
