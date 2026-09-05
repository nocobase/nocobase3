---
title: 在 Migration 中管理 Collection Schema
description: 使用 Builder 创建和演进表结构，并正确选择字段、约束、索引、批量操作和 destructive 变更。
---

# 在 Migration 中管理 Collection Schema

持久化业务 Schema 变更应写成 Migration。`builder` 是 Migration Context 中创建和演进 Collection、Field、Index 与 Constraint 的主要入口。

Relation 和 View 有不同的行为边界，分别见[关系字段](./relations.md)和 [View Collection](./view-collections.md)。精确参数和返回类型以 `@nocobase/db` 的公开 TypeScript 声明为准。

## 创建一个可回滚的表

Migration 中优先使用 Fluent DSL，并在同一文件显式声明 `up()` 和安全的反向操作：

```ts
import { defineMigration } from '@nocobase/db';

export default defineMigration({
  name: '202609030001_create_orders',

  async up({ builder }) {
    await builder.createCollection('orders', (collection) => {
      collection.increments('id');

      collection.string('orderNo', { length: 64 }).notNull().unique({
        name: 'uk_orders_order_no',
      });

      collection
        .decimal('amount', { precision: 12, scale: 2 })
        .notNull()
        .defaultTo(0);

      collection.string('status', { length: 32 }).notNull().defaultTo('draft');

      collection.boolean('paid').notNull().defaultTo(false);
      collection.json('extra').nullable();
      collection.datetime('createdAt').notNull();

      collection.index(['status', 'createdAt'], {
        name: 'idx_orders_status_created_at',
      });
    });
  },

  async down({ builder }) {
    await builder.dropCollection('orders');
  },
});
```

Migration 必须保持自包含：不要导入或遍历会继续变化的运行时 Collection 定义。不可逆时省略 `down()` 并声明 `irreversible: true`。

## 选择字段

先按业务语义选择通用字段；不要从目标数据库的物理类型反推 DSL。

| 业务数据           | 推荐 Fluent API    | 选择建议                                      |
| ------------------ | ------------------ | --------------------------------------------- |
| 普通自增整数主键   | `increments(name)` | 字段名必须显式提供，不默认 id                 |
| 普通整数           | `integer()`        | 计数、排序值或范围适中的 ID                   |
| 大整数             | `bigInt()`         | 大范围 ID 或必须匹配目标 BigInt 主键的外键    |
| 短文本、编号、状态 | `string()`         | 有明确上限时设置 `length`                     |
| 长文本             | `text()`           | 不适合固定短长度的正文                        |
| 布尔状态           | `boolean()`        | 配合 `notNull()` 和明确默认值                 |
| 金额和精确小数     | `decimal()`        | 使用 `precision` 和 `scale`；金额不要用浮点数 |
| 完整日期时间       | `datetime()`       | 时间点、创建时间和更新时间                    |
| 结构化附加数据     | `json()`           | 不需要关系完整性和高频关联查询的数据          |
| 二进制数据         | `blob()`           | 小型二进制内容；大文件通常交给文件存储        |
| UUID               | `uuid()`           | 外部标识符或 UUID 主键                        |
| 数据库原生类型     | `native()`         | 仅在目标方言明确且通用类型无法表达时使用      |

需要 Collection Relation Metadata 时，使用 `belongsTo()`、`hasOne()`、`hasMany()` 或 `belongsToMany()`，不要用 JSON 模拟关系。关系的外键归属和约束行为见[关系字段](./relations.md)。

## 使用没有 Fluent shortcut 的字段

类型系统和 Schema Adapter 还支持 `float`、`double`、`date`、`time`，但当前没有同名 Fluent 方法。使用 `field()` 或 Object DSL：

```ts
await builder.createCollection('events', (collection) => {
  collection.increments('id');
  collection.field({ name: 'eventDate', type: 'date' });
  collection.field({ name: 'startTime', type: 'time' });
  collection.field({ name: 'score', type: 'double' });
});
```

`FieldType` 允许扩展字符串，底层会把未知类型作为数据库 specific type。应用代码不应依赖这个宽松入口；需要方言类型时优先显式使用：

