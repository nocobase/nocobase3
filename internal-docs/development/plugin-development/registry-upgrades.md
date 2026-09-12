---
title: Plugin Registry 升级与移除
description: 通过显式三方合并升级或移除 App-owned Registry 源码，避免覆盖 App 定制。
---

# Plugin Registry 升级与移除

安装到 `client/extensions/` 的 Registry source 归 App 所有。升级插件包不会自动覆盖它，解除插件注册也不会自动删除它。

## 升级模型

当前没有自动 Registry update 命令或安装 lockfile。升级是显式三方合并：

```text
旧版本 canonical source   merge base
App 当前安装副本          用户修改
新版本 canonical source   上游修改
```

推荐流程：

1. 升级插件依赖，但不覆盖 App 副本；
2. 获取旧版和新版 canonical source；
3. 比较上游公开 API、依赖和源码变化；
4. 以旧版为 base，把新版变化合并到 App 副本；
5. 保留 App 的品牌、字段、布局和业务定制；
6. 检查新增 dependencies、registryDependencies 和 required plugins；
7. 运行消费 App 的相关检查和行为验证。

不要使用带覆盖语义的 `shadcn add --overwrite`，除非用户明确接受丢失 App 修改。插件升级与 item 升级相互独立，但两者必须保持公开契约和版本要求兼容。

## 移除 item

1. 确认目标是 App-owned 安装副本；
2. 删除对应的 `client/extensions/<name>`；
3. 只清理经引用检查确认不再使用的依赖和 shadcn primitives；
4. 页面覆盖移除后确认插件 fallback 恢复；
5. 只有插件本身也不需要时，才另行执行 `plugin:unregister`；
6. 运行 App 的相关检查和行为验证。

当前没有 `registry remove` 或依赖引用计数，不能机械删除共享依赖。

## 当前工具边界

- 没有安装记录、版本、hash 或 lockfile；
- 没有自动 update、remove 或三方合并；
- materialize 不自动安装依赖、注册插件或强制版本要求；
- HTTP/CDN 发布由外部基础设施负责。

这些限制不改变所有权：插件维护 canonical recipe，App 维护安装副本。

## 完成检查

- App 定制未被直接覆盖；
- 合并使用明确的旧版 base 和新版 source；
- 插件公开契约和版本要求兼容；
- 依赖变更经过引用检查；
- 页面 fallback、组件 import 或 Provider 范围符合预期；
- 消费 App 的相关检查通过。

返回[Registry 模块选择](./registry.md)，或查看[Registry 深入参考](./plugin-registry-reference.md)。
