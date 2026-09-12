---
title: connection.collectionMetadata：读取和更新补充 Metadata
description: 使用 CollectionMetadataService 更新 Collection、Field 和 Relation Metadata，并处理 revision、冲突和缓存失效。
---

# `connection.collectionMetadata`：读取和更新补充 Metadata

`connection.collectionMetadata` 是运行时 Metadata 服务。它在 Store 之上执行 patch、文档校验、compare-and-swap 和 Collection 缓存失效。

## 使用边界

| 项目            | 内容                                      |
| --------------- | ----------------------------------------- |
| 获取方式        | `db.connection(name?).collectionMetadata` |
| 输入名称        | Collection/Field 逻辑名称                 |
| 修改物理 Schema | 否                                        |
| 并发控制        | `expectedRevision`                        |
| 可写性          | 取决于 Store 的 `capabilities.writable`   |
| 缓存            | 成功更新后失效相关 Collections            |

## API 分组

| API                                                 | 用途                                      |
| --------------------------------------------------- | ----------------------------------------- |
| `capabilities`                                      | 读取 Store 可写性和并发能力               |
| `get(name)`                                         | 读取文档及 revision                       |
| `replaceDocument(document, options?)`               | 替换规范化完整文档                        |
| `removeDocument(name, options?)`                    | 删除一个文档                              |
| `updateCollection(name, patch, options?)`           | 更新 naming、title、description           |
| `updateField(collection, field, patch, options?)`   | Patch logical type, title and description |
| `removeField(collection, field, options?)`          | 删除同名 Field/Relation Metadata          |
| `setRelation(collection, name, relation, options?)` | 新增或替换 relation                       |
| `removeRelation(collection, name, options?)`        | 删除 relation                             |

## 带 revision 更新

```ts
const service = db.connection().collectionMetadata;
const current = await service.get('orders');

if (current) {
  await service.updateCollection(
    'orders',
    { title: 'Orders' },
    { expectedRevision: current.revision },
  );
}
```

如果另一个写入者已经更新文档，revision 不匹配会抛出 `METADATA_CONFLICT`。重新读取并基于新文档决定是否重试，不要盲目覆盖。

## 与 Builder 的边界

Supplemental types can also be patched without DDL:

```ts
await connection.collectionMetadata.updateField('events', 'enabled', {
  type: 'boolean',
});

// Remove the supplement and return to the inspected physical type.
await connection.collectionMetadata.updateField('events', 'enabled', {
  type: null,
});
```

An omitted `type` preserves the existing supplement. The service checks physical compatibility before persisting a patch; an incompatible type does not replace the stored document. See [the logical type matrix](../reference/collection-metadata-document.md#supplemental-logical-types).

- 只更新 title、description 或应用 relation：使用 Metadata Service。
- 创建、重命名或删除物理 Collection/Field：使用 Builder，业务演进放在 Migration。
- Collection rename 不是 Metadata-only 操作；使用 `builder.renameCollection()`。
- Metadata 写入成功后，后续 `connection.collections.get()` 会重新解析受影响 Collection。

详细方法和一致性设计见[Metadata Service 内部实现](../internals/metadata/service.md)。
