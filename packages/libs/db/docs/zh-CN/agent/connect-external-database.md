---
title: 接入外部数据库
description: Agent 通过 external Connection、Schema Inspector、Module Metadata、Collections 和 Query 接入已有数据库的完整流程。
---

# 接入外部数据库

外部数据库的物理 Schema 由其他系统管理。NocoBase 读取其物理结构，叠加补充 Metadata，解析为完整 Collection；运行时仍可通过 Query 读取或写入记录。

## 配置 Connection 和 Metadata Store

```ts
import {
  createDatabaseManager,
  ModuleCollectionMetadataStore,
} from '@nocobase/db';
import { externalMetadataDocuments } from './metadata.js';

const db = createDatabaseManager({
  default: 'external',
  connections: {
    external: {
      dialect: 'postgres',
      host: '127.0.0.1',
      port: 5432,
      database: 'crm',
      username: 'crm_reader',
      password: process.env.CRM_DATABASE_PASSWORD,
      schemaManagement: 'external',
      naming: { underscored: true, tablePrefix: 'crm_' },
      metadataStore: new ModuleCollectionMetadataStore({
        documents: externalMetadataDocuments,
        source: 'database/metadata.ts',
      }),
    },
  },
});
```

External Connection 必须显式提供 Metadata Store。Module Store 适合源码管理的静态文档，并且在运行时只读。

## 声明补充 Metadata

```ts
import { defineCollectionMetadata } from '@nocobase/db';

export const externalMetadataDocuments = [
  defineCollectionMetadata({
    version: 1,
    name: 'orders',
    title: 'CRM orders',
    fields: {
      orderNo: { title: 'Order number' },
    },
  }),
];
```

## 验证和使用

```ts
const connection = await db.connect('external');

const physicalSchemas = await connection.schemaInspector.listSchemas();
const orders = await connection.collections.get('orders');
const rows = await connection.query
  .selectFrom('orders')
  .select(['orderNo', 'status'])
  .execute();
```

## 能力边界

| 操作                | External Connection             |
| ------------------- | ------------------------------- |
| Query 记录读写      | 支持，实际权限由数据库账号决定  |
| Schema Inspector    | 支持                            |
| Collection 解析     | 支持，需要 Metadata Store       |
| Metadata 写入       | 取决于 Store；Module Store 只读 |
| Builder 真实 DDL    | 禁止                            |
| Migration           | 禁止                            |
| `client()` 直接 DDL | 不得用于绕过保护                |

## 完成条件

- Connection 使用 `schemaManagement: 'external'`。
- Metadata Store 已显式配置并符合读写需求。
- Schema Inspector 能读取目标物理对象。
- Collections 能按逻辑名解析目标 Collection。
- Query 已通过实际数据库账号权限验证。
- 测试确认 Builder/Migration DDL 被拒绝。

仓库中有可运行示例：`packages/libs/db/examples/external-module-metadata`。
