---
title: Collection 物理名称简化影响分析
description: 分析保留 underscored 与 tablePrefix 命名配置，并移除 Collection tableName 和 Field columnName 自定义映射的影响。
---

# Collection 物理名称简化影响分析

> 本文记录本次改造的设计依据、兼容边界和后续仍需完善的事项。核心公开 API、确定性命名、重命名保护与旧 Metadata 校验已经实现。

## 目标

Collection DSL 不再允许为单个 Collection 或 Field 直接指定物理名称，只保留一套确定的命名规则：

```text
effectiveNaming = merge(connection.naming, collection.naming)
normalized(name) = effectiveNaming.underscored ? snake_case(name) : name
物理表名 = effectiveNaming.tablePrefix + normalized(collectionName)
物理列名 = normalized(fieldName)
```

例如 `tablePrefix` 为 `nb_` 时：

```text
users       -> nb_users
orderItems  -> nb_order_items
createdAt   -> created_at
createdById -> created_by_id
```

Connection 提供默认 naming，Collection 可以通过自己的 `naming` 局部覆盖。例如：

```ts
await builder.createCollection('auditLogs', (collection) => {
  collection.naming({ tablePrefix: 'archive_' });
  collection.datetime('createdAt');
});
```

对应的物理名称是 `archive_audit_logs.created_at`。这种覆盖仍然是规则配置，不允许直接指定任意表名或列名。

## API 调整

Collection 层已移除以下公开能力：

```ts
collection.tableName('custom_orders');
collection.mapToTable('custom_orders');
field.columnName('order_number');
field.mapToColumn('order_number');

builder.renameCollection('orders', 'archivedOrders', {
  renameTable: false,
  renameTableTo: 'legacy_orders',
});
```

相应移除或收窄的类型包括：

- `CollectionDefinition.tableName`；
- `FieldDefinition.columnName`；
- `FieldAlterInput` 中继承的 `columnName`；
- Collection rename 的 `renameTable` 和 `renameTableTo` 选项；
- Connection、Builder 和 Compiler 对外暴露的自定义 `namingStrategy` 注入能力。

Connection 级和 Collection 级 `naming` 均保留，Collection 配置优先于 Connection 默认值。第一版支持 `underscored` 和 `tablePrefix`，不支持任意逐表、逐字段映射。

最终公开配置可以收敛为：

```ts
interface NamingOptions {
  underscored?: boolean;
  tablePrefix?: string;
}
```

合并语义需要明确：

- Collection 未提供 `tablePrefix` 时继承 Connection；
- Collection 提供 `tablePrefix: ''` 时显式清除 Connection 的前缀；
- Collection 未提供 `underscored` 时继承 Connection；
- `underscored` 默认是 `true`，也可以显式设置为 `false`；
- `tablePrefix` 按原样作为前缀使用，不再次执行 underscored 转换；
- `tablePrefix` 不能包含 schema、`.` 或其他跨 namespace 语义。

删除的是自定义 naming strategy 的公开注入能力。内部仍可以保留 `NamingStrategy`，作为 Compiler 和 Query 复用确定性命名算法的实现抽象。

## 不受影响的物理名称

删除的是 Collection DSL 中的自定义映射，不是数据库底层的物理名称概念。

Schema Adapter、Schema Operation、introspection、Migration history、Seed history 以及直接执行 SQL 的代码仍然需要使用真实的表名和列名。例如底层的 `renameTable.from`、`renameTable.to`、`alterTable.tableName` 和 `dropColumn.column` 不能删除。

以下名称也不属于 `tableName`、`columnName` 映射，应继续保留：

- `db.schema` 等数据库 namespace 配置；
- Migration、Seed、lock 和 Metadata Store 自身的系统表配置；
- Index 和 Constraint 的显式名称；
- Raw SQL 中的物理 identifier；
- Query 的 table alias、column alias 和结果 alias。

`tablePrefix` 只作用于 Collection Compiler 管理的 table、view 和 materialized view，不自动作用于 Migration history、Seed history、lock table 或其他包自行管理的物理表。Schema 与 table prefix 分开组合：schema 负责 namespace，prefix 只修改 namespace 内的表名。

代码调整时必须区分：

```text
Collection 层：只接受逻辑名称，并统一推导物理名称
Schema 层：继续准确表达数据库中的物理名称
```

## 对 Builder 和 Compiler 的影响