```ts
collection.native('ipAddress', 'inet');
```

`native()` 可能产生 capability warning。跨数据库 Migration 默认不要使用，详见[命名与跨数据库兼容](./portability.md)。

## 不要猜测 Fluent API

以下方法当前不存在：

| 不存在的写法              | 当前表达方式                                                |
| ------------------------- | ----------------------------------------------------------- |
| `collection.float()`      | `collection.field({ name, type: 'float' })`                 |
| `collection.double()`     | `collection.field({ name, type: 'double' })`                |
| `collection.date()`       | `collection.field({ name, type: 'date' })`                  |
| `collection.time()`       | `collection.field({ name, type: 'time' })`                  |
| `collection.timestamp()`  | `collection.datetime()`                                     |
| `collection.timestamps()` | 显式创建 `createdAt`、`updatedAt` 等字段                    |
| `collection.binary()`     | `collection.blob()`                                         |
| `collection.enum()`       | 通常使用 `string()` 并在上层校验；方言 Enum 使用 `native()` |
| `collection.jsonb()`      | 使用 `json()`；必须绑定 PostgreSQL 时使用 `native()`        |

遇到不确定的方法名时先查公开 Types，不要根据 Knex、Sequelize、Prisma 或其他 ORM 的习惯生成 API。

## 配置字段

Field Builder 支持常用的列属性、完整性规则和补充 Metadata：

| 目的       | API                        | 使用边界                                                 |
| ---------- | -------------------------- | -------------------------------------------------------- |
| 主键       | `primary()`                | 单字段主键；复合主键使用 Collection 级 `primary()`       |
| 自增       | `autoIncrement()`          | 普通自增主键优先直接使用 `increments()`                  |
| 空值       | `notNull()`、`nullable()`  | 修改已有表时先处理存量数据                               |
| 默认值     | `defaultTo()`              | 值必须能被目标数据库接受                                 |
| 唯一性     | `unique()`                 | 表达数据完整性，不是普通性能索引                         |
| 查询索引   | `index()`                  | 表达查询性能，不替代 Unique Constraint                   |
| 数据库外键 | `references()`             | 只创建标量字段上的 Foreign Key，不创建 Relation Metadata |
| 应用层说明 | `title()`、`description()` | 保存为补充 Metadata                                      |
| 数据库说明 | `dbComment()`              | 生成数据库 comment，受方言能力限制                       |
| 数据库选项 | `db()`                     | 仅在确实需要方言配置时使用                               |
| 无符号整数 | `unsigned()`               | 主要用于匹配 MySQL 外键两端的类型                        |

```ts
collection
  .string('email', { length: 255 })
  .notNull()
  .unique({ name: 'uk_users_email' })
  .title('Email');
```

`title()` 和 `description()` 是应用层 Metadata；`dbComment()` 才是数据库物理 comment。物理列名由逻辑字段名和 Collection naming 推导，不支持字段级 `columnName`。

## 定义约束和索引

Collection 级 Fluent API 包括 `primary()`、`unique()`、`foreignKey()` 和 `index()`：

```ts
await builder.createCollection('orderItems', (collection) => {
  collection.integer('orderId').unsigned();
  collection.integer('productId').unsigned();
  collection.integer('quantity').notNull().defaultTo(1);

  collection.primary(['orderId', 'productId'], {
    name: 'pk_order_items_order_product',
  });

  collection.foreignKey('orderId', {
    references: { collection: 'orders', fields: ['id'] },
    name: 'fk_order_items_order',
    onDelete: 'cascade',
  });

  collection.index(['productId'], {
    name: 'idx_order_items_product',
  });
});
```

| 目的                     | 使用       |
| ------------------------ | ---------- |
| 主键、唯一性、引用完整性 | Constraint |
| 查询性能                 | Index      |

生产 Migration 中的重要 Constraint 和 Index 应显式命名，便于后续删除、回滚和审计。

