---
title: tablePrefix 表前缀
description: 说明 tablePrefix 从 Connection 配置到 Collection Builder、Query、Migration 和原始 SQL 的作用范围与使用约定。
---

# tablePrefix 表前缀

`tablePrefix` 用于给一个 Connection 管理的物理表和 View 添加统一前缀。它属于 `NamingOptions`，默认值是空字符串：

```ts
interface NamingOptions {
  underscored?: boolean;
  tablePrefix?: string;
}
```

表前缀只直接作用于物理表名、普通 View 名和物化 View 名，不直接拼到字段名或 Query alias 前。自动生成的 Index 和 Constraint 名可能包含最终物理表名，因此会间接包含前缀；显式命名的 Index 和 Constraint 不会被改写。

## 名称生成顺序

Builder 先根据 `underscored` 归一化 Collection 逻辑名，再在结果前拼接 `tablePrefix`：

```text
effectiveNaming = merge(connection.naming, collection.naming)
normalized(name) = effectiveNaming.underscored ? snakeCase(name) : name
物理表名 = effectiveNaming.tablePrefix + normalized(collectionName)
物理列名 = normalized(fieldName)
```

例如：

```ts
naming: {
  underscored: true,
  tablePrefix: 'tbl_',
}
```

对应的物理名称是：

```text
orderItems.createdAt -> tbl_order_items.created_at
```

`tablePrefix` 按原样拼接，系统不会自动追加 `_`。需要分隔符时应直接写入配置，例如使用 `tbl_`，而不是 `tbl`。

## Connection 默认前缀

通常应在 Connection 上配置统一前缀：

```ts
const db = createDatabaseManager({
  default: 'main',
  connections: {
    main: {
      dialect: 'postgres',
      host: '127.0.0.1',
      port: 15432,
      username: 'nocobase',
      password: 'nocobase',
      database: 'nocobase',
      naming: {
        underscored: true,
        tablePrefix: 'app_',
      },
    },
  },
});
```

Builder 接收逻辑 Collection 名：

```ts
await db.builder().createCollection('orderItems', (collection) => {
  collection.increments('id');
  collection.datetime('createdAt');
});
```

最终创建：

```text
app_order_items
```

不同 Connection 可以使用不同前缀，以隔离共享同一个数据库 Schema 的表：

```ts
connections: {
  main: {
    dialect: 'postgres',
    naming: { tablePrefix: 'main_' },
  },
  analytics: {
    dialect: 'postgres',
    naming: { tablePrefix: 'analytics_' },
  },
}
```

Connection 名本身不会自动成为表前缀。只有显式配置的 `naming.tablePrefix` 会参与物理名称生成。

## Collection 局部覆盖

Collection 可以覆盖 Connection 的默认前缀：

```ts
await db.builder().createCollection('auditLogs', (collection) => {
  collection.naming({ tablePrefix: 'archive_' });
  collection.increments('id');
});
```

如果 Connection 使用 `app_`，这个 Collection 的物理表仍然是：

```text
archive_audit_logs
```

使用空字符串可以显式清除继承的前缀：

```ts
collection.naming({ tablePrefix: '' });
```

Collection 仅覆盖自己明确提供的 naming 属性。例如只设置 `tablePrefix` 时，仍然继承 Connection 的 `underscored`。

跨 Collection 的 Relation、Foreign Key 和结构化 View 会分别使用各目标 Collection 的 effective naming，不会把当前 Collection 的前缀直接套到所有引用上。

## db.query() 自动添加前缀

### 输入契约

`db.query()` 中表示表来源的参数会自动应用当前 Connection 的 `tablePrefix`。API 统一接收不带前缀的 **Connection 相对表标识符**，而不是完整物理表名：

```ts
await db.query().selectFrom('orderItems as oi').selectAll().execute();
```

在 `tablePrefix: 'app_'`、`underscored: true` 时生成：

```sql
from "app_order_items" as "oi"
```

