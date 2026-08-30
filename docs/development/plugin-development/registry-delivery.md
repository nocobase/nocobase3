---
title: 构建、发布与安装 Plugin Registry
description: 构建 Registry JSON、随插件包发布，并通过 materialize 或远程 shadcn add 安装到消费 App。
---

# 构建、发布与安装 Plugin Registry

本页从已经完成的 `registry/<item>` 和 `registry.config.json` 开始。定义 item 时先阅读[编写 Registry item](./registry-authoring.md)。

## 两条交付路径

```text
registry/<item> + registry.config.json
        ├── registry materialize → App/client/extensions/<name>
        └── registry build → public/r/<item>.json → HTTP/CDN → shadcn add
```

| 安装方式                         | 是否先 build | 数据来源              |
| -------------------------------- | ------------ | --------------------- |
| workspace `registry materialize` | 否           | canonical source      |
| 远程 `shadcn add`                | 是           | HTTP(S) Registry JSON |

## 构建

```bash
pnpm registry build \
  --package @nocobase/app-plugin-registry-example
```

完整构建生成 `public/r/registry.json` 和每个 `<item>.json`。可以在开发时用 `--item` 只构建一个 item，但发布多 item package 前必须执行一次不带 `--item` 的完整构建。

包应发布运行时产物、canonical source、配置和 Registry JSON，并在打包前重新构建：

```json
{
  "files": ["dist", "registry", "registry.config.json", "public/r"],
  "scripts": {
    "registry:build": "node ../../scripts/registry.mjs build --package .",
    "prepack": "pnpm registry:build"
  }
}
```

`public/r/` 是生成目录，不要手工修改。发布 npm 包也不等于已经提供 HTTP Registry；远程安装还需要静态站点、对象存储或 CDN 暴露 JSON。

## Workspace materialize

```bash
pnpm registry materialize \
  --package @nocobase/app-plugin-registry-example \
  --item component-ui \
  --output-root packages/app-template-default
```

当前 materialize 只复制 canonical source。它不安装 npm dependencies 或 registryDependencies，不注册插件，不强制检查 required plugins，不记录版本或 hash，并且目标存在时拒绝覆盖。因此调用方必须先准备依赖和插件，再确认目标目录不存在。

## 远程安装

```bash
cd packages/app-template-default
pnpm exec shadcn add \
  https://registry.example.com/feature-card/r/component-ui.json
```

远程 shadcn add 会根据 item 处理 dependencies、registryDependencies 和文件 target。消费 App 中配置的本地 Registry URL 只是地址约定，不会自动暴露任意已安装插件的 `public/r`。

## 安装后的接入

- 带 `extension.ts` 的页面 item 可以被 Default Template 自动发现；
- 组件由 App 从公开入口 import；
- Provider 由 App 选择包裹范围；
- 安装 item 不会自动注册或启用其依赖插件；
- 安装副本作为 App 源码参加 TypeScript、Vite 和样式构建。

## 验证

插件侧运行相关 lint、typecheck、test、`registry:build` 和 build，然后在临时或真实 App 中安装并运行消费端检查。仅运行插件 typecheck 不能证明使用 App alias 和依赖的安装副本可用。

`client:inspect` 只有在 item 实际形成 Client contribution，并且需要诊断 composition 时才使用；它不是 Registry build 或 materialize 的默认验证步骤。

完整 CLI 边界和示例见[Registry 深入参考](./plugin-registry-reference.md)。已有 App-owned 副本的更新见[Registry 升级与移除](./registry-upgrades.md)。
