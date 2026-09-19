---
title: 历史归档
description: 收录已被当前实现或文档取代的 DB 历史资料；这些内容不是当前 API 合同，不应用于生成生产代码。
---

# 历史归档

本目录保存已经被当前实现或文档取代、但仍具有设计追溯价值的资料。

归档内容不是当前 API 合同。Agent 不得依据归档内容生成生产代码，其中的接口、示例和命令也不保证能在当前版本编译或运行。每篇归档文档都应明确链接到替代它的当前文档。

- 当前公开 API 和任务指南位于本目录之外的正式主题目录。
- 当前实现原理位于 [`internals/`](../internals/README.md)。
- 尚未落地的活跃设计位于 [`proposals/`](../proposals/README.md)。

## 归档内容

- [Collection 确定性物理命名设计历史](./design-history/deterministic-collection-naming.md)：当前契约见[命名概念](../concepts/naming/overview.md)、[Builder 命名与跨数据库兼容](../builder/portability.md)和 [Query 命名](../query/naming.md)。
- [v2 到 v3 的数据源模型变化](./version-history/v2-v3-data-source-model.md)：当前契约见 [Collection 概念](../concepts/collection.md)、[QueryAdapter](../query/overview.md)和 [Resolved Collections](../collections/overview.md)。
