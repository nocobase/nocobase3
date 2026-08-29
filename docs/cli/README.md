# nb3

`nb3` 是仓库内部的开发命令行工具，不是给最终用户全局安装的 CLI。

它随 App 一起分发：`app-template-default`（以及由它生成的应用）把 `@nocobase/nb3-cli` 声明为 devDependency，通过 App 自己的 `package.json` scripts 调用。**不要 `npm i -g`，也不要让用户直接敲 `nb3`。**在 App 目录里跑对应的 `pnpm` 脚本即可。

## 插件命令

这些命令在 App 目录下执行。用户从 npm 拉下模板生成自己的 App 之后，装插件、卸插件、升级插件都靠它们。

| 脚本                      | 实际执行                     | 作用                        |
| ------------------------- | ---------------------------- | --------------------------- |
| `pnpm plugin:register`    | `nb3 app plugin register`    | 安装插件包，并写入显式注册  |
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

一条命令完成安装和显式接线：装包，写 `package.json` 的依赖与 `nocobase.plugins`，根据包导出分别更新 `client/plugins.ts` 和 `server/plugins.ts`，最后把插件带的 skills 复制进 `.agents/skills/`。

**只有前端插件才会写 `client/plugins.ts`。** 判据是插件的 `package.json` 有没有 `exports["./client"]`——纯服务端插件没有，给它写一行 import 会让 App 构建时报模块找不到。命令会跳过并明确告诉你跳过了。

判据看的是 `./client` 而不是 `./client/plugin`，因为写进去的 import 就是 `<包名>/client`。只有 `./client/plugin` 的插件（barrel 加 default 导出之前发布的版本）同样会被跳过，否则写进去的那行在 App 里解析不到。

**只有服务端插件才会写 `server/plugins.ts`。** 判据是 `exports["./server/plugin"]`，注册项直接写 `auditLog`，不是 Client factory 形式的 `auditLog()`。纯客户端插件会跳过这一项。`--disabled` 会保留安装和 manifest 登记，但 Client 和 Server 两个运行时入口都不接线。

两个 `plugins.ts` 都是用 TypeScript 解析定位、再做文本拼接改的，不是整份 AST 重新打印，所以你写的注释、顺序、泛型和格式都会原样保留，diff 里只会多出 import 和注册项。

改完用 App 自己的 Prettier 和配置格式化。模板通过 `package.json` 的 `"prettier": "@nocobase/dev-config/prettier"` 继承配置；如果 App 把这个字段删了又没有别的 Prettier 配置，Prettier 会按自己的默认值（双引号）重排整个文件——这是 Prettier 的行为，不是命令改坏了。App 完全没装 Prettier 时不格式化，注册照常完成。

App 没装 TypeScript 时不会整条命令失败——装包、写 `package.json`、复制 skills 都不需要编译器，照常完成；Client 或 Server 入口需要接线时会分别降级，把对应的两行原样打出来。

```
  client/plugins.ts: not edited, TypeScript is not installed in this app

Everything else is done. Add these two lines to client/plugins.ts by hand:
  1. after the existing imports:  import auditLog from '@nocobase/app-plugin-audit-log/client';
  2. inside defineClientPlugins([...]):  auditLog(),

Or install TypeScript and re-run this command to have it written for you:
  pnpm add -D typescript
```

退出码是 0,因为注册确实成功了。装上 TypeScript 后重跑同一条命令,它只补上缺的那两行,不会重复已经做完的部分。这样人和 AI agent 拿到输出都知道下一步该干什么。

### 卸载插件

```bash
pnpm plugin:unregister audit-log
pnpm plugin:unregister audit-log --no-install   # 只解除注册，不卸包
pnpm plugin:unregister audit-log --dry-run
```

`register` 的逆操作，顺序是固定的：

1. 删掉这个插件装进来的 skills 目录（要在卸包之前，skills 是从装好的包里复制出来的）
2. `pnpm remove` 卸包（要在改 `package.json` 之前——依赖先被删掉的话 pnpm 会找不到要卸的包而直接报错）
3. 从 `package.json` 移除依赖和 `nocobase.plugins` 登记
4. 从 `client/plugins.ts` 和 `server/plugins.ts` 删掉相应 import 和数组项

`skills sync` 只会写已注册插件的前缀，不会替你清理已经卸掉的插件，所以第 1 步必须由这条命令做。

