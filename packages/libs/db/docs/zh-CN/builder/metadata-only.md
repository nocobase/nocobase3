---
title: Metadata-only 更新
description: 兼容入口；纯 Metadata 更新使用 connection.collectionMetadata，不属于 Builder API。
---

# Metadata-only 更新

纯 Metadata 更新不属于 Builder API。请阅读 [`connection.collectionMetadata`](../collection-metadata/collection-metadata-service.md)。

选择规则：

- 只更新 Collection/Field 的 title、description 或应用 relation：使用 `connection.collectionMetadata`。
- 创建、修改、重命名或删除物理 Schema：使用 Builder；业务演进放在 Migration。
- `renameCollection()` 同时影响物理对象和 Metadata，不是 Metadata-only 操作。
