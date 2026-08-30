---
title: Plugin Registry
description: 在 NocoBase v3 插件中发布可 materialize 的客户端源码配方，并明确 canonical source、App 安装副本、runtime contribution 和升级所有权。
---

# Plugin Registry

Registry 用于插件发布“可复制、可编辑的客户端源码配方”。插件维护 `registry/<item>` canonical source；materialize 到 `<app>/client/extensions/<name>` 后，安装副本归 App 所有。它不是 Client runtime contribution，也不会自动注册或启用插件。

## 先选择交付模型

| 目标                                        | 使用                                  |
| ------------------------------------------- | ------------------------------------- |
| 插件升级时统一更新、App 不直接修改          | 插件 runtime Component/Route/Provider |
| App 或其他插件稳定 import、实现仍由插件维护 | package public export                 |
| 安装后 App 要直接修改源码                   | Registry item                         |

Registry 当前工具范围是插件 `registry/` 到 App `client/extensions/` 的客户端源码。不要宣称它能 materialize Server Routes、Migration、ACL 或数据库配置。

## 所有权边界

```text
plugin/client/**                 插件 runtime，插件拥有
plugin/registry/<item>/**        canonical recipe，插件拥有
app/client/extensions/<name>/** installed copy，App 拥有
```

插件必须有独立可运行的默认能力；Registry 不应成为安全协议、Server API 或唯一 fallback 的副本。安装代码只通过插件稳定公开入口调用 runtime 能力，不 import 插件内部文件。

## 定义 item

`registry.config.json` 声明 item 类型、依赖、源目录、目标目录和 ownership：

```json
{
  "name": "nocobase-audit-log",
  "items": [
    {
      "name": "component-ui",
      "type": "registry:component",
      "title": "Audit log component",
      "registryDependencies": ["button"],
      "meta": {
        "ownership": "application",
        "upgradePolicy": "three-way-merge"
      },
      "source": {
        "root": "registry/component-ui",
        "target": "client/extensions/nocobase-audit-log-component-ui",
        "include": ["."]
      }
    }
  ]
}
```

Item 按实际 API 组织：页面可以带 `extension.ts` 自动提供 route component override；普通组件通过 `index.ts` 供 App import；Provider item 由 App 决定包裹范围。只有需要自动加入 App source extension 时才创建 `extension.ts`。

每个 item README 说明入口、前置插件、App 可修改范围和升级策略。相对 import 留在 item 内；插件依赖使用正式 public export；App 的基础 UI 可以通过 `registryDependencies` 和 `@/` alias 接入。

## Materialize、build 和升级

Source workspace 可以直接 materialize：

```bash
pnpm registry materialize \
  --package packages/app-plugin-audit-log \
  --item component-ui \
  --output-root packages/app-template-default
```

发布流程使用 `registry build` 生成可分发 JSON。确保 `package.json#files`、`nocobase.registry.items`、`registry.config.json` 和实际源码一致。

升级插件不会自动覆盖 App 已修改的安装副本。当前 `upgradePolicy: three-way-merge` 是所有权约定，不代表工具已自动完成三方合并；Agent 应比较上游变化并由 App 明确合并。

## 测试和 Plugin Skill

- contract test 验证 config、item root、入口和 public imports；
- build 验证生成 Registry JSON；
- materialize 到临时或目标 App，验证目标文件和 imports；
- App typecheck、test 和 build 验证安装后的源码；
- 自动 extension 要验证真实 route override/Provider composition；
- Plugin Skill 明确 item、安装目标、所有权、前置插件和升级方式。

不要把 `<app>/.agents/skills` 或 materialized App 源码当作插件 canonical source。更完整的工具、发布、安装和升级参考见 [Plugin Registry 完整开发与发布](./plugin-registry.md)。

返回[插件开发目录](./README.md)，或继续编写[Plugin Skills](./skills.md)。
