# `@nocobase/db`

`@nocobase/db` 提供多数据库连接管理、Collection Schema Builder、Query Adapter、Transaction、Migration、Seed、Schema Inspector 和 Collection Metadata。

所有公开 API 都从包根入口导入；不要从源码深路径或 `internal/` 导入。

## 文档入口

- [整体概览](./docs/zh-CN/overview.md)
- [快速开始](./docs/zh-CN/quick-start.md)
- [核心概念](./docs/zh-CN/concepts/README.md)
- [AI Agent 数据库开发入口](./docs/zh-CN/agent/index.md)
- [Agent 任务路由](./docs/zh-CN/agent/task-router.md)
- [DatabaseManager](./docs/zh-CN/database/database-manager.md)
- [DatabaseConnection](./docs/zh-CN/database/database-connection.md)
- [Builder](./docs/zh-CN/builder/overview.md)
- [QueryAdapter](./docs/zh-CN/query/overview.md)
- [Collections](./docs/zh-CN/collections/overview.md)
- [Schema Inspector](./docs/zh-CN/schema-inspector/overview.md)
- [Migration](./docs/zh-CN/migration/overview.md)
- [Seed](./docs/zh-CN/seed/overview.md)
- [Collection Metadata](./docs/zh-CN/collection-metadata/overview.md)
- [API 索引](./docs/zh-CN/reference/api-index.md)

维护 `@nocobase/db` 底层实现时再进入[内部实现文档](./docs/zh-CN/internals/README.md)。[未来提案](./docs/zh-CN/proposals/README.md)和尚未删除但具有追溯价值的[历史归档](./docs/zh-CN/archive/README.md)都不是当前 API 合同，不能据此生成生产代码。

## 创建数据库入口

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

完整验证和多方言选择见 [Agent 验证指南](./docs/zh-CN/agent/verification.md)。

## 当前边界

- Repository、Select AST、Filter Builder、Filter AST 和 Sort AST 是未来提案，当前不可调用。
- QueryAdapter 是数据库层查询接口，不读取 Collection Metadata。
- `connection.client()` 是底层 adapter 逃生口，不是常规数据库入口。
