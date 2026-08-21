# @nocobase/nb3-cli

NocoBase 3 命令行工具，命令名为 `nb3`。

命令文档见 [docs/cli](../../docs/cli)：[`nb3 app`](../../docs/cli/nb3-app.md) 和 [`nb3 hub`](../../docs/cli/nb3-hub.md)。

## 当前状态

16 条命令的参数契约（args、flags、description、examples）都已按文档定义完整，但尚未实现具体行为。执行任何命令都会打印命令名和解析出的参数，并标注 `not implemented`，退出码为 0：

```bash
$ nb3 app create crm
[nb3] app create (not implemented)
  name        crm
  --template  @nocobase/app-template-default
```

参数错误（缺少必填参数、未知 flag、未知命令）仍然按 oclif 的正常行为报错并以非 0 退出。

## 开发

命令源码在 `src/commands/` 下，目录结构即命令结构：`src/commands/app/create.ts` 对应 `nb3 app create`。

```bash
node ./bin/run.js app create crm     # 直接跑源码，Node 24 原生擦除类型，无需 loader
pnpm --filter @nocobase/nb3-cli build   # 编译到 dist
pnpm --filter @nocobase/nb3-cli check   # lint + format + typecheck + test + build
```

入口 `bin/run.js` 会自动判断运行模式：源码目录存在 `src/commands` 时加载 `src/`，发布安装后加载 `dist/`。发布产物必须走 `dist`，因为 Node 拒绝对 `node_modules` 内的 `.ts` 做类型擦除。设置 `NB3_CLI_USE_DIST=1` 可以在源码目录中强制使用 `dist` 验证发布形态。

## 约定

- 全局目录 `~/.nb3/`，可通过 `NB3_CLI_ROOT` 覆盖。
- 项目局部目录 `.nb3/`，App 和 Hub 一致。
- 环境变量前缀 `NB3_`。
