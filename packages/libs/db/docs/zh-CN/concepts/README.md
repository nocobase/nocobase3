---
title: 核心概念
description: 建立 @nocobase/db 的 Collection、Metadata 和命名心智模型，并把具体编码任务路由到当前公开 API 文档。
---

# 核心概念

本目录只解释当前版本中跨 API 共享的稳定概念。具体用法和可运行示例以对应主题文档与[公开 API 导航](../reference/api-index.md)为准，精确接口以 TypeScript 类型声明为准。

## 阅读路径

1. [Collection](./collection.md)：理解应用模型、物理 Schema 和记录查询的边界。
2. [Metadata](./metadata.md)：理解补充 Metadata 如何与物理 Schema 合并。
3. [命名](./naming/overview.md)：理解逻辑名称、查询标识符和物理名称。

命名的两个具体配置：

- [`underscored`](./naming/underscored.md)：camelCase 与 snake_case 的确定性转换。
- [`tablePrefix`](./naming/table-prefix.md)：Connection 默认前缀和 Collection 覆盖。

## 从概念进入任务

| 任务                | 下一篇                                                    |
| ------------------- | --------------------------------------------------------- |
| 创建或修改 Schema   | [Builder 概览](../builder/overview.md)                    |
| 查询或修改记录      | [Query 概览](../query/overview.md)                        |
| 读取完整 Collection | [Collections](../collections/overview.md)                 |
| 读取物理数据库结构  | [Schema Inspector](../schema-inspector/overview.md)       |
| 更新补充 Metadata   | [Collection Metadata](../collection-metadata/overview.md) |
| 编写数据库升级      | [Migration](../migration/overview.md)                     |

## 使用边界

- 本目录描述概念，不替代 TypeScript 类型和 API 参考。
- 内部组件和实现算法位于 [`internals/`](../internals/README.md)。
- 未实现 API 位于 [`proposals/`](../proposals/README.md)，不得用于生成生产代码。
- 历史材料位于 [`archive/`](../archive/README.md)，不是当前 API 合同。
