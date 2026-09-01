# Collection

Collection 是应用层数据模型抽象，不是数据库表的简单别名。它可以映射到数据库表、普通视图或物化视图，也可以包含仅应用层使用的元信息。

## Collection 和数据库对象

```ts
await builder.createCollection('auditLogs', {
  fields: [
    {
      name: 'eventName',
      type: 'string',
    },
  ],
});
```

这个定义中：

- `auditLogs` 是 Collection 名称。
- `audit_logs` 是确定性生成的数据库物理表名。
- `eventName` 是应用层字段名。
- `event_name` 是确定性生成的数据库物理列名。

Builder 默认把 camelCase 逻辑名转换为 snake_case；`underscored: false` 时保留原名。Collection DSL 不支持任意 `tableName` 或 `columnName` 映射。

表前缀的优先级：

1. Collection 级 `naming.tablePrefix`。
2. Connection 级 `naming.tablePrefix`。
3. 默认空前缀。

详见 [命名概念](./naming.md) 和 [Builder 命名映射](../builder/naming.md)。

## CollectionDefinition

常见结构：

```ts
const collection = {
  title: 'Orders',
  description: 'Customer purchase orders.',
  fields: [
    { name: 'id', type: 'increments', primaryKey: true },
    { name: 'amount', type: 'decimal', precision: 12, scale: 2 },
  ],
  indexes: [{ fields: ['amount'] }],
  constraints: [
    { type: 'unique', fields: ['amount'], name: 'uk_orders_amount' },
  ],
};
```

## 应用层元信息

`title` 和 `description` 属于应用层元信息，适合 UI、Agent、表单、区块和数据建模解释使用。它们不等同于数据库 comment。

数据库层 comment 应写在：

```ts
{
  name: 'amount',
  type: 'decimal',
  db: {
    comment: 'Total amount before refunds',
  },
}
```

## 和 Repository 的关系

未来 Repository 会读取 Collection metadata，并用 Filter Builder / Filter AST 表达应用层筛选条件。字段类型、关系类型、命名策略和应用层元信息都会影响 Repository filter 的校验和编译。

详细设计见 [Repository 概览](../repository/overview.md) 和 [Filter Builder](../repository/filter-builder.md)。Collection 如何由物理 Schema 和补充 Metadata 解析得到，见 [Collection 架构](../collection/architecture.md)。

## Agent 注意事项

- 不要把 Collection 直接等同于数据库 table。
- Field 仍包含应用元信息，不应只理解为数据库 column；但其物理列名由逻辑字段名确定性生成。
- 需要改变数据库结构时使用 Builder schema API。
- 只补充应用元信息时使用 metadata-only API。
- 已有数据库生成 Collection 属于 Generator 场景，当前原型还没有实现。
- `db.query()` 工作在物理数据库名层，不等同于 Collection Repository。
