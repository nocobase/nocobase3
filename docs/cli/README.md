# nb3

`nb3` 是仓库内部的开发命令行工具，不是给最终用户全局安装的 CLI。

它随 App 一起分发：`app-template-default`（以及由它生成的应用）把 `@nocobase/nb3-cli` 声明为 devDependency，通过 App 自己的 `package.json` scripts 调用。**不要 `npm i -g`，也不要让用户直接敲 `nb3`。**在 App 目录里跑对应的 `pnpm` 脚本即可。

## 插件命令

这两条命令在 App 目录下执行。

| 脚本                      | 实际执行                     | 作用                        |
| ------------------------- | ---------------------------- | --------------------------- |
| `pnpm plugin:update`      | `nb3 app plugin update`      | 升级插件包，并同步其 skills |
| `pnpm plugin:skills:sync` | `nb3 app plugin skills sync` | 只同步 skills，不升级       |

### 升级插件

```bash
pnpm plugin:update                                     # 升级全部已注册插件
pnpm plugin:update --plugin audit-log                  # 只升级一个
pnpm plugin:update --plugin audit-log --plugin workflow
pnpm plugin:update --dry-run                           # 只打印不执行
```

插件名可以用短名（`audit-log`）或完整包名（`@nocobase/app-plugin-audit-log`）。`--plugin` 可以重复；不传时升级 App 注册的全部插件。传了未注册的插件会被拒绝，并列出当前已注册的插件。

升级用 App 自己在用的包管理器，按 `packageManager` 字段和 lockfile 判断。升级失败时不会同步 skills；升级成功但同步失败只警告，因为升级本身已经生效。

**为什么升级要连带同步 skills：**skills 是复制进 App 的 `.agents/skills/`，不是运行时从 `node_modules` 读的，所以单独升级包会留下旧副本。这条命令把两步绑在一起就是为了避免这个。

### 只同步 skills

```bash
pnpm plugin:skills:sync
pnpm plugin:skills:sync --plugin audit-log
pnpm plugin:skills:sync --dry-run
```

上游是唯一真相：每个同步过来的目录都会被整体替换，本地改动会丢失。要写自己的 skills，用一个不以 `nocobase-` 开头的目录名，同步不会碰它。

### 通用参数

| 参数              | 适用             | 说明                           |
| ----------------- | ---------------- | ------------------------------ |
| `--plugin <name>` | 两条             | 指定插件；省略时作用于全部     |
| `--dir <path>`    | 两条             | App 目录，默认当前目录         |
| `--dry-run`       | 两条             | 只打印将要发生的变更，不写文件 |
| `--json`          | 仅 `skills sync` | 机器可读输出                   |

`--plugin` 在 `plugin update` 上可以重复，在 `plugin skills sync` 上只接受一个。

命令 id 用空格分隔，也可以写成冒号形式：`nb3 app plugin skills:sync` 与 `nb3 app plugin skills sync` 等价。

## 仓库内开发命令

在本仓库根目录开发插件时用这些，它们是根 `package.json` 的 scripts，不走 `nb3`：

| 命令                            | 作用                                                             |
| ------------------------------- | ---------------------------------------------------------------- |
| `pnpm plugin:create <name>`     | 生成 `packages/app-plugin-<name>/` 脚手架                        |
| `pnpm plugin:register <name>`   | 写入依赖、`nocobase.plugins`、`client/plugins.ts`，并复制 skills |
| `pnpm plugin:unregister <name>` | 上述四项的逆操作                                                 |
| `pnpm plugin:remove <name>`     | 删除插件源码；仍被引用时会拒绝并提示先 unregister                |
| `pnpm plugin:skills:sync`       | 只同步 skills（从 `packages/` 解析插件）                         |

完整参数用 `--help` 查看。插件开发流程见 [plugin-development-quickstart.md](../plugin-development-quickstart.md)。

同步逻辑本身只有一份，在 `@nocobase/nb3-cli` 的 `src/lib/skills-sync.ts`；仓库脚本和 App 命令共用它，区别只在插件从哪里找——仓库内从 `packages/`，App 内从 `node_modules`。

## App 与 Hub 命令

`nb3 app create`、`nb3 app dev`、`nb3 hub *` 等命令的实现仍在 `packages/cli/src/commands/` 中，但尚未定稿，文档暂不提供。需要了解当前行为时直接看源码或 `nb3 <topic> --help`。
