---
title: Collection Metadata Document
description: Collection Metadata Document 的公共类型、defineCollectionMetadata 辅助、严格运行时校验和 Store 合同参考。
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

## Metadata Store

`CollectionMetadataStore` 只保存补充文档，不保存完整
`CollectionDefinition`，所有写入都要求 compare-and-swap：

```ts
import { InMemoryCollectionMetadataStore } from '@nocobase/db';

const store = new InMemoryCollectionMetadataStore();
await store.initialize();

const created = await store.put(metadata, {
  expectedRevision: null,
});

const updated = await store.put(nextMetadata, {
  expectedRevision: created.revision,
});

await store.delete(updated.document.name, {
  expectedRevision: updated.revision,
});
```

`expectedRevision: null` 只允许创建不存在的文档；更新和删除必须传入当前 revision。版本不一致抛出
`CollectionMetadataConflictError`，其稳定 code 为 `METADATA_CONFLICT`。

`list({ limit, cursor })` 按 Collection 名称稳定分页，只返回 revision、naming、title 和 description 等轻量
摘要。默认 limit 为 100，最大为 1000。

已实现的后端包括：

- `InMemoryCollectionMetadataStore`：用于测试或显式临时场景；
- `DatabaseCollectionMetadataStore`：通过自包含内部表持久化文档，使用递增数字 revision 和数据库 CAS；
- `ModuleCollectionMetadataStore`：加载已导入的 TypeScript 文档数组，只读，使用规范内容的 SHA-256 revision；
- `TransactionCollectionMetadataStore`：事务中的隔离覆盖层，提交后向基础 Store 执行 CAS 回放；

Module Store 的 `put()` 和 `delete()` 固定抛出 `METADATA_STORE_READ_ONLY`。当前不提供可写 JSON/YAML File Store，不能把 Module Store 当作运行时文件编辑器。

Store 的 `capabilities.writable` 只表示补充 Metadata 文档是否支持写入。它与业务记录的写权限无关，
也不取代 `schemaManagement` 对 DDL 和 Migration 的控制。

各后端的构造方式和持久化边界见 [Metadata Store 后端实现](../internals/metadata/store-backends.md)。

旧完整 Collection 定义的显式迁移工具见[旧 Collection 定义转换](./legacy-collection-metadata-extraction.md)。
