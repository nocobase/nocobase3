---
title: Server Deployment Build
description: 前后端依赖怎么声明，以及跨平台构建
---

# Server Deployment Build

`pnpm build` 产出的 `dist/` 是一份可直接运行的部署包：拷到服务器，`pnpm install --prod` 装出来的就是运行所需的全部，不需要编译工具链。

哪些依赖进服务器、哪些不进，**完全由声明决定**，不做任何静态分析。

## 依赖怎么声明

### 插件（发布到 npm）

| 依赖类型 | 声明位置 | 应用侧装吗 | 部署侧装吗 |
| --- | --- | --- | --- |
| 服务端运行时用 | `dependencies` | 装 | **装** |
| 前端用（浏览器代码 import） | `peerDependencies` + `devDependencies` | **装** | 不装 |
| 只在开发/测试用 | `devDependencies` | 不装 | 不装 |
| 消费方可有可无 | `peerDependencies` + `optional` | 不装 | 不装 |

**前端依赖为什么是 peer**：插件的 `client/` 不由插件自己打包——`build` 就是 `tsc`，`dist/client/*.js` 保留裸导入，由**安装它的应用**用 Vite 解析。所以这些包必须随 manifest 发布，否则应用构建时报 `Could not resolve`。但服务器没有前端构建，永远不 require 它们。声明成 peer 同时满足两边：应用装一份共享的，`dist/` 通过 `autoInstallPeers: false` 一个都不装。

**配套的 `devDependencies` 是必需的**：peer 在仓库内不会自动安装，没有它插件自己的 lint / test / build 都跑不起来。它同时钉住开发时用的版本。

**`optional` 不是"这个阶段不装"**。标了 `optional` 的 peer 在**任何地方**都不自动安装，包括真正需要它的那个应用——那正是这套机制要避免的故障。它的正确含义是"消费方可能真的不需要它"，比如 `@nocobase/i18n` 的 `hono` 对纯浏览器消费方无意义。屏蔽部署侧安装是 `autoInstallPeers: false` 的职责，不需要 `optional` 参与。

### 应用（create-app 生成的项目）

| 依赖类型 | 声明位置 |
| --- | --- |
| 服务端运行时用 | `dependencies` |
| 前端用、构建工具、测试 | `devDependencies` |

应用是终点，没有人会安装它，所以只有两档。前端依赖放 `devDependencies` 是对的：Vite 在构建时把它们内联进 `dist/client`，运行时不再解析。

## 跨平台构建

一个 `.node` 二进制同时绑定**平台、架构、C 库、Node ABI** 四项，错一项就加载不了。

```bash
pnpm build                                        # 当前机器，构建完可以直接 pnpm start
pnpm build --target linux-x64                     # 主流 Linux 服务器
pnpm build --target linux-arm64                   # ARM 服务器、Graviton
pnpm build --target linux-x64-musl                # Alpine，以及大部分 slim 容器镜像
pnpm build --target linux-x64 --node-version 22   # 服务器跑 Node 22
```

**默认目标是当前机器**，因为构建后想立刻看效果是最常见的动作。部署到别处必须显式写 `--target`。每次构建都会打印产出的平台，并记进 `dist/package.json` 的 `nocobase.buildTarget`，出问题时能对照。

`--target` 把平台、架构、C 库合在一起，因为它们是一起决定的：`linux-x64` 和 `linux-x64-musl` 是两个不同的二进制，Alpine 上用错会在启动时报共享库加载失败。服务器上 `ldd --version` 输出 `musl` 就是 musl。

`--node-version` 单独给主版本号（20 / 22 / 24 / 26，默认 24），因为同一台 Linux 可以跑任意 Node 版本。ABI 对照：115 = Node 20，127 = 22，137 = 24，147 = 26。

> ABI 表是写死的，没用 `node-abi`——那个库拿到裸主版本号会静默返回错值：`getAbi('24')` 返回 24 而不是 137。ABI 错了会下载一个加载不了的二进制。

原生模块按 **manifest 信号**识别，不认包名，所以应用后续自己装的原生依赖也能被正确处理：

| 信号 | 机制 | 换目标平台的方式 |
| --- | --- | --- |
| manifest 有 `cpu` / `os` | 包本身就是某平台的二进制 | 下载同组里目标平台那个包 |
| install 脚本含 `prebuild-install` / `node-gyp` 等 | 装机时下载或编译 | 带 `--platform` / `--arch` / `--libc` / `--target` 重新下载 |
| 包里有多个 `.node` | 自带多平台 | 留目标平台那个，删其余 |
| 只有一个 `.node`、无 install 脚本 | 无从判断 | 报出来，人工确认 |

`pg`、`mysql2`、`tedious` 是纯 JS，只用这三个驱动的应用天然跨平台。

## 构建自带的校验

`pnpm build` 最后跑 `verify-server-deps.mjs`：读应用自己 `server/`、`database/`、`cli/` 里的值导入，确认每个包都能进部署。不通过就让构建失败。

**它抓得到**：服务端 import 了一个只声明在 `devDependencies` 的包——`dist/package.json` 只从 `dependencies` 生成，devDeps 在服务器上不存在。

**它抓不到**，也不假装能抓：

```ts
await import(`${name}/index.js`);
```

包名要运行时才存在，静态分析拿不到。这类只能在写代码时就声明进 `dependencies`。

## 出问题怎么查

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| 服务器报 `Cannot find module`，本地正常 | 包在 `devDependencies`，没进 `dist/package.json` | 挪到 `dependencies` |
| 应用构建时前端包解析不到 | 插件声明成 peer，但没人提供 | 加进应用的 `devDependencies` |
| `Error loading shared library` / `invalid ELF header` | 二进制和服务器不匹配 | 对比 `dist/package.json` 的 `nocobase.buildTarget` 和服务器的 `process.platform` / `process.arch` / `process.versions.modules`，用匹配的参数重建 |
| 构建时报 `no prebuilt binary for <target>` | 该包没发布这个组合 | 确认包是否支持该平台；musl 覆盖比 glibc 少 |

## 实现

```
scripts/utils/build-server-dist-package.mjs  生成 dist/package.json 和 pnpm-workspace.yaml
scripts/utils/server-deps.mjs                原生模块识别、目标平台解析
scripts/utils/retarget-native.mjs            按目标平台替换原生二进制
scripts/utils/verify-server-deps.mjs         构建末尾校验
```

`dist/pnpm-workspace.yaml` 里的 `autoInstallPeers: false` 是把前端依赖挡在服务器外的关键，`nodeLinker: hoisted` 产出部署期望的扁平 `node_modules`，`allowBuilds` 决定哪些原生包可以跑 install 脚本。