`tablePrefix` 只改变表名，不改变 `underscored` 的字段和结果 key 规则。例如：

```ts
const row = await db
  .query()
  .selectFrom('orderItems')
  .select('createdAt')
  .executeTakeFirst();
```

SQL 查询 `app_order_items.created_at`，返回结果 key 仍是 `createdAt`。如果写 `select('created_at')`，返回结果 key 仍是 `created_at`。完整规则见 [underscored 命名规则](./underscored.md)。

同一规则适用于：

- `selectFrom(table)`；
- `insertInto(table)`；
- `updateTable(table)`；
- `deleteFrom(table)`；
- `innerJoin`、`leftJoin`、`rightJoin`、`crossJoin` 的目标表；
- Expression Builder 的 `selectFrom(table)`；
- 由上述入口创建的嵌套子查询。

`selectAll('oi')` 中的 `oi` 是已有表来源的限定符，通常是 alias，不是新的表来源，因此不能添加前缀。

### Join 示例

Join 的主表和目标表都会使用当前 Connection 的命名配置，alias 只执行 identifier 归一化，不添加表前缀：

```ts
const rows = await db
  .query()
  .selectFrom('orders as orderRows')
  .leftJoin('customers as customerRows', (join) =>
    join.onRef('orderRows.customerId', '=', 'customerRows.id'),
  )
  .select(['orderRows.orderNo as orderNo', 'customerRows.name as customerName'])
  .execute();
```

在 `underscored: true`、`tablePrefix: 'app_'` 时，关键 SQL identifier 是：

```text
app_orders as order_rows
app_customers as customer_rows
order_rows.customer_id = customer_rows.id
```

不使用 alias 时，qualified reference 会解析到带前缀的物理表限定符：

```ts
db.query()
  .selectFrom('orders')
  .innerJoin('customers', 'orders.customerId', 'customers.id')
  .select(['orders.orderNo', 'customers.name']);
```

对应：

```text
app_orders.customer_id = app_customers.id
```

### 关联子查询示例

子查询维护自己的表作用域，并且可以解析外层查询的表或 alias：

```ts
const rows = await db
  .query()
  .selectFrom('orders as orderRows')
  .select('orderRows.orderNo as orderNo')
  .where(({ exists, selectFrom }) =>
    exists(
      selectFrom('payments as paymentRows')
        .selectAll('paymentRows')
        .whereRef('paymentRows.orderId', '=', 'orderRows.id'),
    ),
  )
  .execute();
```

这里会分别使用 `app_orders` 和 `app_payments`，但关联条件只引用 alias：

```text
payment_rows.order_id = order_rows.id
```

### Transaction 示例

Transaction connection 会保留原 Connection 的 `underscored` 和 `tablePrefix`：

```ts
await db.transaction(async (connection) => {
  await connection.query
    .insertInto('orderItems')
    .values({ orderNo: 'SO-001' })
    .execute();
});
```

在 `tablePrefix: 'app_'` 时，事务内仍然写入 `app_order_items`，不会退回到 `order_items`。

### Query 输入语义

所有 Query 表来源参数遵循同一个约定：

```text
输入：Connection 相对表标识符
输出：Connection tablePrefix + Connection underscored 转换后的表名
```

例如：

| Connection naming                                  | Query 输入   | 物理表名           |
| -------------------------------------------------- | ------------ | ------------------ |
| `{ underscored: true, tablePrefix: 'app_' }`       | `orderItems` | `app_order_items`  |
| `{ underscored: false, tablePrefix: 'app_' }`      | `orderItems` | `app_orderItems`   |
| `{ underscored: true, tablePrefix: '' }`           | `orderItems` | `order_items`      |
| `{ underscored: true, tablePrefix: 'analytics_' }` | `events`     | `analytics_events` |

调用方不能再把完整物理表名传给普通 Query API：

