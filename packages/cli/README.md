# @nocobase/nb3-cli

NocoBase 3 内部开发命令行工具，命令名为 `nb3`。

这不是给最终用户全局安装的 CLI。它作为 devDependency 随 App 分发，由 App 的 `package.json` scripts 调用，例如 `pnpm plugin:update` 实际执行 `nb3 app plugin update`。

命令文档见 [docs/cli](../../docs/cli/README.md)。

## 当前状态

已实现：

| 命令                         | 说明                                                        |
| ---------------------------- | ----------------------------------------------------------- |
| `nb3 app create`             | 从 npm 下载模板包并生成本地 App 项目                        |
| `nb3 app dev`                | 用项目自身的包管理器运行其 `dev` 脚本                       |
| `nb3 app info`               | 显示 App 名称、目录、模板来源、依赖是否已安装               |
| `nb3 app config`             | 读写 `.nb3/config.json`                                     |
| `nb3 app plugin register`    | 安装插件并写入依赖、`nocobase.plugins`、`client/plugins.ts` |
| `nb3 app plugin unregister`  | 上述的逆操作，并卸载插件包                                  |
| `nb3 app plugin update`      | 升级插件包并同步其 skills                                   |
| `nb3 app plugin skills sync` | 同步插件 skills，不升级                                     |
| `nb3 app destroy`            | 删除本地 App 目录，带确认和路径防护                         |
| `nb3 hub create`             | 下载模板包并生成 Hub 项目                                   |
| `nb3 hub start`              | 后台启动 Hub 并记录进程，`--foreground` 可留在当前终端      |
| `nb3 hub dev`                | 开发模式启动，停留在当前终端                                |
| `nb3 hub restart`            | 停止后重新启动                                              |
| `nb3 hub status`             | 显示运行状态、进程号、地址、已部署 App 数                   |
| `nb3 hub stop`               | 停止 Hub，先 SIGTERM 再 SIGKILL，并清理陈旧记录             |
| `nb3 hub logs`               | 查看日志，支持 `--tail` 和 `--follow`                       |
| `nb3 hub open`               | 打开 App Console                                            |

`nb3 app deploy`、`nb3 app pull`、`nb3 app list` 需要 Hub 提供 App 管理 API，而 v3 的 Hub 目前只有健康检查和一个 API 代理，因此这三条命令以退出码 3 明确报错，不打印占位输出——脚本里 deploy 返回成功却什么都没做，比直接失败危险得多。

`nb3 hub` 的 8 条命令全部可用。

插件注册的实现在 `src/lib/` 下的 `client-plugins.ts`、`plugin-registration.ts`、`skills-sync.ts`，仓库根目录的 `scripts/*-plugin.mjs` 共用同一份，区别只在插件从工作区还是从 `node_modules` 解析。`client-plugins.ts` 把 TypeScript 和 Prettier 都从目标 App 解析，所以 App 用自己的版本和配置格式化自己的源码，两者缺失也不会让注册失败。

停止 Hub 时终止的是整个进程组而不是单个进程：start 脚本通常是包管理器的包装进程，真正监听端口的服务是它的孙进程，只杀记录的 pid 会留下占着端口的孤儿。

`nb3 hub create` 的默认模板源是 `@nocobase/hub@beta`。

退出码约定：`0` 成功或 stub，`1` 运行错误，`2` 参数错误，`3` 尚未实现。

默认模板源是 `@nocobase/app-template-default@beta`，从自建 registry `https://npm.nocobase.ai` 下载。

`@beta` 是因为目前只有预览版发布到了这条渠道；第一个稳定版发出后，把 `src/lib/template.ts` 里的 `DEFAULT_TEMPLATE` 和 `DEFAULT_HUB_TEMPLATE` 改成稳定范围即可。

两个默认值都能覆盖：

```bash
nb3 app create crm --template @nocobase/app-template-default@0.0.1
nb3 app create crm --registry https://registry.npmjs.org
```

开发模板本身时直接指向本地目录：

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
