---
title: Metadata Store 后端
description: 说明 Database、Module、File 和 In-memory Metadata Store 的行为，以及多个 Connection 如何共享命名 Store。
---

# Metadata Store 后端

> **文档类型：内部实现。** Store 选择和公共合同见 [Metadata Store 与后端](../../collection-metadata/metadata-store.md)；本页保留各后端实现决策。

> `DatabaseCollectionMetadataStore`、`ModuleCollectionMetadataStore` 和
> `InMemoryCollectionMetadataStore` 已实现。多个命名 Store 的声明式配置仍是后续设计；
> 当前数据库配置直接接收 Store 实例。

所有后端都实现 [Metadata Store 设计](./store.md) 中的补充文档契约。后端只改变
持久化方式和 capability，不改变 Metadata 文档的语义。

架构中的 **File Metadata** 是一个广义概念，指保存在源码管理或普通文件中的 Metadata。第一版通过
只读 Module Metadata Store 加载可编辑的 TypeScript 源文件。未来如果增加运行时可写的 JSON 或 YAML
后端，它属于独立的 Writable File Metadata Store。

## Database Metadata Store

NocoBase 管理的主数据库可以使用 `DatabaseCollectionMetadataStore`。它通过底层 Knex
client 自行初始化内部表，不依赖 Collection Builder，并在一张表中为每个 Collection 保存一行：

```text
__nocobase_collection_metadata
```

实际字段：

| 字段         | 用途                               |
| ------------ | ---------------------------------- |
| `name`       | 逻辑 Collection 名称，同时作为主键 |
| `document`   | 带版本的 Metadata 文档             |
| `revision`   | 乐观并发控制版本                   |
| `created_at` | 创建时间                           |
| `updated_at` | 最后一次成功写入时间               |

当前实现统一将规范化文档序列化到 text 列，由 Store 负责 JSON 编解码，因此不依赖某个数据库的
JSON 类型：

```text
PostgreSQL  document text
MySQL       document text
SQLite      document text
```

第一版优先使用单个 document 字段，而不是把 Collection、Field 和 Relation 拆成多张表，原因包括：

- 一个 Collection 的 Metadata 可以在一次原子写入中完成；
- revision 校验更简单；
- 数据库和文件后端可以使用同一种导出格式；
- 增加可选 Metadata 属性时，不需要立即修改物理表结构。

内部 Metadata 表不能通过普通 Collection Builder 创建。Builder 本身依赖 Metadata Store，这样做会形成
循环依赖。该后端通过自包含的底层 Knex schema 路径初始化这张表。

```ts
const store = new DatabaseCollectionMetadataStore({
  resolveClient: async () => connection.client(),
  tableName: '__nocobase_collection_metadata', // 可省略
  schema: 'public', // 可选
});
```

数字 revision 按单个文档从 1 递增。创建、更新和删除都在数据库中执行 compare-and-swap；过期 revision
抛出 `CollectionMetadataConflictError`。`list()` 直接使用按名称排序的 keyset pagination，不会先把所有
完整文档加载到内存。持久化行中的 `name`、document 内的 `name` 或 revision 不一致时会拒绝读取，避免
静默接受损坏数据。

多个逻辑 Store 使用同一个数据库 Schema 时，内部表必须隔离。当前 class 的默认表名是
`__nocobase_collection_metadata`，调用方可以通过 `tableName` 为内部系统表显式隔离。未来的命名 Store
配置如果自动生成表名，应确定性地包含所属 Connection 的 `tablePrefix`。例如，未来声明式配置可能表示为：

```ts
metadataStores: {
  mainMetadata: {
    type: 'database',
    connection: 'main',
    tableName: 'main__nocobase_collection_metadata',
  },
}
```

这个 `tableName` 只配置 Metadata Store 自身的内部系统表，不会重新引入普通 Collection 的任意
`tableName` 映射。两个配置如果最终指向同一张物理 Metadata 表，它们表示同一个 Store，而不是两个
独立 Metadata 空间。

## Module Metadata Store