```ts
// 正确：Connection 相对表标识符
db.query().selectFrom('orderItems');

// 错误：会按相对标识符再次添加 app_
db.query().selectFrom('app_order_items');
```

不要实现“字符串已经以 `app_` 开头就不再添加”的启发式判断。逻辑表本来就可能叫 `appOrders`，这种猜测会让同一输入在不同配置下产生歧义，也会掩盖调用方误用物理表名的问题。

例如，在 `tablePrefix: 'app_'` 下把物理名称误传给普通 Query：

```ts
db.query().selectFrom('app_order_items');
```

会被确定性地解释为相对标识符，并解析成：

```text
app_app_order_items
```

需要直接访问 `app_order_items` 时必须进入物理数据库边界：

```ts
const client = await db.connection().client();
await client('app_order_items').select('*');
```

### 表名、字段和 alias 必须分开

`tablePrefix` 只能应用于表来源，不能通过通用的 identifier/reference 映射器添加。以下查询：

```ts
await db
  .query()
  .selectFrom('orderItems as oi')
  .select(['oi.orderNo', 'oi.createdAt'])
  .where('oi.createdAt', '>=', start)
  .execute();
```

在 `underscored: true`、`tablePrefix: 'app_'` 时使用：

```sql
from "app_order_items" as "oi"
where "oi"."created_at" >= ?
```

必须保持以下边界：

| 输入位置                      | 使用的转换           | 是否添加前缀 |
| ----------------------------- | -------------------- | ------------ |
| `selectFrom('orderItems')`    | 表来源转换           | 是           |
| `leftJoin('users as u', ...)` | 表来源转换           | 是           |
| `selectAll('oi')`             | reference/alias 转换 | 否           |
| `selectAll('orderItems')`     | 已注册表限定符解析   | 解析到物理表 |
| `select('oi.createdAt')`      | reference/field 转换 | 否           |
| `where('oi.createdAt', ...)`  | reference/field 转换 | 否           |
| `orderItems as oi` 中的 `oi`  | alias 转换           | 否           |

如果 alias 使用 camelCase，仍沿用 Query 当前的 identifier 归一化规则，但只执行 `underscored`，不添加前缀。例如 `as orderItems` 会变成 `as order_items`，引用 `orderItems.id` 也会变成 `order_items.id`。

无 alias 的 qualified reference 还需要解析到添加前缀后的真实限定符：

```ts
db.query().selectFrom('orderItems').select('orderItems.id');
```

会生成类似：

```sql
select "app_order_items"."id" from "app_order_items"
```

不能只把 reference 转成 `order_items.id`，否则它与 SQL 中的 `app_order_items` 不匹配。

### 实现方式

`KnexDatabaseConnection` 把 Connection naming 完整传给 Query：

```ts
new DefaultNamingStrategy({
  underscored: this.config.naming?.underscored,
  tablePrefix: this.config.naming?.tablePrefix,
});
```

表来源不能通过通用 `mapReference()` 映射，因为字段和 alias 不应添加前缀。当前实现使用表来源专用解析逻辑，同时返回后续 reference 解析所需的 qualifier 信息：

```ts
interface ResolvedTableSource {
  sql: string;
  logicalQualifier: string;
  sqlQualifier: string;
}

function resolveTableSource(
  expression: string,
  naming: NamingStrategy,
): ResolvedTableSource {
  const parsed = parseAliasedIdentifier(expression);
  const physicalTable = naming.collectionToTableName(parsed.identifier);
  const physicalAlias = parsed.alias
    ? naming.fieldToColumnName(parsed.alias)
    : undefined;

  return {
    sql: physicalAlias ? `${physicalTable} as ${physicalAlias}` : physicalTable,
    logicalQualifier: parsed.alias ?? parsed.identifier,
    sqlQualifier: physicalAlias ?? physicalTable,
  };
}
```

这里复用 `collectionToTableName()` 的确定性 Connection 命名算法，但不表示 Query 已经读取了 Collection Metadata。传入 Query 的 naming strategy 只包含 Connection 配置。