当前 Compiler 需要按“显式映射、Collection naming、Connection naming、默认策略”的优先级解析名称。简化后不再处理显式物理名称，优先级收敛为：

1. Collection `naming`；
2. Connection `naming`；
3. 默认 naming。

创建表、修改字段、索引、约束、外键和 View 都使用合并后的 effective naming。

所有 Collection 操作必须共用同一个名称解析入口，避免某些路径遗漏 `tablePrefix`：

```text
resolveTableName(collectionName, connection, collectionNaming)
resolveColumnName(fieldName)
```

索引名和约束名仍可由最终物理表名、物理列名确定性生成，但不再允许通过 Collection mapping 间接改变。

跨 Collection 的引用不能复用当前 Collection 的 naming。Compiler 解析 foreign key target、relation target、`through` Collection 或结构化 View 的 `from` 时，必须读取目标 Collection 自己的 effective naming。例如源 Collection 使用 `app_`、目标 Collection 使用 `auth_` 时，外键必须引用 `auth_users`，不能引用 `app_users`。

因为 effective naming 与 Connection 和 Collection 都有关，解析后的物理名称不能只按 Collection name 做全局缓存。Collection Registry 或名称解析缓存至少要隔离 connection；多个 connection 共享同一个 Metadata Store 时，也必须保证它们的 naming 配置兼容，否则同一份 Collection Metadata 会解析到不同物理表。

## 名称冲突和合法性校验

underscored 转换不是一一映射。不同逻辑名称可能得到同一个物理名称：

```text
orderItems -> order_items
order_items -> order_items
```

Collection `tablePrefix` 也可能制造跨 Collection 冲突；Field、隐式 Relation foreign key、Index 和 Constraint 同样可能在转换或截断后重名。

Builder 应在执行 DDL 和写入 Metadata 前检测最终物理名称冲突并直接报错，至少覆盖：

- 同一 namespace 内的 table、view 和 materialized view；
- 同一 Collection 内的 column；
- 显式 scalar foreign key 与隐式 relation foreign key；
- 自动生成或因数据库长度限制而截断的 Index、Constraint 名称；
- `tablePrefix + normalized(name)` 超过数据库 identifier 长度上限。

表名和列名不应静默截断或自动消歧，否则相同逻辑定义在不同环境中可能指向不同对象。错误信息应同时给出逻辑名称和冲突后的物理名称，方便 Agent 修正。

underscored 算法本身也属于公开兼容契约，需要用测试固定缩写、连续大写、数字、已有下划线和 Unicode 等边界，例如 `APIKeys`、`OAuth2Tokens`、`order_items`。实现升级不能在没有 Migration 的情况下改变同一个逻辑名称对应的物理名称。

数据库保留字不通过 `tableName` 或 `columnName` 绕过，应由 Schema Adapter 和 Query 的 identifier quoting 统一处理。逻辑名称和 `tablePrefix` 仍需做跨数据库可移植的字符校验，避免把非法 identifier 推迟到某个方言才失败。

## 对 Query 的影响

这是主要收益之一。当前自定义 `tableName`、`columnName` 只被 Collection Builder 理解，底层 Query 不一定读取 Collection Metadata，容易出现两套名称解析行为。

取消自定义映射后，Builder、Collection-aware Query 和 Agent 都可以遵循同一规则，不再需要判断：

```text
orderNo 到底是 order_no，还是被映射成 order_number？
```

因为 Collection 可以覆盖 naming，只知道 Connection 配置的底层 Query 无法正确推导所有表名。`db.query()` 自动应用 Connection naming，表来源参数使用不带前缀的相对标识符；Repository 或其他 Collection-aware Query 必须通过 Collection Registry 取得 effective naming。直接写物理 SQL 和直接访问物理 Schema 的 API 则继续使用完整物理名称，不进行自动转换。

## 对重命名的影响

原有设计可以修改逻辑名称，同时通过 `tableName` 或 `columnName` 保留旧物理名称。移除映射后，这种状态无法继续表达。

当前 `renameCollection()` 的两个选项也应从 Collection API 移除：

```ts
await builder.renameCollection('orderItems', 'archivedOrderItems', {
  renameTable: false,
  renameTableTo: 'legacy_orders',
});
```

- `renameTableTo` 允许直接指定任意物理表名，等价于重新引入 `tableName`。
- `renameTable: false` 会只修改逻辑名称并保留旧物理表，但移除 `tableName` 后，Metadata 无法表达和恢复这层映射。
- `renameTable: true` 在“重命名必定同步到物理表”的规则下成为多余选项。

