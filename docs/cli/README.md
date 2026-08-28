# nb3

`nb3` 是仓库内部的开发命令行工具，不是给最终用户全局安装的 CLI。

它随 App 一起分发：`app-template-default`（以及由它生成的应用）把 `@nocobase/nb3-cli` 声明为 devDependency，通过 App 自己的 `package.json` scripts 调用。**不要 `npm i -g`，也不要让用户直接敲 `nb3`。**在 App 目录里跑对应的 `pnpm` 脚本即可。

## 插件命令

这些命令在 App 目录下执行。用户从 npm 拉下模板生成自己的 App 之后，装插件、卸插件、升级插件都靠它们。

| 脚本                      | 实际执行                     | 作用                        |
| ------------------------- | ---------------------------- | --------------------------- |
| `pnpm plugin:register`    | `nb3 app plugin register`    | 安装插件包，并写入三处注册  |
| `pnpm plugin:unregister`  | `nb3 app plugin unregister`  | 上述的逆操作，并卸载插件包  |
| `pnpm plugin:update`      | `nb3 app plugin update`      | 升级插件包，并同步其 skills |
| `pnpm plugin:skills:sync` | `nb3 app plugin skills sync` | 只同步 skills，不升级       |

### 安装插件

```bash
pnpm plugin:register audit-log                  # 从 registry 装最新版
pnpm plugin:register audit-log --version 1.2.0  # 指定版本
pnpm plugin:register audit-log --disabled       # 装上但不启用
pnpm plugin:register audit-log --no-install     # 包已经装好了，只写注册
pnpm plugin:register audit-log --dry-run
```

一条命令做五件事：装包、写 `package.json` 的依赖、写 `nocobase.plugins`、往 `client/plugins.ts` 里加 import 和注册项，最后把插件带的 skills 复制进 `.agents/skills/`。

**只有前端插件才会写 `client/plugins.ts`。** 判据是插件的 `package.json` 有没有 `exports["./client/plugin"]`——纯服务端插件没有，给它写一行 import 会让 App 构建时报模块找不到。命令会跳过并明确告诉你跳过了。

`client/plugins.ts` 是用 TypeScript 解析定位、再做文本拼接改的，不是整份 AST 重新打印，所以你写的注释、顺序、格式都会原样保留，diff 里只会多出一行 import 和一行注册项。

改完用 App 自己的 Prettier 和配置格式化。模板通过 `package.json` 的 `"prettier": "@nocobase/dev-config/prettier"` 继承配置；如果 App 把这个字段删了又没有别的 Prettier 配置，Prettier 会按自己的默认值（双引号）重排整个文件——这是 Prettier 的行为，不是命令改坏了。App 完全没装 Prettier 时不格式化，注册照常完成。

TypeScript 是必需的，因为要解析这个文件；模板自带，手工搭的 App 缺了会明确报错并且不写任何东西。

### 卸载插件

```bash
pnpm plugin:unregister audit-log
pnpm plugin:unregister audit-log --no-install   # 只解除注册，不卸包
pnpm plugin:unregister audit-log --dry-run
```

`register` 的逆操作，外加删掉这个插件装进来的 skills 目录——`skills sync` 只会写已注册插件的前缀，不会替你清理已经卸掉的插件。

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

| 参数              | 适用                     | 说明                           |
| ----------------- | ------------------------ | ------------------------------ |
| `--dir <path>`    | 全部                     | App 目录，默认当前目录         |
| `--dry-run`       | 全部                     | 只打印将要发生的变更，不写文件 |
| `--plugin <name>` | `update`、`skills sync`  | 指定插件；省略时作用于全部     |
| `--no-install`    | `register`、`unregister` | 不调包管理器，只改注册         |
| `--json`          | 仅 `skills sync`         | 机器可读输出                   |

`register` 和 `unregister` 的插件名是位置参数，不是 `--plugin`。`--plugin` 在 `plugin update` 上可以重复，在 `plugin skills sync` 上只接受一个。

插件名到处都能用短名（`audit-log`）或完整包名（`@nocobase/app-plugin-audit-log`）。

包管理器按 App 自己的 `packageManager` 字段和 lockfile 判断，不会在 pnpm 项目里凭空多出一个 `package-lock.json`。

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

### 仓库脚本和 App 命令的关系

两边做的事几乎一样，所以实现只有一份，都在 `@nocobase/nb3-cli` 里：

| 逻辑                         | 位置                             |
| ---------------------------- | -------------------------------- |
| 改 `client/plugins.ts`       | `src/lib/client-plugins.ts`      |
| 改 `nocobase.plugins` 和依赖 | `src/lib/plugin-registration.ts` |
| 复制 skills                  | `src/lib/skills-sync.ts`         |

真正的差别只有两处，所以它们是参数而不是分支：

- **插件从哪里找。** 仓库内是 `packages/` 下的工作区目录，App 内是 `node_modules` 里装好的依赖。
- **依赖记什么版本。** 仓库内是 `workspace:^`，App 内是从 registry 装到的实际版本（`^1.2.0`）。

`scripts/` 下那几个 `.mjs` 因此只剩下仓库特有的部分：解析 `--app`、跑 `pnpm install`、失败时回滚 `pnpm-lock.yaml`。

改动注册逻辑时改 CLI 里的那一份，两边一起生效；只改 `scripts/` 不会影响 App。

## App 与 Hub 命令

`nb3 app create`、`nb3 app dev`、`nb3 hub *` 等命令的实现仍在 `packages/cli/src/commands/` 中，但尚未定稿，文档暂不提供。需要了解当前行为时直接看源码或 `nb3 <topic> --help`。
