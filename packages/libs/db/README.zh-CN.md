# `@nocobase/db`

`@nocobase/db` 提供多数据库连接管理、Collection Schema Builder、Query Adapter、Transaction、Migration、Seed、Schema Inspector 和 Collection Metadata。

所有公开 API 都从包根入口导入；不要从源码深路径或 `internal/` 导入。

## 文档入口

- 第一次使用：阅读[整体概览](./docs/zh-CN/overview.md)和[快速开始](./docs/zh-CN/quick-start.md)。
- 按任务选择入口：阅读[任务路由](./docs/zh-CN/agent/task-router.md)。
- 按公开能力深入：阅读 [Database](./docs/zh-CN/database/overview.md)、[Builder](./docs/zh-CN/builder/overview.md)、[Query](./docs/zh-CN/query/overview.md)、[Migration](./docs/zh-CN/migration/overview.md) 或 [Seed](./docs/zh-CN/seed/overview.md)。
- 按名称查找 API：阅读[公开 API 导航](./docs/zh-CN/reference/api-index.md)，并以 TypeScript 类型声明为最终依据。
- 浏览全部页面：查看[完整文档目录](./docs/zh-CN/toc.md)。

维护 `@nocobase/db` 底层实现时再进入[内部实现文档](./docs/zh-CN/internals/README.md)。[未来提案](./docs/zh-CN/proposals/README.md)和尚未删除但具有追溯价值的[历史归档](./docs/zh-CN/archive/README.md)都不是当前 API 合同，不能据此生成生产代码。

## 创建数据库入口

推荐在应用边界显式安装并注册所需的 dialect 包：

```ts
import postgres from '@nocobase/db-postgres';
import { createDatabaseManager } from '@nocobase/db';

const db = createDatabaseManager({
  drivers: { postgres },
  connections: {
    main: {
      dialect: 'postgres',
      host: process.env.DB_HOST,
      database: process.env.DB_NAME,
    },
  },
});
```

也可以直接使用 dialect 工厂。工厂会把 `dialect`、native `driver` 和
`databaseDriver` descriptor 一起绑定到连接：

```ts
const db = createDatabaseManager({
  connections: {
    main: postgres({
      host: process.env.DB_HOST,
      database: process.env.DB_NAME,
    }),
  },
});
```

SQLite、MySQL、Oracle 和 SQL Server 分别从
`@nocobase/db-sqlite`、`@nocobase/db-mysql`、`@nocobase/db-oracle` 和
`@nocobase/db-mssql` 引入。`@nocobase/db` 不包含任何具体 dialect 的连接、
Inspector 或 native driver 实现；使用某个方言前必须安装对应的包。

Dialect 标识是开放的。第三方 Dialect package 可以定义自己的连接字段，并通过
`ExtensibleDatabaseConfig<TConnection>` 传入 `createDatabaseManager()`；新增 package
不需要修改 `@nocobase/db` 的 Dialect union、Manager、Query、Repository 或 Schema
adapter。应用侧只需安装并注册该 package 的 driver。

```ts
import sqlite from '@nocobase/db-sqlite';
import { createDatabaseManager } from '@nocobase/db';

const db = createDatabaseManager({
  default: 'main',
  connections: {
    main: sqlite({ filename: ':memory:' }),
  },
});

const connection = db.connection();
console.log(connection.dialect);

await db.destroy();
```

持久化业务 Schema 变更应通过 Migration 中的 Builder 完成，数据读写通过 Query 完成。完整闭环见[快速开始](./docs/zh-CN/quick-start.md)。

## 运行示例

Managed Collection 生命周期：

```bash
pnpm --filter @nocobase/db example managed
```

External Schema 与 Module Metadata：

```bash
pnpm --filter @nocobase/db example external
```

## 验证

```bash
pnpm --filter @nocobase/db check
pnpm --filter @nocobase/db test:integration
```

完整验证和多方言选择见[验证指南](./docs/zh-CN/agent/verification.md)。

## 当前边界

- Repository、Select AST、Filter Builder、Filter AST 和 Sort AST 是未来提案，当前不可调用。
- QueryAdapter 是数据库层查询接口，不读取 Collection Metadata。
- `connection.client()` 是底层 adapter 逃生口，不是常规数据库入口。