这是行为不兼容变更：当前未传选项时只重命名逻辑 Collection，并把旧物理表名写入 Metadata；调整后，未传选项时会同步重命名物理表。

因此 Collection 层只保留无歧义的调用：

```ts
await builder.renameCollection('orderItems', 'archivedOrderItems');
```

它采用单一规则：

```text
rename Collection -> 同步重命名物理表
rename Field      -> 同步重命名物理列
```

Collection 原有的 `naming` 在重命名后继续保留。Compiler 分别使用重命名前、后的逻辑名称和同一份 effective naming 计算物理名称：

```text
from = resolveTableName(oldCollectionName, effectiveNaming)
to   = resolveTableName(newCollectionName, effectiveNaming)
```

不再支持只修改逻辑名而保留旧物理表，也不支持在 Collection rename 中指定任意目标物理表名。

Collection rename 还必须处理依赖它的逻辑引用，包括 relation `target`、`through`、foreign key references 和结构化 View 的 `from`。实现可以原子更新这些引用，也可以在存在依赖时拒绝重命名并返回 impact；不能留下引用旧逻辑名称的 Metadata。

当前 API 没有独立的 Field rename：`alterField()` 的 `changes` 不包含逻辑 `name`。因此本文的“rename Field”是未来规则，不是现有能力。如果后续增加 Field rename，它必须同步重命名物理列，并原子更新 Index、Constraint、Relation key、结构化 View select/filter 等逻辑引用。移除 `FieldDefinition.columnName` 后，`alterField({ columnName })` 这条直接重命名物理列的隐含路径也需要删除。

底层 Schema Operation 的 `{ type: 'renameTable', from, to }` 仍然保留。它准确表达 Migration 和 Schema Adapter 执行的物理操作，不属于 Collection 自定义映射。确实需要操作不规则物理表名时，应在底层显式 Schema Migration 中完成，而不是把例外写回 Collection Metadata。

Connection 或 Collection 的 `tablePrefix` 变更都会改变对应的物理表名，因此不能作为普通运行时配置静默修改。已有数据库变更 `tablePrefix` 时，必须通过显式 Migration 重命名表。

Collection 创建后，`naming.tablePrefix` 应视为影响物理 Schema 的配置，不能通过 metadata-only update 直接改写。任何 prefix 变更都需要同时描述旧、新 effective naming，生成可预览的 rename impact，并处理引用它的 foreign key、Index 和 Constraint 名称。

## 对 Relations、Indexes 和 Constraints 的影响

Relation、Index 和 Constraint 继续引用逻辑 Collection 名和逻辑 Field 名，由 Compiler 统一解析物理名称。

例如：

```text
createdById -> created_by_id
```

以下不规则映射将不再支持：

```text
createdById -> creator_id
id          -> user_pk
```

因此，关系外键、复合索引、唯一约束、主键引用和跨 Collection 外键的编译与测试都需要调整。Relation Field 原有的 `columnName` 禁用分支也可以随公共能力一起清理。

## 对 View 的影响

View Collection 也遵循同一规则：

- View 的物理名称由 effective naming 的 `tablePrefix + normalized(collectionName)` 推导；
- View 输出列由 Field 逻辑名推导；
- 不能再将任意名称的既有 View 映射为另一套逻辑名称。

结构化 View 的 `from`、`select` 和 `filter` 继续使用逻辑名称。Raw SQL 仍然使用物理名称，由编写 Raw SQL 的调用方负责。

## 对外部数据库的影响

外部数据库的实际表名和列名不能因为 Collection DSL 被简化而丢失。Schema introspection 和生成的 `*.schema.json` 仍应记录真实物理名称，因为它们描述的是数据库事实，而不是 Collection 自定义配置。

外部 Schema 可以无损映射为逻辑 Collection 的前提是符合统一规则，例如：

```text
nb_order_items <-> orderItems
created_by_id  <-> createdById
```

以下不规则 Schema 将不能通过普通 Collection DSL 改名：

```text
tbl_order  <-> orders
user_pk    <-> id
creator_id <-> createdById
```

第一版应明确接受这一限制：Collection 逻辑名称可以直接采用 introspection 得到的名称，或者只支持能够通过 Collection effective naming 确定性对应的外部 Schema；不再为任意旧库提供逐表、逐字段映射。

