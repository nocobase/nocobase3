---
title: Agent 实现护栏
description: 生成 @nocobase/db 业务代码时必须遵守的 API、事务、Migration、命名和跨数据库约束。
---

# Agent 实现护栏

本页集中记录生成代码时的硬约束。专题页解释用法，本页负责回答“哪些代码不能生成”。

## API 形状

| 不要生成                                    | 改用或处理方式                      |
| ------------------------------------------- | ----------------------------------- |
| `db.builder`                                | `db.builder()`                      |
| `connection.builder()`                      | `connection.builder`                |
| `db.query`                                  | `db.query()`                        |
| `connection.query()`                        | `connection.query`                  |
| `db.repository()`                           | 当前未实现；按任务使用 Query        |
| `connection.metadataStore`                  | `connection.collectionMetadata`     |
| `connection.client`                         | `await connection.client()`         |
| `connection.driver === 'pg'` 判断数据库类型 | `connection.dialect === 'postgres'` |

`connection.client()` 在默认 Knex adapter 下返回 Knex 实例，不是数据库驱动的原生连接。

## 事务

- 事务内只使用回调参数里的 `connection`。
- 不在 `db.transaction()` 回调里调用外层 `db.query()`、`db.builder()` 或 `db.connection()`。
- Metadata 事务也必须通过事务 Connection 的 `collectionMetadata` 和 `collections` 完成。
- 抛错是触发回滚的一部分；不要吞掉异常后假设事务仍会回滚。

## Migration 与 Seed

- Migration 只能使用 `export default defineMigration({...})`。
- Seed 只能使用 `export default defineSeed({...})`。
- 文件名主体必须与定义中的 `name` 一致，所有来源中的名称全局唯一。
- 已发布或已合并的 Migration、Seed 不可修改；新增更晚的文件表达变化。
- Migration 必须自包含，不导入会继续演化的 Collection、Field 或注册表定义。
- 没有真实回滚方式的 Migration 声明 `irreversible: true`，不编造 `down()`。
- Seed 不使用 Builder，不创建或修改 Schema，不提供 rollback/truncate 行为。
- Seed 使用稳定业务 key 和数据库唯一约束保证幂等。

## Query

- 简单条件使用三参数 `where(lhs, operator, rhs)`。
- 复杂条件使用 `where((expressionBuilder) => ...)`。
- 不生成二参数 `where(field, value)`。
- 不生成 Knex 风格的 `orWhere()`、`whereIn()`、`whereNull()`、`orOn()` 或 `orOnRef()`。
- 默认不生成 raw SQL。
- Query 不读取 Collection Metadata，也不识别 Collection 级 naming override。
- Query 不是 Repository，不承担 relation-aware CRUD。

## 名称语义

| API                                   | 名称语义                   |
| ------------------------------------- | -------------------------- |
| `db.connection(name)`                 | Connection 配置名称        |
| Builder Collection/Field/Relation API | 逻辑名称                   |
| Query 表和列参数                      | Connection 级查询标识符    |
| `collections.get(name)`               | Collection 逻辑名称        |
| `collections.getPhysical(name)`       | Collection 逻辑名称        |
| Schema Inspector                      | 物理 Schema/Table identity |
| Collection Metadata Service           | Collection/Field 逻辑名称  |

- 不自行保存或拼接 `tableName`、`columnName`。
- Relation 参数引用 Collection/Field 逻辑名。
- Builder 的物理名由 `underscored` 和 `tablePrefix` 确定性生成。
- 判断数据库类型使用 `dialect`；只有 driver-specific 逻辑才读取 `driver`。

## Schema 所有权与底层入口

- `schemaManagement: 'external'` 禁止真实 Builder DDL 和 Migration，但不等于只读数据连接。
- External Connection 必须显式配置 Metadata Store。
- `connection.client()` 会绕过高层 Schema guard；不能用它规避 external 模式限制。
- 优先级是 Builder/Query/Collections/Schema Inspector，最后才是 `client()`。
- 方言专用代码先检查 `connection.dialect` 或 `connection.capabilities`。

## 规划能力

Repository、Select AST、Filter Builder、Filter AST、Sort AST 和 Writable File Metadata Store 当前未实现。设计材料不能复制到运行时代码。
