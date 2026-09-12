---
title: Schema Inspector 内部架构
description: 说明 SchemaInspector 的当前职责、公共读取接口、方言适配层，以及它与 Connection、Resolver 和 Schema Builder 的边界。
---

# Schema Inspector 内部架构

`SchemaInspector` 是 Connection 级只读物理结构接口。它读取数据库事实并转换为统一模型，不执行 DDL，也不补充 Collection Metadata。

```text
Database catalog
  -> dialect SchemaInspector
  -> PhysicalCollectionSchema
  -> CollectionResolver
  -> CollectionDefinition
```

当前实现支持 SQLite、PostgreSQL、MySQL、Oracle 和 SQL Server。

## 职责边界

Schema Inspector 负责：

- 列出可读取的 schema；
- 按物理名称读取一张 table、view 或 materialized view；
- 分页列出物理对象摘要；
- 分页扫描完整物理结构；
- 报告每类信息的 `complete`、`partial` 或 `unsupported` 状态；
- 把方言错误转换为稳定的 `SchemaInspectorError`。

它不负责：

- 创建、修改或删除数据库对象；
- 应用 `underscored` 或移除 `tablePrefix`；
- 读取、写入或合并 Metadata Document；
- 缓存 resolved Collection；
- 推断数据库没有提供证据的应用语义。

普通业务代码通常使用 `connection.collections`。只有外部数据库接入、物理结构审计和 Resolver 等底层场景才直接使用 `connection.schemaInspector`。

## Connection 与方言

每个 `DatabaseConnection` 根据 dialect adapter 创建一个 Inspector：

```ts
interface DatabaseDialectAdapter<TClient, TConfig> {
  readonly dialect: DatabaseDialect;
  createSchemaInspector(
    context: SchemaInspectorFactoryContext<TClient, TConfig>,
  ): SchemaInspector;
}
```

Context 提供 Connection 名、只读配置和惰性 client resolver。事务 Connection 使用事务 client，不创建额外连接池。

通用参数校验、分页和 cursor 在 `BaseSchemaInspector` 中实现；方言类负责目录 SQL、默认值解析、类型归一化、约束和索引转换。

## 公共接口

```ts
interface SchemaInspector {
  listSchemas(): Promise<PhysicalSchemaInfo[]>;
  getPhysicalCollection(
    identifier: PhysicalCollectionIdentifier,
  ): Promise<PhysicalCollectionSchema | undefined>;
  listPhysicalCollections(
    options?: ListPhysicalCollectionsOptions,
  ): Promise<PhysicalCollectionPage>;
  scanPhysicalCollections(
    options?: ScanPhysicalCollectionsOptions,
  ): AsyncIterable<PhysicalCollectionSchema>;
}
```

所有输入和输出使用物理名称。详细模型见[物理 Schema 模型](./physical-schema-model.md)，分页、完整性和错误语义见[分页、完整性与错误](./pagination-and-errors.md)。

## 读取路径

### 单个物理对象

`getPhysicalCollection({ schema?, tableName })` 的查询必须限定到一个物理对象。对象不存在时返回 `undefined`；参数无效、schema 不可访问或目录查询失败时抛错。

### 轻量列表

`listPhysicalCollections()` 只读取 `schema`、`tableName`、`kind` 和可用 comment，不连接所有列、索引和约束目录。过滤条件包括：

- `schemas`；
- `tableNamePrefixes`；
- `kinds`；
- `limit` 和 `cursor`。

### 完整扫描

`scanPhysicalCollections()` 先分页列出摘要，再逐项调用 `getPhysicalCollection()`。它以 `AsyncIterable` 产出结果，避免一次加载整个数据库。

## 方言适配原则

方言实现共享统一输出类型，但不共享会丢失语义的 SQL 或解析逻辑：

- 复合 key 和 index 必须保留数据库顺序；
- unique constraint 与普通 unique index 必须区分；
- 表达式、predicate、include column 和 deferrable 仅在数据库提供证据时填充；
- 未知原生类型保留 `nativeType`，不能随意猜成应用类型；
- 读取不到的信息通过 inspection status 和 warning 表达，不能用空数组冒充“确定不存在”。

各数据库的当前范围见[方言行为](./dialects.md)。

## 命名边界

Inspector 不处理逻辑命名：

```text
SchemaInspector:       tbl_order_items.order_no
Naming + Metadata:     orderItems.orderNo
CollectionResolver:    CollectionDefinition
```

`tableNamePrefixes` 只是物理列表过滤器，返回值仍保留完整前缀。`underscored` 不影响 Inspector；物理列 `created_at` 始终以 `created_at` 返回。

## 与其他组件的关系

- Builder 通过 Schema Adapter 执行结构变更，不通过 Inspector 写入；
- Collection Registry 使用 Inspector 读取物理结构，并过滤自己的 Metadata 内部表；
- Resolver 要求 columns 完整，其他不完整 aspect 转换为 resolution warning；
- Migration 测试可以直接使用 Inspector 验证真实升级结果。

## 相关文档

- [物理 Schema 模型](./physical-schema-model.md)
- [方言行为](./dialects.md)
- [分页、完整性与错误](./pagination-and-errors.md)
- [Schema Inspector 示例](../../schema-inspector/examples.md)
- [Collection Resolver](../collection/resolver.md)