每个 Select、Subquery、Update 和 Delete 在编译时根据自己的主表与 Join 建立轻量 table scope。实现先收集主表和全部 Join，再编译 selection、condition、group、having 与 order；因此 reference 的结果不依赖链式方法的调用顺序。reference mapper 遇到 qualified reference 时，先在 scope 中解析第一段：

```text
selectFrom('orderItems')
orderItems.id -> app_order_items.id

selectFrom('orderItems as oi')
oi.id -> oi.id
```

这只是当前 Query AST 内的表来源解析，不读取 Collection Metadata，也不等同于 Repository。

所有真正引入表来源的位置统一调用 `resolveTableSource()`；selection、`selectAll(tableOrAlias)`、Where、`whereRef`、Join condition、Group、Having 和 Order 中的 qualified reference 都通过 table scope 与 field naming 解析。`selectAll(tableOrAlias)` 使用已有 scope 中的 qualifier，不会把 alias 当作新的表来源：

```ts
selectFrom('orderItems as oi').selectAll('oi');
```

它会正确编译为 `oi.*`，而不是 `app_oi.*`。

主查询和子查询分别维护自己的 local scope，Join 的目标表在同一 local scope 中注册。为了保持现有 correlated subquery 能力，子查询还应持有只读的 parent scope：qualified reference 先查子查询 local scope，再查 parent scope；同名的本地 alias 或表来源覆盖外层名称。例如：

```ts
db.query()
  .selectFrom('orders')
  .where(({ exists, selectFrom }) =>
    exists(
      selectFrom('payments')
        .select('id')
        .whereRef('payments.orderId', '=', 'orders.id'),
    ),
  );
```

应让子查询解析出 `app_payments.order_id = app_orders.id`。这个 parent scope 必须由子查询编译上下文显式传入，不能依赖通用字符串映射偶然工作。

如果未来正式支持 `schema.table`，表来源解析器只能给最后一个 table segment 添加前缀，不能把前缀添加到 schema segment。这个行为应先增加跨方言测试，再作为公开契约写入 Query API；第一版不应靠普通 dot-reference 映射偶然支持。

### Collection 局部覆盖

`db.query()` 不读取 Collection Metadata，因此只能自动使用 Connection 级 naming，不能自动解析 Collection 级 `tablePrefix`：

```ts
// Connection: tablePrefix: 'app_'
collection.naming({ tablePrefix: 'archive_' });
```

此时：

```ts
db.query().selectFrom('auditLogs');
```

只能确定性地解析为 `app_audit_logs`，无法得知目标 Collection 实际覆盖成了 `archive_audit_logs`。需要 Collection 局部 naming 的应用层 CRUD 应使用未来的 Collection-aware Repository。

必须访问这类真实物理表时，使用 `connection.client()` 这一显式底层边界并传入完整物理表名。第一版不需要给普通 Query 增加 `physicalTable()`，避免一个 API 同时接受两套表名语义。

### 兼容性与调用迁移

这是 Query 表参数语义的升级。现有代码中已经把 Connection 前缀拼进表名，再传给 `db.query()` 的调用都会出现双前缀：

```text
app_order_items -> app_app_order_items
```

调用迁移遵循：

1. 把普通 Query 的表参数统一改为不带 Connection 前缀的相对标识符；
2. 把必须使用真实物理名称的操作移到 `connection.client()`；
3. 不新增“检测到前缀就跳过”的兼容分支；
4. 检查通过参数传递表名的 Query 封装，确认参数契约也是相对表标识符；
5. 同步检查 Migration 和 Seed 的 `context.query`。它们复用同一个 `QueryAdapter`，所以表参数也会自动添加 Connection 前缀；历史表和锁表内部直接使用底层 client 的代码不受影响。

仓库 DB 集成测试会给每个 Connection 设置随机 `tablePrefix`。Query 测试已经改为使用相对标识符：

