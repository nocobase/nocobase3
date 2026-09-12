---
title: Database 配置
description: 选择默认连接、数据库方言、Schema 管理模式、命名规则和 Metadata Store；精确配置类型以 TypeScript 声明为准。
---

# Database 配置

`DatabaseConfig` 描述一个 Manager 及其命名连接。配置从 `createDatabaseManager()` 或 `defineDatabase()` 进入；精确字段、方言联合类型和回调签名以 TypeScript 声明为准。

## 创建最小配置

```ts
import { createDatabaseManager } from '@nocobase/db';

const db = createDatabaseManager({
  default: 'main',
  connections: {
    main: {
      dialect: 'sqlite',
      filename: ':memory:',
    },
  },
});
```

`connections` 以名称区分数据库连接。`default` 指定 Manager 快捷方法使用的连接；省略时，当前实现使用配置中的第一个连接。应用配置应显式指定 `default`，避免连接顺序变化影响行为。

## 选择方言配置

| 方言       | 默认驱动         | 关键配置                                                              |
| ---------- | ---------------- | --------------------------------------------------------------------- |
| SQLite     | `better-sqlite3` | `filename` 必填；内存数据库使用 `:memory:`                            |
| PostgreSQL | `pg`             | 支持 host/port/database/username/password、`schema` 和 `ssl`          |
| MySQL      | `mysql2`         | host/port 与 `socketPath` 二选一；支持 `charset`、`timezone` 和 `ssl` |
| Oracle     | `oracledb`       | `serviceName` 必填；host 和 port 用于组成连接地址                     |
| SQL Server | `tedious`        | 支持 `encrypt` 和 `trustServerCertificate`                            |

通常只配置 `dialect`，让 DB 包选择匹配的 `driver`。显式填写 `driver` 时必须与方言匹配。完整必填项和允许值由对应的 `SqliteConnectionConfig`、`PostgresConnectionConfig`、`MysqlConnectionConfig`、`OracleConnectionConfig` 和 `MssqlConnectionConfig` 类型约束。

所有方言都使用 `username`；DB 包负责转换为底层驱动需要的属性。当前不提供统一连接 URL 配置。

## 声明 Schema 所有权

`schemaManagement` 决定 NocoBase 是否拥有连接的物理 Schema：

| 模式       | 适用场景                     | Schema 行为                                                   |
| ---------- | ---------------------------- | ------------------------------------------------------------- |
| `managed`  | NocoBase 管理的数据库        | 允许 Builder DDL 和 Migration；这是默认值                     |
| `external` | 已有或由其他系统管理的数据库 | 拒绝真实 Builder DDL 和 Migration；仍允许 dry-run 和 SQL 预览 |

该选项不等于数据只读。External Connection 是否能查询或写入记录，取决于数据库账号权限和上层 ACL。`connection.client()` 不经过高层 Schema guard，不得用它绕过所有权边界。

## 配置命名和能力

- `naming` 设置 Connection 级 `underscored` 和 `tablePrefix` 默认值。完整规则见[命名概念](../concepts/naming/overview.md)。
- `capabilities` 只用于明确覆盖数据库能力判断，不应作为日常配置猜测方言支持情况。
- `debug`、`pool` 和 `driverOptions` 用于连接诊断或底层驱动扩展。

常用连接参数应使用方言配置的顶层字段。只有当前类型尚未覆盖的驱动参数才放入 `driverOptions`；不要在其中放 `connectionString`、`uri`、`adapter`、`client` 或另一份连接配置。

## 配置 Metadata Store

`metadataStore` 可以设在 Manager 或单个 Connection 上，Connection 级配置优先：

```ts
import {
  createDatabaseManager,
  InMemoryCollectionMetadataStore,
} from '@nocobase/db';

const metadataStore = new InMemoryCollectionMetadataStore();

const db = createDatabaseManager({
  metadataStore,
  connections: {
    main: {
      dialect: 'sqlite',
      filename: ':memory:',
    },
  },
});
```

- Managed Connection 未显式配置时，自动使用数据库内部表持久化 Metadata。
- External Connection 必须显式提供 Metadata Store。
- `onCollectionMetadataInvalidationError` 只处理 Metadata 已提交后发生的缓存失效错误；它不会回滚已持久化的文档。

Store 的选择和读写边界见 [Collection Metadata](../collection-metadata/overview.md)。

## 只定义配置

`defineDatabase()` 是类型辅助函数，只返回输入，不创建 Manager：

```ts
import { createDatabaseManager, defineDatabase } from '@nocobase/db';

const config = defineDatabase({
  default: 'main',
  connections: {
    main: { dialect: 'sqlite', filename: ':memory:' },
  },
});

const db = createDatabaseManager(config);
```

需要运行时入口和生命周期说明时，继续阅读 [`createDatabaseManager()`](../database/create-database-manager.md)和 [DatabaseManager](../database/database-manager.md)。
