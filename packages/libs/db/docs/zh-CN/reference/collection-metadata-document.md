---
title: Collection Metadata Document 用法
description: 定义和校验补充 Collection Metadata，并选择公开 Store、revision 和 compare-and-swap 用法。
---

# Collection Metadata Document 用法

`CollectionMetadataDocument` supplements the physical schema. Tables, columns, native types, defaults, indexes and constraints remain database-owned facts. An optional field `type` preserves explicitly declared logical semantics where the physical representation is ambiguous; it does not override incompatible storage.

| 内容                    | 用途                                                                   |
| ----------------------- | ---------------------------------------------------------------------- |
| `version`               | 选择文档格式；当前只接受版本 1                                         |
| `name`                  | 标识逻辑 Collection                                                    |
| `naming`                | 补充 Collection 级命名覆盖                                             |
| `title` / `description` | 描述 Collection 的应用语义                                             |
| `fields`                | Supplemental logical type, title and description by logical field name |
| `relations`             | 按逻辑名称声明 relation 及其应用信息                                   |

Relation 支持的类型和引用属性以 `RelationMetadata` 声明为准。不要在文档里复制物理 Schema 或自定义物理名称。

## Supplemental logical types

`FieldMetadata.type` accepts only `boolean`, `json`, `date`, and `time`.

| Logical type | Compatible inspected storage                                          |
| ------------ | --------------------------------------------------------------------- |
| `boolean`    | Boolean, integer, or decimal with scale zero                          |
| `json`       | JSON, text, or string                                                 |
| `date`       | Date, or datetime whose native type is Oracle `DATE`                  |
| `time`       | Time, or string with a declared capacity of at least eight characters |

Builder persists these explicit declarations on create/add/alter and removes them when a field changes to another type or is dropped. For example, `c.boolean('enabled')` retains its meaning on MySQL; an external `TINYINT(1)` without metadata remains an integer. Oracle time fields created by Builder use `VARCHAR2(16)` because Oracle has no standalone SQL `TIME` type.

```ts
const metadata = defineCollectionMetadata({
  version: 1,
  name: 'events',
  fields: {
    enabled: { type: 'boolean' },
    payload: { type: 'json' },
    day: { type: 'date' },
    startsAt: { type: 'time' },
  },
});
```

The document validator checks the allowed type names. Collection resolution additionally checks compatibility with inspected columns and reports `COLLECTION_SCHEMA_DRIFT` for incompatible storage. Metadata does not validate existing row contents, create physical check constraints, or define a new BigInt/Decimal transport policy. Callers must ensure external column data satisfies the declared logical semantics.

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
      targetKey: 'customerNo',
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

业务代码可以显式选择：

- `InMemoryCollectionMetadataStore`：用于测试或显式临时场景；
- `ModuleCollectionMetadataStore`：加载已导入的 TypeScript 文档数组，只读，使用规范内容的 SHA-256 revision；

Managed Connection 未显式配置 Store 时，会自动使用内部数据库 Store；事务覆盖层也由 Connection 生命周期管理。它们不是需要业务代码直接构造的公开入口。

Module Store 的 `put()` 和 `delete()` 固定抛出 `METADATA_STORE_READ_ONLY`。当前不提供可写 JSON/YAML File Store，不能把 Module Store 当作运行时文件编辑器。

Store 的 `capabilities.writable` 只表示补充 Metadata 文档是否支持写入。它与业务记录的写权限无关，
也不取代 `schemaManagement` 对 DDL 和 Migration 的控制。

维护底层实现时再阅读 [Metadata Store 后端实现](../internals/metadata/store-backends.md)。

旧完整 Collection 定义的显式迁移工具见[旧 Collection 定义转换](./legacy-collection-metadata-extraction.md)。
