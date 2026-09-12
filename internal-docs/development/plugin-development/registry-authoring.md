---
title: 编写 Plugin Registry item
description: 在插件中定义 App-owned 的可编辑 Client 源码配方，并维护 canonical source、配置、依赖和公开契约。
---

# 编写 Plugin Registry item

只有当源码安装后应由 App 直接拥有和修改时，才使用 Registry。稳定运行时能力仍由插件公开契约提供。

## 什么时候使用

适合可编辑页面、组件、Provider、Context、hook、适配器和其他客户端源码。不适合 Server Route、Service、Job、Migration，也不适合插件必须持续维护的安全、数据和权限逻辑。

先阅读[Registry 模块选择](./registry.md)确认交付模型。

## 所有权模型

| 内容                      | 典型位置                            | 所有者 | App 是否修改 |
| ------------------------- | ----------------------------------- | ------ | ------------ |
| 插件运行时代码            | `client/**`                         | 插件   | 否           |
| Registry canonical source | `registry/<item>/**`                | 插件   | 否           |
| Registry 安装副本         | `<app>/client/extensions/<name>/**` | App    | 是           |

插件先提供可独立运行的默认行为。Registry item 通过稳定公开入口定制表现，不复制安全、数据和权限内核。

## 创建基础结构

```bash
pnpm plugin:create feature-card --with registry
```

生成器会建立插件 UI 基础配置、最小 `registry/component-ui` canonical source、`registry.config.json`、Registry metadata 和 build/materialize/prepack scripts。默认 item 不会自动改变 App 行为；不需要可编辑源码时不要选择 `registry`。

## 推荐目录

```text
app-plugin-feature-card/
├── client/                 插件 runtime 与 fallback
├── registry/
│   ├── page-ui/            可选：页面覆盖
│   ├── component-ui/       可选：直接 import 的组件
│   └── provider-ui/        可选：Provider、Context、hook
├── registry.config.json
└── public/r/               build 生成，不提交
```

## 定义 item

```json
{
  "items": [
    {
      "name": "component-ui",
      "type": "registry:component",
      "dependencies": [],
      "registryDependencies": ["button"],
      "meta": {
        "ownership": "application",
        "upgradePolicy": "three-way-merge"
      },
      "source": {
        "root": "registry/component-ui",
        "target": "client/extensions/nocobase-feature-card-component-ui",
        "include": ["."]
      }
    }
  ]
}
```

| 字段                   | 作用                                              |
| ---------------------- | ------------------------------------------------- |
| `name`                 | item 名称和构建后的 JSON 文件名                   |
| `type`                 | shadcn item 类型                                  |
| `dependencies`         | 远程安装时加入消费 App 的 npm 依赖                |
| `registryDependencies` | 远程安装时递归安装的 shadcn 或命名 Registry item  |
| `docs`                 | 给使用者和 Agent 的安装说明                       |
| `meta`                 | NocoBase metadata；当前工具不会自动执行其中的要求 |
| `source.root`          | canonical source，必须位于插件 `registry/` 下     |
| `source.target`        | 安装目录，必须位于 App `client/extensions/` 下    |
| `source.include`       | 选入的文件或目录；`.` 表示全部                    |

依赖和兼容版本需要显式维护，不能假设构建工具会从插件 `package.json` 推导全部依赖。

## 选择 item 形态

- 页面 item 可以通过精确的 `extension.ts` 和稳定 Route ID 覆盖插件 fallback 页面，不要重声明 Route；
- 组件 item 从 `index.ts` 导出，由 App 主动 import，不会自动执行；
- Provider item 导出 Provider、Context 和 hook，由 App 决定包裹范围；
- Default Template 只自动发现 `client/extensions/<name>/extension.ts`，只有需要自动 source extension 时才创建它。

Registry source 只能依赖插件稳定 public exports，不应 import 内部实现路径。

## 完成检查

- canonical source 与安装副本的所有权清楚；
- item 只交付当前工具支持的客户端源码；
- dependencies、registryDependencies 和插件要求显式记录；
- 插件不依赖 Registry item 才能提供最小运行行为；
- build 与真实消费 App 的 typecheck/build 均通过。

继续阅读[构建、发布与安装](./registry-delivery.md)和[升级与移除](./registry-upgrades.md)。完整字段和可运行示例见[Registry 深入参考](./plugin-registry-reference.md)。