`check` 可以通过 Object Definition 或 `addConstraint()` 表达，但当前 Schema Adapter 尚不生成 SQL；默认会产生 warning，`strict: true` 时阻止真实执行。`dropConstraint()` 也不是可移植的通用约束删除入口，使用前确认目标方言和约束类型。

## 创建多个 Collection

同一次初始化需要创建多个明确的 Collection 时，可以使用 `createCollections()`：

```ts
await builder.createCollections([
  {
    name: 'customers',
    definition: (collection) => {
      collection.increments('id');
      collection.string('name').notNull();
    },
  },
  {
    name: 'orders',
    definition: (collection) => {
      collection.increments('id');
      collection.integer('customerId').unsigned();
      collection.foreignKey('customerId', {
        references: { collection: 'customers', fields: ['id'] },
        name: 'fk_orders_customer',
      });
    },
  },
]);
```

`createCollections()` 不自动推导业务模型或依赖顺序。每个 Collection 的 Field、Relation、Index 和 Constraint 仍需在 Migration 中固定声明。

## 修改 Collection

同一个 Collection 有多个相关变更时，使用 `alterCollection()` 集中表达：

```ts
await builder.alterCollection('orders', (collection) => {
  collection.datetime('paidAt').nullable();
  collection.alterField('amount', { precision: 14, scale: 2 });
  collection.dropFields('legacyStatus');
  collection.index(['paidAt'], { name: 'idx_orders_paid_at' });
});
```

单一变更也可以使用快捷 API：

| 目标                   | API                                         |
| ---------------------- | ------------------------------------------- |
| 新增、修改或删除 Field | `addField()`、`alterField()`、`dropField()` |
| 新增或删除 Index       | `addIndex()`、`dropIndex()`                 |
| 新增或删除 Constraint  | `addConstraint()`、`dropConstraint()`       |

字段重命名当前没有独立 API。需要保留数据时，用“新增字段 → 使用同一 Migration Context 的 `query` 迁移数据 → 删除旧字段”显式表达。

## 谨慎判断 Collection 是否存在

工具或明确授权的运行期管理流程可以使用：

```ts
if (!(await builder.hasCollection('orders'))) {
  await builder.createCollection('orders', definition);
}
```

不要让已发布 Migration 通过 `hasCollection()` 根据现场状态跳过固定步骤。Migration 应保持确定、自包含；异常状态应该暴露并修复，而不是被条件分支隐藏。

`ifNotExists` 和 `ifExists` 也只处理对象存在性，不会把已有 Schema 自动对齐到定义。完整执行边界见[执行与审计](./execution.md)。

## Schema 与 Metadata

Builder 修改物理 Schema，并默认同步能从定义中提取的补充 Metadata，例如 Collection/Field 的 `title`、`description`、naming 和 Relation 信息。物理类型、nullable、default、Index 和 Constraint 仍以数据库为准。

只更新补充 Metadata 时，使用 `connection.collectionMetadata`。如果一次 Schema 操作不应同步 Metadata，可以传入 `syncMetadata: false`。

## 重命名和删除

```ts
await builder.renameCollection('oldOrders', 'orders');
await builder.dropCollection('obsoleteOrders');
```

`renameCollection()` 当前只支持 Table Collection，并同时更新逻辑名、确定性物理表名和 Metadata。存在无法原子更新的 Relation、Foreign Key 或 View 依赖时，它会在 DDL 前拒绝执行。

`dropField()` 和 `dropCollection()` 可能删除数据。执行前使用 dry-run 查看 `warnings`、`impact` 和可用的 SQL 预览，确认策略见[执行与审计](./execution.md)。

## 完成前检查

- Migration 文件名、`name`、`up()` 和 `down()` 保持对应。
- 每个 Field、Relation、Index 和 Constraint 都在 Migration 中固定声明。
- 金额使用 `decimal()`，关系数据使用 Relation，不用 JSON 代替。
- 重要 Index 和 Constraint 显式命名。
- 所有 Collection 和 Field 引用都写逻辑名。
- 删除、重命名和方言敏感变更先 dry-run。
- 在真实测试数据库验证 `up()`，可逆时同时验证 `down()`。
