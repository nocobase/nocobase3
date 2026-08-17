# Collection

Collection 是应用层数据模型抽象，不是数据库表的简单别名。它可以映射到数据库表、普通视图或物化视图，也可以包含仅应用层使用的元信息。

## Collection 和数据库对象

```ts
await builder.createCollection('auditLogs', {
  tableName: 'audit_logs',
  fields: [
    {
      name: 'eventName',
      type: 'string',
      columnName: 'event_name',
    },
  ],
});
```

这个定义中：

- `auditLogs` 是 Collection 名称。
- `audit_logs` 是数据库物理表名。
- `eventName` 是应用层字段名。
- `event_name` 是数据库物理列名。

如果没有显式设置 `tableName` 或 `columnName`，命名策略会推导物理名。默认策略会把 camelCase 转成 snake_case。

更完整的优先级：

1. 显式 `tableName`、`columnName`。
2. Collection 级 `naming`。
3. connection 级 `naming`。
4. 默认命名策略。

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
  indexes: [
    { fields: ['amount'] },
  ],
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

详细设计见 [Repository 概览](../repository/overview.md) 和 [Filter Builder](../repository/filter-builder.md)。

## Agent 注意事项

- 不要把 Collection 直接等同于数据库 table。
- 不要把 field 直接等同于数据库 column。
- 需要改变数据库结构时使用 Builder schema API。
- 只补充应用元信息时使用 metadata-only API。
- 已有数据库生成 Collection 属于 Generator 场景，当前原型还没有实现。
- `db.query()` 工作在物理数据库名层，不等同于 Collection Repository。
