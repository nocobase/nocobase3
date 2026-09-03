---
title: Collection 当前架构
description: 说明 Physical Schema、Metadata Document、Resolver、Registry 和 Builder 如何组成当前 Collection 读取与修改链路。
---

# Collection 当前架构

`@nocobase/db` 不把完整 Collection 当作另一份数据库定义保存。Connection 在读取时组合真实物理结构和补充 Metadata：

```text
Schema Inspector ──> Physical Schema ─┐
                                      ├─> Resolver ─> Registry ─> connection.collections
Metadata Store ──> Metadata Document ─┘
```

## 组件职责

| 组件                | 负责                                      | 不负责                   |
| ------------------- | ----------------------------------------- | ------------------------ |
| Schema Inspector    | 读取真实表、视图、列、索引和约束          | 补充标题、关系或应用语义 |
| Metadata Store      | 保存标题、描述、局部命名和 relation       | 保存物理 Schema 副本     |
| Collection Resolver | 合并两类输入并验证一致性                  | 持久化或缓存结果         |
| Collection Registry | 命名索引、按需解析、缓存和失效            | 执行 DDL                 |
| Collection Builder  | 把逻辑 DSL 编译为 Schema 和 Metadata 变更 | 充当 Collection 读取入口 |

## 当前公开入口

- 读取完整 Collection：`connection.collections`；
- 读取物理数据库：`connection.schemaInspector`；
- 更新补充 Metadata：`connection.collectionMetadata`；
- 修改数据库结构：`connection.builder`；
- 选择 Connection：`db.connection(name)`。

没有重复的 `db.collections()` 快捷入口。Collection 解析始终绑定到具体 Connection，因为 Physical Schema、命名配置和 Metadata Store 都是 Connection 级上下文。

## 信息边界

### Physical Schema

以下信息只信任数据库：

- Collection kind 和物理表名；
- 列名、类型、长度、精度、nullable 和默认值；
- primary key、unique、foreign key、check constraint 和 index；
- view definition；
- 方言能够读取的 comment 和生成列表达式。

### Metadata Document

Metadata 只补充：

- Collection 的 `title`、`description` 和局部 `naming`；
- Field 的 `title` 和 `description`；
- 数据库不能完整表示的 relation。

Metadata 引用不存在的物理 Field、把两个逻辑名映射到同一张表，或与当前命名规则不一致时，Resolver 报告结构化错误，不会静默回退。

## 受管连接与外部连接

两类 Connection 使用相同的解析链路。差异来自配置和数据库权限：

- 受管连接通常允许 Builder 和 Migration 修改 Schema，并可使用数据库 Metadata Store；
- 外部连接通常以读取和查询为主，Schema 修改是否允许由 `schemaManagement` 控制；
- 外部连接仍需要 Metadata Store，常见选择是只读 Module Store；
- `connection.client()` 不经过高层 Schema guard，不能用来假装受限制的 Connection 可安全执行 DDL。

## 修改链路

Builder 操作先编译为结构化 Schema operation，再由 Schema Adapter 执行。涉及 Metadata 的操作通过 Metadata Service 写入。成功后，受影响的 Registry cache 和 Naming Index 会失效。

```text
Builder operation
  -> capability planning
  -> Schema Adapter / Metadata Service
  -> invalidate affected Collection entries
  -> next read resolves current state
```

生产数据库结构变更应写入不可变 migration。运行时定义、Collection 注册表或当前模型文件不能作为历史 migration 的输入。

## 当前不变式

1. 物理数据库是结构事实的唯一来源。
2. Metadata 只保存补充信息，不保存完整 Collection。
3. 命名转换必须确定且可逆；有歧义时立即报错。
4. Resolver 不使用旧完整定义作为 fallback。
5. Registry 缓存的是派生结果，失效后可以从权威来源重建。
6. Relation 的本地结构与跨 Collection 图分阶段校验。
7. 无法安全协调物理对象、Metadata 和 Registry 的 Collection rename 会在执行 DDL 前被拒绝。

## 相关文档

- [Collection 解析生命周期](./resolution-lifecycle.md)
- [Collection Resolver](./resolver.md)
- [Collection Registry](./registry.md)
- [Schema Inspector 内部架构](../schema-inspector/architecture.md)
- [Metadata Store 内部契约](../metadata/store.md)
