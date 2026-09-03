---
title: 旧 Collection 定义转换
description: 使用 extractLegacyCollectionMetadata 将旧完整 CollectionDefinition 显式转换为当前补充 Metadata Document，并处理转换诊断。
---

# 旧 Collection 定义转换

`extractLegacyCollectionMetadata()` 是迁移旧完整 Collection 定义的专用纯函数。它仍是公开 API，但不用于普通应用代码，也不是 Collection Resolver 的运行时 fallback。

新代码应直接使用 [`defineCollectionMetadata()`](./collection-metadata-document.md)。只有明确转换旧定义时才使用本页 API。

## 调用方式

```ts
import { extractLegacyCollectionMetadata } from '@nocobase/db';

const result = extractLegacyCollectionMetadata(legacyDefinition, {
  naming: connectionNaming,
});

for (const diagnostic of result.diagnostics) {
  console.log(diagnostic.severity, diagnostic.code, diagnostic.path);
}

if (result.document) {
  // The document is structurally valid and can enter an explicit migration flow.
}
```

`options.naming` 是旧定义所处 Connection 的基础命名配置，用于判断显式 `tableName` 或 `columnName` 是否能由当前确定性命名规则表示。

## 提取范围

函数只按允许列表提取：

- Collection 的 `name`、`naming`、`title`、`description`；
- 普通字段的 `title` 和 `description`；
- `belongsTo`、`hasOne`、`hasMany`、`belongsToMany` relation 的当前可表示属性。

表、列、类型、默认值、索引和约束属于物理 Schema，不会复制到 Metadata Document。旧应用层属性也不会重新加入当前文档模型。

## 结果与诊断

```ts
interface LegacyMetadataExtractionResult {
  document?: CollectionMetadataDocument;
  diagnostics: readonly LegacyMetadataExtractionDiagnostic[];
}
```

每条诊断包含：

- `severity`：`warning` 或 `error`；
- `code`：稳定的机器可读错误码；
- `path`：旧输入中的结构化路径；
- `message`：供人阅读的说明。

当前诊断码包括：

- `LEGACY_METADATA_INVALID`；
- `LEGACY_METADATA_PROPERTY_REMOVED`；
- `LEGACY_METADATA_VIRTUAL_FIELD_UNSUPPORTED`；
- `LEGACY_METADATA_PHYSICAL_MAPPING_INCOMPATIBLE`。

只要存在 `error`，结果就不包含 `document`。调用方不得忽略错误并自行拼出部分文档。

## Agent 约束

- 不要为新 Collection 生成 legacy extraction 调用。
- 不要在应用启动或每次 Collection 解析时调用它。
- 不要把 warning 自动当作成功；迁移工具应把诊断展示给维护者。
- 得到 `document` 后仍应通过显式 migration 或受控写入流程保存，而不是绕过 revision 和 Metadata Service。

## 相关文档

- [Collection Metadata Document](./collection-metadata-document.md)
- [Metadata Store 与后端](../collection-metadata/metadata-store.md)
- [Metadata Store 内部契约](../internals/metadata/store.md)
