---
title: Schema Inspector 方言行为
description: 汇总 SQLite、PostgreSQL、MySQL、Oracle 和 SQL Server Inspector 当前支持的 schema 范围、目录来源和不完整检查语义。
---

# Schema Inspector 方言行为

所有方言返回同一物理 Schema 模型，但可访问的 schema 范围和数据库目录能力不同。调用方应读取实际 inspection status，而不是仅凭 dialect 猜测完整性。

## 范围概览

| 方言       | `listSchemas()`                          | 物理对象类型                                                     | 典型不完整项                                                  |
| ---------- | ---------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------- |
| SQLite     | 只返回 `main`                            | table、view                                                      | comments unsupported；check 与部分 index 解析可能 partial     |
| PostgreSQL | 当前 search path 中可用且有权限的 schema | table、partitioned table、foreign table、view、materialized view | 当前实现通常完整                                              |
| MySQL      | 只返回当前 database                      | table、view                                                      | 旧服务器的 check unsupported；部分版本不暴露 index expression |
| Oracle     | 只返回当前用户 schema                    | table、partitioned table、view、materialized view                | default、check expression 或 view SQL 可能 partial            |
| SQL Server | 返回可读取 schema，默认通常为 `dbo`      | table、view                                                      | 当前实现通常完整                                              |

## SQLite

主要使用 `sqlite_schema` 和 `PRAGMA table_xinfo`、`index_list`、`index_xinfo`、`foreign_key_list`。需要时解析 `sqlite_schema.sql`，补充 View、Check、表达式 index、partial index predicate 和 `AUTOINCREMENT`。

当前只检查 `main`，不会扫描 `temp` 或 `ATTACH DATABASE` 附加的数据库。显式请求其他 schema 会报错。

SQLite 没有原生 table/column comment，因此 comments 为 `unsupported`。从 SQL 文本解析的 check constraint 可能不完整，所以 table 的 check constraints 标为 `partial`。无法可靠解析表达式 index 或 predicate 时，indexes 也会带 partial warning。

## PostgreSQL

主要读取 `pg_catalog`，而不是只依赖 `information_schema`。它保留：

- schema、search path 和自定义类型 schema；
- partitioned table、foreign table 和 materialized view；
- 复合与 deferrable constraint；
- 表达式、partial 和 include index；
- table/column comment 与 view definition。

系统 schema 被排除，只返回当前 Connection 有权限检查的对象。同名 table 通过显式 schema 区分。

## MySQL

主要读取 `information_schema.TABLES`、`COLUMNS`、`STATISTICS`、约束相关目录和 `VIEWS`。

当前只支持 Connection 的当前 database，并把 database 名放入统一模型的 `schema`。显式请求其他 database 会报错。

`COLUMN_TYPE` 保留为原生类型，`AUTO_INCREMENT` 从 `EXTRA` 读取，index key 顺序使用 `SEQ_IN_INDEX`。服务器不暴露表达式 index 时 indexes 标为 `partial`；不支持 `CHECK_CONSTRAINTS` 目录时 check constraints 标为 `unsupported`，不会将其误报为“确定没有”。

## Oracle

主要读取 `USER_TABLES`、`USER_VIEWS`、`USER_MVIEWS`、列、约束、索引和注释目录，并在需要时使用 `DBMS_XMLGEN` 或 `DBMS_METADATA`。

当前只检查 Connection 用户自己的 schema，显式请求其他 schema 会报错。它区分普通表、分区表、view 和 materialized view，并保留 `NUMBER(p,s)`、`VARCHAR2`、`CLOB`、`RAW`、`DATE` 等原生类型。Oracle `DATE` 归一化为 `datetime`。

实现同时识别 identity column 和历史 sequence + trigger 自增模式。目录能力不足或返回文本被截断时，对应 default、check 或 view definition 标为 `partial`；连接和普通目录查询错误不会降级为 partial。

## SQL Server

主要读取 `sys.schemas`、`sys.objects`、`sys.columns`、约束、索引、default、extended properties 和 SQL module 等目录。

默认 schema 使用 `SCHEMA_NAME()`，通常是 `dbo`。实现保留：

- identity 和 computed/persisted 状态；
- filtered index predicate 与 included columns；
- unique constraint 和普通 unique index 的区别；
- `MS_Description` table/column comment；
- `bit`、`uniqueidentifier`、`datetime2`、`nvarchar(max)` 等原生类型；
- 数据库实际返回的 referential action。

系统目录查询遇到错误 1205 deadlock 时执行有限重试，其他错误继续抛出。

## 跨方言约束

- 不从类型名称猜测数据库没有声明的应用语义；
- 不把 `tinyint(1)` 或 `nvarchar(max)` 无条件推断为 boolean 或 JSON；
- 不把不支持读取的对象表示为空且 `complete`；
- 列表过滤和分页尽量在数据库查询中执行；
- 复合列顺序始终按数据库目录的 ordinal 信息恢复。

## 相关文档

- [Schema Inspector 内部架构](./architecture.md)
- [物理 Schema 模型](./physical-schema-model.md)
- [分页、完整性与错误](./pagination-and-errors.md)
- [Schema Inspector 示例](../../schema-inspector/examples.md)
