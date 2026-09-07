---
title: createDatabaseManager()：创建 DatabaseManager
description: 配置默认连接、命名连接、数据库方言、命名和 Metadata Store，并创建应用级 DatabaseManager。
---

# `createDatabaseManager()`：创建 DatabaseManager

`createDatabaseManager(config)` 是运行时数据库入口，返回管理默认连接和命名连接的 `DatabaseManager`。

## 最小配置

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

## DatabaseConfig

```ts
interface DatabaseConfig {
  default?: string;
  connections: Record<string, ConnectionConfig>;
  metadataStore?: CollectionMetadataStore;
}
```

- `connections` 至少提供一个命名 Connection 配置。
- `default` 指定省略连接名时使用哪一个；省略时当前实现选择 `connections` 中的第一个名称。
- `metadataStore` 是所有 Connection 的默认补充 Metadata Store；Connection 级配置可以覆盖。

## 多连接

```ts
const db = createDatabaseManager({
  default: 'main',
  connections: {
    main: {
      dialect: 'postgres',
      host: '127.0.0.1',
      database: 'app',
      username: 'app',
      password: process.env.APP_DATABASE_PASSWORD,
    },
    analytics: {
      dialect: 'sqlite',
      filename: 'analytics.sqlite',
    },
  },
});

const main = db.connection();
const analytics = db.connection('analytics');
```

较长的命名连接代码先获取 `connection`，再通过它访问 Builder、Query、Collections 和事务。

## Lazy 行为与释放

`createDatabaseManager()` 不要求立即连接所有数据库。`db.connection()` 返回 lazy handle，实际数据库操作时才解析底层 client。测试、脚本或应用关闭时释放资源：

```ts
await db.destroy();
```

## `defineDatabase()` 的区别

```ts
const config = defineDatabase({
  connections: {
    main: { dialect: 'sqlite', filename: ':memory:' },
  },
});

const db = createDatabaseManager(config);
```

`defineDatabase()` 只提供配置类型辅助并原样返回输入，不创建 Manager 或 Connection。

各方言配置见[数据库连接配置](./connections.md)，完整类型见 [`DatabaseConfig`](../reference/database-config.md)。
