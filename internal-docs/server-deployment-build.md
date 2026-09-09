---
title: Server Deployment Build
description: dist/ 的裁剪与跨平台原生模块构建：命令、默认值和配置
---

# Server Deployment Build

`pnpm build` 产出的 `dist/` 是一份可直接运行的部署包：拷到服务器就能跑，**目标机器不需要 install、不需要编译工具链**。

为此构建里加了两步：

1. **裁剪** —— 删掉服务端运行时用不到的文件。`app-template-default` 从 542 MB 降到 111 MB（-80%），`app-template-hub` 从 206 MB 降到 50 MB（-76%）。
2. **跨平台原生模块** —— 把每个 `.node` 二进制换成目标平台需要的那个。

裁剪基于 [`@vercel/nft`](https://github.com/vercel/nft)（MIT）从服务端入口做的文件级引用追踪。之前按 `dependencies` 递归是包粒度的：一个包要么整个装、要么不装。实测 296 个包只因为被读了一次 `package.json` 就被整包装进去，合计 174 MB，其中 `lucide-react` 一个就 31 MB——部署树里没有浏览器。

## 命令

```bash
pnpm build                                         # 当前机器，构建完可以直接 pnpm start
pnpm build --target linux-x64                      # 部署到主流 Linux 服务器
pnpm build --target linux-arm64                    # ARM 服务器、Graviton
pnpm build --target linux-x64-musl                 # Alpine，以及大部分 slim 容器镜像
pnpm build --target linux-x64 --node-version 22    # 服务器跑 Node 22
```

**默认目标是当前机器**，因为构建后想立刻看效果是最常见的动作，`pnpm build && pnpm start` 必须能跑。部署到别处必须显式写 `--target`。

代价是忘写 `--target` 会产出只能在本机跑的包。所以构建**每次都打印**它产出的平台，并把结果记进 `dist/package.json` 的 `nocobase.buildTarget`——失败时能查，而不是只剩一句看不懂的加载错误。

三条诊断命令，都不改任何东西：

| 命令 | 用途 |
| --- | --- |
| `pnpm server:deps:inspect` | 报告服务端实际用到什么、有哪些原生模块、哪些 specifier 解析不了 |
| `pnpm server:deps:prune` | 单独跑裁剪（`pnpm build` 已包含） |
| `pnpm server:deps:retarget` | 单独跑原生模块换目标平台（`pnpm build` 已包含） |

排查问题从 `pnpm server:deps:inspect` 开始。

## `--target` 为什么是三个维度合一

一个 `.node` 文件同时绑定**平台、架构、C 库、Node ABI** 四项，错一项就加载不了。前三项写在 `--target` 里，因为它们是一起决定的：

| `--target` | 用在哪 |
| --- | --- |
| `linux-x64` | Ubuntu / Debian / CentOS 等主流发行版 |
| `linux-arm64` | ARM 服务器、Graviton |
| `linux-x64-musl` | Alpine，以及大部分 slim 容器镜像 |
| `darwin-arm64` / `darwin-x64` | macOS |
| `win32-x64` | Windows |
| `current`（默认） | 当前机器 |

**C 库和架构一样关键**：`linux-x64` 和 `linux-x64-musl` 是两个不同的二进制，Alpine 上用错会在启动时报共享库加载失败。服务器上 `ldd --version` 输出 `musl` 就是 musl，输出 `GNU libc` 就是 glibc。

Node ABI 单独用 `--node-version` 给主版本号（20 / 22 / 24 / 26，默认 24），因为同一台 Linux 可以跑任意 Node 版本。对照关系：ABI 115 = Node 20，127 = 22，137 = 24，147 = 26。

> ABI 对照表是写死在 `server-deps.mjs` 里的，没用 `node-abi`。那个库拿到裸主版本号会**静默返回错值**：`getAbi('24')` 返回 24 而不是 137，因为它把参数当成了 Node 0.x 时代的完整版本号。ABI 错了就会下载一个加载不了的二进制。

## 原生模块怎么换目标平台

按 **manifest 信号**识别，不认包名——这样应用后续自己装的原生依赖也能被正确处理，不需要有人来维护一张列表。

| 信号 | 机制 | 怎么换 |
| --- | --- | --- |
| manifest 有 `cpu` / `os` 字段 | 包本身就是某个平台的二进制（napi-rs、esbuild 那类） | 下载同一组里目标平台那个包 |
| install 脚本含 `prebuild-install` / `node-gyp` / `node-pre-gyp` / `prebuildify` / `cmake-js` | 装机时下载或编译 | `prebuild-install` 带 `--platform` / `--arch` / `--libc` / `--target` 重新下载 |
| 包里有多个 `.node` | 自带多平台 | 留目标平台那个，删其余 |
| 只有一个 `.node`，无 install 脚本、无平台元数据 | 无从判断 | 报出来，人工确认 |

模板当前的三个：`better-sqlite3`（下载）、`@napi-rs/canvas`（换包）、`oracledb`（自带 5 个平台，删掉 4 个省 2.4 MB）。

`pg`、`mysql2`、`tedious` 是纯 JS，不涉及这套。**只用这三个驱动的应用，`dist/` 天然跨平台**，`--target` 加不加都一样。

## 追踪看不见的三类东西

文件追踪只能看到字面量的 `import` / `require`，剩下三类要单独处理：

**1. 框架按名字解析的包** —— 写死在代码里的 `FRAMEWORK_KEEP`，目前是 `pino-pretty`、`pino-roll`、`@nocobase/nb3-cli`。前两个被 `app-server` 在 `target: 'pino-pretty'` 这样的配置字符串里引用；`nb3-cli` 是把模块路径当字符串交给 oclif 去 import，裁掉后每条命令都报 `MODULE_NOT_FOUND`、指着一个明明存在的路径。这不是应用的选择，应用也没理由知道，所以不放配置——**需要每个应用靠崩一次才发现的默认值，不算默认值**。

**2. 靠扫描目录读的内容** —— 写死的 `SCANNED_DIRECTORIES`：`database`、`migrations`、`seeds`、`locales`。迁移文件是列目录读进来的，文件名不出现在任何 import 里。对所有包生效，因为插件各自带 `dist/database`，应用无法枚举哪些插件有迁移。裁掉的后果很隐蔽：服务能启动，直到第一次查询才报表不存在。

**3. 应用自己在运行时解析的包** —— 这个才放配置，在应用 `package.json` 里：

```json
{
  "nocobase": {
    "serverDeps": {
      "keep": ["@acme/driver-*"]
    }
  }
}
```

`keep` 会连带保留该包自己的依赖（不然它自己的 `require` 照样解析不了），结尾 `*` 按前缀匹配。`pnpm build --keep <name>` 可以单次生效，用来先验证再写进配置。

原生模块一律整包保留，不参与裁剪：它们的二进制是靠运行时搜文件系统找到的，不是可解析的 specifier，删错的代价远大于省下的那几 MB。

## 构建自带的校验

`pnpm build` 最后一步跑 `verify-server-deps.mjs`：读应用自己 `server/`、`database/`、`cli/` 里的值导入，逐个确认它能进部署——既在 `dist/package.json` 里，裁剪后又不止剩一个 `package.json`。任一条不满足就让构建失败，并说明该怎么改。

它必须在裁剪**之后**跑，因为要检查的是裁剪结果，不是声明本身。构建前跑没有可查的对象。

**它抓得到的**：服务端 import 了一个只声明在 `devDependencies` 的包——这是最常见也最机械的错误，`dist/package.json` 只从 `dependencies` 生成，devDeps 在服务器上根本不存在。

**它抓不到的**，也没打算假装能抓：

```ts
await import(`${name}/index.js`);
```

包名要运行时才存在，静态分析拿不到——裁剪看不见它，校验同样看不见。这类只能在写代码时就写进 `nocobase.serverDeps.keep`。把这条明说出来，比让人以为"构建通过就万无一失"要好。

## 出问题怎么查

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| 服务器报 `Cannot find module 'x'`，本地正常 | 没有 import 字面量引用 `x`，被裁掉了 | 加进 `serverDeps.keep`，先用 `pnpm build --keep x` 验证 |
| 表不存在，或翻译回落成 key | 扫描目录没保住 | 把对应的包加进 `keep` |
| `Error loading shared library` / `invalid ELF header` / 只报一个 `.node` 路径 | 二进制和服务器不匹配 | 对比 `dist/package.json` 的 `nocobase.buildTarget` 和服务器的 `process.platform`、`process.arch`、`process.versions.modules`，用匹配的 `--target` / `--node-version` 重新构建 |
| 构建时报 `no prebuilt binary for <target>` | 该包没发布这个组合的预编译版本 | 确认包是否支持该平台；musl 的覆盖比 glibc 少 |

**排除裁剪嫌疑**：`cd dist && pnpm install --prod --no-lockfile` 还原完整依赖树再跑。裁剪只删 `dist/node_modules` 里的文件、不改任何 manifest，所以这条命令能回到裁剪前的状态。还错就跟裁剪无关。

## 实现

```
scripts/utils/server-deps.mjs           共享分析：追踪、配置、原生模块识别、目标平台解析
scripts/utils/inspect-server-deps.mjs   只读报告
scripts/utils/prune-server-deps.mjs     执行裁剪
scripts/utils/retarget-native.mjs       执行原生模块换平台
scripts/utils/verify-server-deps.mjs    构建末尾校验，不通过就失败
```

三个脚本读同一份分析，所以 `inspect` 是构建的**预览**而不是另一套说法。两个模板的这四个文件保持逐字节相同。

构建顺序是 install → prune → retarget。retarget 在最后，因为它替换的是 prune 已经决定保留的文件。

**改动这部分必须实际跑一遍**：构建 → 把 `dist/` 拷到一个没有 `node_modules` 可借用的目录 → 跑迁移 → 启动 → 调一个读写数据库的接口。这套代码要防的失败全是同一个形状——**进程能起来，后面才炸**，只看追踪输出发现不了。上面那三类看不见的东西，全都是这样跑出来的。
