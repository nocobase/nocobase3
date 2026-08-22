# @nocobase/nb3-cli

NocoBase 3 命令行工具，命令名为 `nb3`。

命令文档见 [docs/cli](../../docs/cli)：[`nb3 app`](../../docs/cli/nb3-app.md) 和 [`nb3 hub`](../../docs/cli/nb3-hub.md)。

## 当前状态

已实现：

| 命令              | 说明                                          |
| ----------------- | --------------------------------------------- |
| `nb3 app create`  | 从 npm 下载模板包并生成本地 App 项目          |
| `nb3 app dev`     | 用项目自身的包管理器运行其 `dev` 脚本         |
| `nb3 app info`    | 显示 App 名称、目录、模板来源、依赖是否已安装 |
| `nb3 app config`  | 读写 `.nb3/config.json`                       |
| `nb3 app destroy` | 删除本地 App 目录，带确认和路径防护           |

`nb3 app deploy`、`nb3 app pull`、`nb3 app list` 需要 Hub 提供 App 管理 API，而 v3 的 Hub 目前只有健康检查和一个 API 代理，因此这三条命令以退出码 3 明确报错，不打印占位输出——脚本里 deploy 返回成功却什么都没做，比直接失败危险得多。

`nb3 hub` 的 8 条命令仍是 stub，打印命令名和解析出的参数，退出码 0。

退出码约定：`0` 成功或 stub，`1` 运行错误，`2` 参数错误，`3` 尚未实现。

由于 v3 的模板包尚未发布，默认模板源暂时指向已发布的 v2 包 `@nocobase/portal-template-default@3.1.1`，用于跑通完整流程。等 v3 包发布后，只需改 `src/lib/template.ts` 里的 `DEFAULT_TEMPLATE` 一个常量。开发 v3 模板本身时可以直接指向本地目录：

```bash
nb3 app create crm --template ./packages/app-template-default
```

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