同样地，App 没装 TypeScript 时前三步照常完成，只有第 4 步按实际导出降级成打印要删的 Client/Server 行。

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

仓库维护模式还提供以下两个参数，根 `package.json` 已经自动传入前者：

| 参数                      | 说明                                                              |
| ------------------------- | ----------------------------------------------------------------- |
| `--workspace-root <path>` | 从 monorepo 选择 App，并让 register 默认使用 `workspace:^`        |
| `--app <name>`            | workspace App 的目录名或完整包名；省略时为 `app-template-default` |

`register` 和 `unregister` 的插件名是位置参数，不是 `--plugin`。`--plugin` 在 `plugin update` 上可以重复，在 `plugin skills sync` 上只接受一个。

插件名到处都能用短名（`audit-log`）或完整包名（`@nocobase/app-plugin-audit-log`）。

包管理器按 App 自己的 `packageManager` 字段和 lockfile 判断，不会在 pnpm 项目里凭空多出一个 `package-lock.json`。

命令 id 用空格分隔，也可以写成冒号形式：`nb3 app plugin skills:sync` 与 `nb3 app plugin skills sync` 等价。

## 仓库内开发命令

在本仓库根目录开发插件时仍使用这些 `pnpm` scripts。除创建和删除源码外，注册、卸载和 skills 同步都直接调用同一个 `nb3 app plugin *` 实现：

| 命令                            | 作用                                                    |
| ------------------------------- | ------------------------------------------------------- |
| `pnpm plugin:create <name>`     | 生成 `packages/app-plugin-<name>/` 脚手架               |
| `pnpm plugin:register <name>`   | 写依赖、manifest、Client/Server 显式入口，并复制 skills |
| `pnpm plugin:unregister <name>` | 上述四项的逆操作                                        |
| `pnpm plugin:remove <name>`     | 删除插件源码；仍被引用时会拒绝并提示先 unregister       |
| `pnpm plugin:skills:sync`       | 只同步 skills（从 `packages/` 解析插件）                |

完整参数用 `--help` 查看。插件开发流程见 [plugin-development-quickstart.md](../plugin-development-quickstart.md)。

### 仓库命令和 App 命令的关系

两边做的事几乎一样，所以实现只有一份，都在 `@nocobase/nb3-cli` 里：

| 逻辑                         | 位置                             |
| ---------------------------- | -------------------------------- |
| 改 `client/plugins.ts`       | `src/lib/client-plugins.ts`      |
| 改 `server/plugins.ts`       | `src/lib/server-plugins.ts`      |
| 改 `nocobase.plugins` 和依赖 | `src/lib/plugin-registration.ts` |
| 复制 skills                  | `src/lib/skills-sync.ts`         |

根脚本给 `nb3` 传入 `--workspace-root .`。这个模式支持 `--app <目录名或完整包名>`，省略时选择 `app-template-default`，并把注册依赖范围默认设为 `workspace:^`。独立 App 不传这个参数，仍以当前目录为 App 并从 registry 安装。

真正的差别只有两处，所以它们是同一条命令的运行参数：

- **插件从哪里找。** 仓库内是 `packages/` 下的工作区目录，App 内是 `node_modules` 里装好的依赖。
- **依赖记什么版本。** 仓库内是 `workspace:^`，App 内是从 registry 装到的实际版本（`^1.2.0`）。

仓库根目录不再保留 `create-plugin.mjs`、`register-plugin.mjs`、`unregister-plugin.mjs` 或 `sync-skills.mjs`。改动注册逻辑时只改对应包内实现：创建逻辑位于 `@nocobase/create-plugin`，注册与 skills 逻辑位于 `@nocobase/nb3-cli`。只有删除 workspace 插件源码的 `plugin:remove` 仍是仓库专属命令，继续留在 `scripts/`。

## APP 发布与 Hub 连接

APP 的产物发布、部署、状态查询和 Hub 登录已经通过项目内的 `pnpm` scripts 提供，不需要直接调用内部的 `nb3` 命令：

- [APP 管理脚本](./nb3-app.md)
- [连接 Hub](./nb3-hub.md)

`nb3 app create`、`nb3 app dev`、`nb3 hub *` 等其他内部命令的实现仍在 `packages/cli/src/commands/` 中。需要了解当前行为时查看源码或运行 `nb3 <topic> --help`。
