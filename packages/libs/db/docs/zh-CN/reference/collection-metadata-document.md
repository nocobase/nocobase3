---
title: Collection Metadata Document
description: Collection Metadata V1 的公共类型、定义辅助、运行时校验和旧定义提取参考。
---

# Collection Metadata Document

`CollectionMetadataDocument` 保存物理 Schema 无法表达的补充信息。表、列、类型、默认值、索引和约束仍以数据库物理 Schema 为准，不应写入 Metadata 文档。

```ts
interface CollectionMetadataDocument {
  version: 1;
  name: string;
  naming?: {
    underscored?: boolean;
    tablePrefix?: string;
  };
  title?: string;
  description?: string;
  fields?: Record<
    string,
    {
      title?: string;
      description?: string;
    }
  >;
  relations?: Record<
    string,
    {
      type: 'belongsTo' | 'hasOne' | 'hasMany' | 'belongsToMany';
      target: string;
      sourceKey?: string;
      targetKey?: string;
      foreignKey?: string;
      otherKey?: string;
      through?: string;
      title?: string;
      description?: string;
    }
  >;
}
```

## 定义辅助

`defineCollectionMetadata()` 只提供 TypeScript 类型检查并原样返回输入。它不执行运行时校验，也不访问数据库或 Metadata Store。

```ts
import { defineCollectionMetadata } from '@nocobase/db';

const metadata = defineCollectionMetadata({
  version: 1,
  name: 'orders',
  title: 'Orders',
  fields: {
    amount: { title: 'Amount' },
  },
  relations: {
    customer: {
      type: 'belongsTo',
      target: 'customers',
      foreignKey: 'customerId',
    },
  },
});
```

## 运行时校验

对文件、HTTP 请求或持久化存储中的未知输入，应调用 `validateCollectionMetadataDocument(input)`。校验器只接受 `version: 1`，拒绝未知属性、`null`、非法名称、无效 relation 和 field/relation 重名，并返回与输入不共享嵌套对象的规范化副本。

校验失败时抛出 `CollectionMetadataValidationError`：

```ts
import {
  CollectionMetadataValidationError,
  validateCollectionMetadataDocument,
} from '@nocobase/db';

try {
  const metadata = validateCollectionMetadataDocument(input);
} catch (error) {
  if (error instanceof CollectionMetadataValidationError) {
    for (const issue of error.issues) {
      console.error(issue.code, issue.path, issue.message);
    }
  }
}
```

错误对象的顶层 `code` 固定为 `COLLECTION_METADATA_INVALID`。每个 issue 都包含稳定的 `code`、结构化 `path` 和供人阅读的 `message`。

## 从旧定义提取

`extractLegacyCollectionMetadata(input, options?)` 是纯转换函数。它只按允许列表提取 Collection 的 `name`、`naming`、`title`、`description`，普通字段的 `title`、`description`，以及 relation 定义；它不访问 Inspector，也不检查物理字段是否真实存在。

```ts
import { extractLegacyCollectionMetadata } from '@nocobase/db';

const result = extractLegacyCollectionMetadata(legacyDefinition, {
  naming: connectionNaming,
});

if (result.document) {
  // The document is structurally valid and can enter the migration flow.
}

for (const diagnostic of result.diagnostics) {
  console.log(diagnostic.severity, diagnostic.code, diagnostic.path);
}
```

可安全丢弃的物理属性不会产生诊断；已移除的应用语义会产生 warning；虚拟字段、无效 relation、重复名称和不兼容的显式物理名称会产生阻断 error。只要存在 error，结果就不包含 `document`。

完整的存储边界、校验规则和 legacy extraction 允许列表见 [Metadata Store](../collection/metadata-store.md)。