Introspection 应保持 physical-first：先把数据库中的真实表名、列名写入 Schema Snapshot，再根据已知 naming 解析逻辑 Collection。Connection 级 `tablePrefix` 可以用于发现和过滤一组表；Collection 级 `tablePrefix` 只有在该 Collection Metadata 已经存在时才能参与解析，不能依靠扫描数据库自动猜测。

反向转换也必须有唯一的规范实现，包括剥离 prefix、snake_case 转 camelCase 和冲突检测。无法唯一反推、prefix 不匹配或反推后与已有逻辑名称冲突时，应报告 unresolved schema，而不是生成猜测性的 Collection。

## 对 Metadata 的影响

Metadata Store 不再保存 `tableName` 或 `columnName`，但可以保存 Collection 级 `naming`。可编辑 Metadata 还可以保存数据库无法表达的应用语义，例如：

- `title`、`description`；
- relations；
- `interface`、`uiSchema`；
- 虚拟字段及其他应用层信息。

物理 Schema 快照仍可以出现 `tableName` 和物理列名，但这些字段属于 introspection 结果，不属于可编辑 Collection mapping。

已有 Metadata 中的 `tableName`、`fields[].columnName` 不能在升级时直接忽略，否则运行时可能静默指向另一张表或列。升级过程需要先验证它们是否恰好等于 effective naming 的推导结果：

- 完全一致时可以安全删除旧字段；
- 不一致时必须阻止升级并列出逻辑名、旧物理名和新推导物理名；
- 不自动重命名生产数据库，也不自动改写历史 Migration。

## 对 Migration 和兼容性的影响

已经合并的 Migration 是不可修改的历史记录。升级前，需要检查所有已发布 Migration 和应用代码是否使用了 `tableName()`、`columnName()`、`mapToTable()`、`mapToColumn()` 或对应的对象字段。

同样需要检查历史 Migration 是否调用了 `renameCollection()` 的 `renameTable` 或 `renameTableTo`：

- 如果这些 API 只存在于当前未发布代码、测试和文档中，可以直接移除。
- 如果已发布 Migration 使用了它们，需要先保留 deprecated 兼容入口，保证旧 Migration 仍能编译和重放，再安排后续移除。
- Migration 和 Schema Adapter 中直接使用物理 `tableName`、`columnName` 的代码不属于本次删除范围。

当前工作区中的直接调用主要集中在兼容性测试和本文的旧 API 示例，尚未发现其他 package 的 Migration 使用 Collection `tableName()`、`columnName()`、`renameTableTo`。`@nocobase/app-plugin-authentication` 继续覆盖 `underscored: false`。发布前仍需检查工作区之外已发布包和已生成应用中的历史 Migration，不能只以当前源码为准。

## 主要修改范围

实施时主要涉及：

1. Collection 与 Field 的公开类型和 Fluent DSL；
2. Collection Compiler、Builder 及 metadata 同步；
3. Connection/Collection naming 合并与 Collection-aware Query 的 `tablePrefix` 处理；
4. Collection/Field rename，以及 Collection Operation 中的 `renameTable`、`renameTableTo`；
5. Relations、Views、Indexes 和 Constraints；
6. 外部 Schema introspection 与 metadata 文件格式；
7. Builder、Query、Naming、Relation、View 和 Rename 测试；
8. Query 类型注释，以及所有介绍 `tableName`、`columnName` 和自定义 naming strategy 的文档；
9. 已有 Metadata 的兼容检查或一次性升级工具；
10. 物理名称冲突、跨 Collection naming、prefix 变更和反向 introspection 测试。

## 最终边界

```text
应用和 Agent
  -> 只提供逻辑 Collection/Field 名
  -> 不配置 tableName/columnName

Connection
  -> 提供默认 naming/underscored/tablePrefix

Collection
  -> 可以单独定义 naming/underscored/tablePrefix
  -> 不能直接指定 tableName/columnName

Collection Compiler
  -> 合并 Connection 与 Collection naming
  -> 确定性生成物理表名和列名

Schema / Introspection
  -> 继续处理和记录真实物理名称
```

这项改造放弃一部分旧数据库的任意映射能力，换取 Collection、Query、Migration 和 Agent 对名称的一致理解。只要接受“不规则外部 Schema 不提供逐表、逐字段别名映射”这一边界，整体方案是可行的。
