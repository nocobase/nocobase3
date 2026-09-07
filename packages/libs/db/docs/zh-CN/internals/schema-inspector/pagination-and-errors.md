---
title: Schema Inspector 分页、完整性与错误
description: 说明物理对象列表的过滤和 cursor 协议、扫描行为、inspection status，以及 SchemaInspectorError 的稳定语义。
---

# Schema Inspector 分页、完整性与错误

## 分页与过滤

```ts
interface ListPhysicalCollectionsOptions {
  limit?: number;
  cursor?: string;
  schemas?: readonly string[];
  tableNamePrefixes?: readonly string[];
  kinds?: readonly PhysicalCollectionKind[];
}
```

默认 limit 为 100，允许范围是 1 到 1000。数组过滤条件会去重并排序；显式空数组返回空页。

结果按 `schema`、`tableName` 稳定排序。`nextCursor` 是带版本和当前过滤条件的 base64url 不透明值。调用方必须原样传回，不得解析或修改。

cursor 与当前 `schemas`、`tableNamePrefixes` 或 `kinds` 不匹配时抛出 `SCHEMA_INSPECTION_INVALID_CURSOR`，不会继续翻页得到混合结果。

## 扫描

`scanPhysicalCollections({ pageSize, ...filters })` 使用相同过滤语义。它逐页读取摘要，再逐个读取完整对象；扫描期间被删除的对象会被跳过。

数据库 Schema 可以在扫描期间变化。Inspector 不承诺跨多个查询的数据库快照；要求强一致性的调用方必须在自身事务或数据库能力允许的隔离机制中执行。

## 完整性状态

| 状态          | 含义                                     |
| ------------- | ---------------------------------------- |
| `complete`    | Inspector 已完整读取该方言声明支持的信息 |
| `partial`     | 返回了已确认的信息，但仍可能遗漏内容     |
| `unsupported` | 当前数据库或实现不能读取该类信息         |

调用方不得只判断数组是否为空。比如 `checkConstraints: []` 与 aspect 为 `unsupported` 只表示“没有读取结果”，不能证明数据库没有 check constraint。

Resolver 要求 columns 为 `complete`。其他 aspect 不完整时可以解析 Collection，但会产生结构化 warning。

## 错误类型

```ts
type SchemaInspectorErrorCode =
  | 'SCHEMA_INSPECTION_FAILED'
  | 'SCHEMA_INSPECTION_PERMISSION_DENIED'
  | 'SCHEMA_INSPECTION_INVALID_CURSOR'
  | 'SCHEMA_INSPECTION_INVALID_OPTIONS'
  | 'SCHEMA_INSPECTION_UNSUPPORTED_DIALECT';
```

`SchemaInspectorError` 还包含：

- `connectionName`；
- `dialect`；
- 可选 `schema` 和 `tableName`；
- 原始 `cause`。

错误不得包含密码、连接串或其他凭据。

## 不存在、无权限和失败

- 明确物理对象不存在：`getPhysicalCollection()` 返回 `undefined`；
- 参数格式错误、limit 越界或 filter kind 无效：`SCHEMA_INSPECTION_INVALID_OPTIONS`；
- cursor 无效或与过滤器不匹配：`SCHEMA_INSPECTION_INVALID_CURSOR`；
- schema 不存在或不可读取：抛出错误，不返回空页掩盖问题；
- 系统目录查询失败：抛出检查失败或权限错误，不转换成“没有对象”。

SQL Server 系统目录遇到瞬时 deadlock 时实现可以执行有限重试；其他错误必须继续抛出。

## Agent 约束

- 物理对象输入必须使用 `tableName`，不要传逻辑 Collection 名。
- 分页时保持过滤条件不变，并原样传递 cursor。
- 结构审计必须同时读取 `inspection.aspects` 和 `inspection.warnings`。
- 不要把 partial 或 unsupported 结果写成确定性 migration。
- 不要通过 Inspector 修改数据库；DDL 使用 Builder，并写入 migration。

## 相关文档

- [Schema Inspector 内部架构](./architecture.md)
- [物理 Schema 模型](./physical-schema-model.md)
- [Schema Inspector 示例](../../schema-inspector/examples.md)
