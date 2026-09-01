---
title: 插件注册
description: 根据 source workspace 或独立 App 的插件来源选择正确的注册、启用、同步和移除流程。
---

# 插件注册

本页是插件生命周期操作的入口。不要顺序执行所有命令；先确认插件来源和目标状态，再进入对应任务页。

## 什么时候阅读本页

- 新插件需要接入目标 App；
- 插件已经安装，但 Client、Server 或 Skills 状态不符合预期；
- 需要升级、禁用、解除注册或删除插件；
- 需要区分“包已安装”“插件已登记”和“运行时已启用”。

只想声明插件能力时，阅读[插件声明](./plugin-declaration.md)。需要验证实现行为时，阅读[测试与验证](./testing.md)。

## 先确认运行环境

| 环境             | 插件来源                                 | 依赖范围         | 继续阅读                                                    |
| ---------------- | ---------------------------------------- | ---------------- | ----------------------------------------------------------- |
| Source workspace | 当前仓库 `packages/plugins/app-plugin-*` | `workspace:^`    | [Source workspace 注册](./plugin-registration-workspace.md) |
| 独立 App         | package registry 中已经发布的插件包      | 实际安装版本范围 | [独立 App 安装与升级](./plugin-registration-installed.md)   |
| 移除插件         | 任一环境                                 | 取决于来源       | [解除注册与删除](./plugin-removal.md)                       |

第一版 `plugin:create` 只在 NocoBase source workspace 中创建插件。不要在独立 App 中运行它来创建本地插件。

## 注册不是一个布尔状态

Agent 必须根据任务检查相关状态面，不能只根据命令退出码或 `enabled` 判断插件已经正确运行。

| 状态面        | 位置                                  | 作用                                      |
| ------------- | ------------------------------------- | ----------------------------------------- |
| 包已安装      | `dependencies` 或 `devDependencies`   | App 可以解析插件包                        |
| 插件已登记    | `package.json#nocobase.plugins`       | CLI、构建、监听和 Skills 管理 metadata    |
| Client 已启用 | `client/plugins.ts`                   | Browser runtime 加载 Client contributions |
| Server 已启用 | `server/plugins.ts`                   | Server runtime 加载 Server contributions  |
| Skills 已同步 | `.agents/skills/`（本地生成，不提交） | App Agent 可以发现插件能力和集成指南      |

Client 和 Server 是否注册由包的公开 exports 分别决定：

- `exports["./client"]` 存在时注册 Client factory；
- `exports["./server"]` 存在时注册 Server definition；
- `package.json#nocobase.plugins` 是管理 metadata，不是运行时发现机制。

## 选择任务

| 目标                                 | 操作                                                     |
| ------------------------------------ | -------------------------------------------------------- |
| 把 workspace 插件接入一个 App        | `plugin:register <name> --app <app>`                     |
| 预览 workspace 注册，不写文件        | 增加 `--dry-run --json`                                  |
| 安装已发布插件到独立 App             | 在 App 根目录运行 `plugin:register <name>`               |
| 安装但暂不加入 Client/Server runtime | 增加 `--disabled`                                        |
| 插件能力变化后重新同步 Skills        | `plugin:skills:sync`                                     |
| 升级独立 App 中已经登记的插件        | `plugin:update`                                          |
| 清理 App 中的插件接线                | `plugin:unregister`                                      |
| 删除 source workspace 中的插件源码   | 先解除所有引用，再显式运行 `plugin:remove`               |
| 注册状态与预期不一致                 | 按需运行 `plugin:inspect <name> --json` 查看静态状态快照 |

## JSON 命令结果

自动化调用生命周期命令时优先使用 `--json`：

1. 先读取 `ok`；
2. 再根据 `status` 区分 `success`、`success-noop`、`partial-success` 和 `requires-installation`；
3. 失败时读取 `error.code` 和 `error.suggestions`，并保留非零退出码语义；
4. 不要从人类可读文案推断状态。

`plugin:inspect` 只读取静态登记与 composition 信息。它不修复状态，也不验证 Route 安全、Provider 生命周期、Client 页面、翻译、测试或构建。

## 完成条件

注册任务至少需要确认：

- 包可从目标 App 解析；
- dependency 与 `nocobase.plugins` 状态符合预期；
- Client/Server composition roots 与包 exports 和 enabled 状态一致；
- 没有重复注册；
- Plugin Skills 已按预期同步，或命令明确使用了 `--no-skills`；
- 目标 App 的相关 typecheck、test、build 和运行时行为验证通过。

## 继续阅读

- [Source workspace 注册](./plugin-registration-workspace.md)
- [独立 App 安装与升级](./plugin-registration-installed.md)
- [解除注册与删除](./plugin-removal.md)
- [Plugin Skills](./skills.md)
- [测试与验证](./testing.md)
- [深入参考](./plugin-registration-reference.md)：完整 JSON 状态、静态诊断和常见不一致，普通任务不要默认加载。