外部数据库可以显式配置纳入源码管理的 TypeScript Metadata 文件：

```ts
import { defineCollectionMetadata } from '@nocobase/db';

export default defineCollectionMetadata({
  version: 1,
  name: 'orders',
  title: 'Orders',
  relations: {
    customer: {
      type: 'belongsTo',
      target: 'customers',
      foreignKey: 'customerId',
      targetKey: 'id',
    },
  },
});
```

`ModuleCollectionMetadataStore` 接收模块已经导入的文档数组，并在初始化时对全部文档执行
严格 V1 校验和重复名称检查：

```ts
const store = new ModuleCollectionMetadataStore({
  documents: [ordersMetadata, customersMetadata],
  source: 'src/collection-metadata.ts',
});
```

运行时将 TypeScript 应用源码视为只读：

```ts
capabilities: {
  writable: false,
  optimisticConcurrency: false,
}
```

Agent 或开发者修改源文件，通过源码管理审查变更，然后重载应用。运行时代码不会重写 TypeScript
文件；`put()` 和 `delete()` 抛出稳定 code `METADATA_STORE_READ_ONLY`，并在配置了 `source` 时指出应
编辑的源文件。该后端使用规范化文档内容的 SHA-256 作为稳定只读 revision；对象属性顺序不同不会
改变 revision。

## Writable File Metadata Store

Writable JSON/YAML File Metadata Store **尚未实现**。如果未来需要运行时写入文件，应增加独立后端，并定义明确的原子写入和 revision
行为。后端应先写临时文件、刷新数据，再在平台支持时原子替换旧文件。

它不能改变只读 Module Metadata Store 的语义。自动生成的 `*.schema.json` 仍然是 Schema Snapshot，
不归该后端管理。

## In-memory Metadata Store

In-memory 后端适合测试、临时工具和显式指定的短期开发场景。它不是安全的生产默认值，因为重启后
Metadata 会丢失。

建议默认规则：

```text
托管的主 Connection      Database Metadata Store
外部 Connection          显式 Module/File Store，或显式的空只读 Metadata
测试                     In-memory Metadata Store
```

生产配置不能静默回退到 In-memory Store。

这里的 `capabilities.writable` 只表示 Metadata 文档后端是否支持 `put()` 和 `delete()`。它不表示
Collection 中的业务记录是否可写；记录写权限由 Query/Repository 和权限系统控制，物理 DDL 则由
`schemaManagement` 控制。

## Store 与 Connection 的关系

一个 Store 代表一个逻辑数据库的 Metadata 空间。当多个物理 Connection 指向同一逻辑 Schema 时，
可以共享 Store：

```text
mainWrite --+
            +-> Main Database Metadata Store
mainRead  --+
```

Metadata 文档内不保存 `connection`、`dataSourceKey` 或 `namespace`，因为 Store 实例本身已经是
数据边界。

当前 API 通过复用同一个 Store 实例显式表达共享关系：

```ts
const mainMetadata = new DatabaseCollectionMetadataStore({
  resolveClient: async () => mainConnection.client(),
});
const crmMetadata = new ModuleCollectionMetadataStore({
  documents: crmCollectionMetadata,
});

const db = createDatabaseManager({
  connections: {
    mainWrite: {
      dialect: 'postgres',
      metadataStore: mainMetadata,
    },
    mainRead: {
      dialect: 'postgres',
      metadataStore: mainMetadata,
    },
    crm: {
      dialect: 'postgres',
      metadataStore: crmMetadata,
    },
  },
});
```

`metadataStores` 命名注册表与字符串引用仍是后续设计，当前配置不接受这种声明式写法。

共享 Store 的 Connection 必须使用兼容的命名配置，并指向兼容的物理 Schema。启动校验如果发现不兼容配置，
应直接拒绝启动，而不是将同一逻辑 Metadata 文档解析为不同物理对象。

## 相关文档

- [Metadata Store 设计](./store.md)
- [Collection 解析生命周期](../collection/resolution-lifecycle.md)
- [数据库配置](../../reference/database-config.md)