- Builder 和底层 Knex 断言继续使用 `context.table(name)`；
- `db.query()` 调用改为传入逻辑/相对标识符；
- 编译测试从“明确不包含 Connection 前缀”改为“明确包含一次 Connection 前缀”。

### 回归测试清单

自动前缀的回归测试应持续覆盖：

- `selectFrom`、`insertInto`、`updateTable`、`deleteFrom`；
- `innerJoin`、`leftJoin`、`rightJoin`、`crossJoin`；
- `eb.selectFrom()`、`exists()`、`in` 子查询和嵌套子查询；
- correlated subquery，保证子查询可以解析外层相对表限定符；
- 无 alias、短 alias 和 camelCase alias；
- `selectAll()` 与 `selectAll(alias)`，保证 alias 不加前缀；
- `selectAll(relativeTable)` 和 `select('relativeTable.*')`，保证限定符解析到物理表；
- alias qualified reference，保证 `oi.createdAt` 只转换为 `oi.created_at`；
- 无 alias 的 qualified reference，保证 `orderItems.id` 转换为 `app_order_items.id`；
- Join 两侧的 qualified reference 都解析到正确的 alias 或物理表限定符；
- `underscored: true` 和 `underscored: false`；
- 空前缀；
- 不同 Connection 使用不同前缀；
- Transaction 内创建的新 `DatabaseConnection` 继续保留相同前缀；
- `compile()` 与 `execute()` 使用完全相同的表名解析路径；
- Collection 局部覆盖不会被底层 Query 静默解析；
- 物理表名不会被启发式识别为“已经有前缀”。

### 当前实现状态

Connection 前缀已应用于 Query 的 Select、Insert、Update、Delete、Join、Expression Builder 子查询和 Transaction connection。Query-local table scope 同时处理 alias、无 alias 的 qualified reference、`selectAll(tableOrAlias)` 与 correlated subquery。

## Repository 和原始 SQL

需要正确处理 Collection 局部 naming 时，应使用读取 Collection Metadata 的 Repository 或 Collection-aware API，而不是让底层 Query 猜测目标物理表。

原始 SQL 始终位于物理数据库边界，不进行 naming 转换：

```ts
await db.connection().client();
```

通过底层数据库 client 编写 SQL 时，应使用完整物理表名，例如 `app_order_items`。不要期待原始 SQL 自动添加或移除前缀。

## 修改前缀与 Migration

Collection 创建后修改 `tablePrefix`，等同于修改物理表或 View 的名称。例如：

```text
app_order_items -> core_order_items
```

修改配置本身不会安全地迁移已有生产 Schema。必须通过显式 Migration 完成重命名，并同步处理：

- Foreign Key 和 Relation；
- Index 和 Constraint；
- 普通 View 和物化 View；
- Raw SQL View、触发器和其他无法静态分析的数据库对象；
- Collection Metadata。

如果依赖不能保证原子更新，应在执行 DDL 前拒绝变更，而不是自动修改生产数据库。

## Agent 注意事项

- Builder、Relation 和结构化 View 中始终生成 Collection 逻辑名，不手写前缀。
- 同时检查 Connection 和目标 Collection 的 naming，Collection 配置优先。
- 不要把 Connection 名当作隐式前缀。
- 不要通过 `tableName` 模拟前缀；Collection 物理表名必须由 naming 确定性生成。
- 生成 `db.query()` 代码时，所有表来源参数使用 Connection 相对表标识符，不手写 Connection 前缀。
- 原始 SQL 使用完整物理表名。
- 修改已存在 Collection 的前缀前，先生成并审查 Migration。

## 继续阅读

- 名称生成总览见 [命名概念](./naming.md)。
- 小写下划线转换见 [underscored 命名规则](./underscored.md)。
- Builder 的编译规则见 [Builder 命名](../builder/naming.md)。
- Query 的 identifier 规则见 [Query 命名归一化](../query/naming.md)。
