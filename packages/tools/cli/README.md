# @nocobase/nb3-cli

NocoBase 3 内部开发命令行工具，命令名为 `nb3`。

这不是给最终用户全局安装的 CLI，它只做一件事：插件注册。作为 devDependency 随 App 分发，由 App 的 `package.json` scripts 调用，例如 `pnpm plugin:update` 实际执行 `nb3 app plugin update`。本仓库根目录也调用同一套实现，加上 `--workspace-root .`。

创建项目不走这里，走 `pnpm create @nocobase/app`。

命令文档见 [internal-docs/cli](../../../internal-docs/cli/README.md)。

## 命令

| 命令                         | 说明                                               |
| ---------------------------- | -------------------------------------------------- |
| `nb3 app plugin register`    | 安装插件并写入 manifest、Client 与 Server 显式入口 |
| `nb3 app plugin inspect`     | 只读检查插件的静态注册状态和同步 Skills            |
| `nb3 app plugin unregister`  | 上述的逆操作，并卸载插件包                         |
| `nb3 app plugin update`      | 升级插件包并同步其 skills                          |
| `nb3 app plugin skills sync` | 同步插件 skills，不升级                            |

实现在 `src/lib/` 下的 `client-plugins.ts`、`server-plugins.ts`、`plugin-registration.ts` 和 `skills-sync.ts`。仓库根目录不再维护第二套 register、unregister 或 skills sync 脚本。

`--workspace-root` 模式从 workspace 选择 App，并默认写入 `workspace:^`；普通 App 模式则从当前 App 的 `node_modules` 解析插件。两个显式入口编辑器都从目标 App 解析 TypeScript 和 Prettier，所以 App 用自己的版本和配置格式化自己的源码，两者缺失也不会让注册失败。

`--json` 模式输出一个 JSON document：成功写 stdout，失败写 stderr 并保留非零退出码。`plugin inspect` 只检查静态注册面，不代替运行时、权限、测试或构建验证。

退出码约定：`0` 成功，`1` 运行错误，`2` 参数错误。

## 曾经有过的命令

`nb3 app create`、`nb3 app dev`、`nb3 app info`、`nb3 app config`、`nb3 app destroy`、`nb3 app deploy`、`nb3 app pull`、`nb3 app list` 和 `nb3 hub *` 全部已删除。

它们来自一个不同的设想：用户先全局安装 `nb3`，再用它创建和运行项目。实际走的是另一条路——项目由 `pnpm create @nocobase/app` 生成，之后用项目自己的 `pnpm dev`、`pnpm build`、`pnpm start` 运行，Hub 也一样。那批命令因此没有任何调用方，其中 `deploy`、`pull`、`list` 甚至从未实现，只会以退出码 3 报错。

需要 Hub 的启停时用 Hub 项目自己的 scripts。将来若要做部署，从 `dist/package.json` 出发重新设计，而不是复活当时的空壳。

## 开发

命令源码在 `src/commands/` 下，目录结构即命令结构：`src/commands/app/plugin/register.ts` 对应 `nb3 app plugin register`。

```bash
node ./bin/run.js app plugin inspect --help   # 直接跑源码，Node 24 原生擦除类型，无需 loader
pnpm --filter @nocobase/nb3-cli build        # 编译到 dist
pnpm --filter @nocobase/nb3-cli check        # lint + format + typecheck + test + build
```

入口 `bin/run.js` 会自动判断运行模式：源码目录存在 `src/commands` 时加载 `src/`，发布安装后加载 `dist/`。发布产物必须走 `dist`，因为 Node 拒绝对 `node_modules` 内的 `.ts` 做类型擦除。设置 `NB3_CLI_USE_DIST=1` 可以在源码目录中强制使用 `dist` 验证发布形态。

`tests/commands.test.ts` 精确断言命令清单，增删命令必须同步改那里，避免命令面悄悄漂移。

## 约定

环境变量前缀 `NB3_`。全局目录 `~/.nb3/`（`NB3_CLI_ROOT`）和项目局部的 `.nb3/` 都随上面那批命令一起消失了——前者只被 `app create` 用过，后者只被 `app info`/`config`/`destroy` 和 `hub *` 读写。插件注册全部作用于 App 自己的 `package.json` 和源码。
