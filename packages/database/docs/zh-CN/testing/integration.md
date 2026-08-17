# 集成测试

`test/integration` 是真实数据库连接测试，不是 mock，也不是 SQLite 专属目录。

同一批 Collection Builder 用例可以跑在：

- SQLite
- PostgreSQL
- MySQL

## 默认测试

默认使用内存 SQLite：

```bash
npm run test:integration
```

## 覆盖率

```bash
npm run test:coverage
```

覆盖率统计只包含 `src/**/*.ts` 中有运行时行为的源码，不包含 `src/index.ts`、`src/types.ts`、`dist` 和测试文件。

## 启动真实数据库

```bash
npm run test:db:up
```

这会启动 Docker Compose 中的 PostgreSQL 和 MySQL。

默认端口：

```text
PostgreSQL: 127.0.0.1:15432
MySQL:      127.0.0.1:13306
```

## 全矩阵测试

```bash
npm run test:integration:all
```

等价于：

```bash
INTEGRATION_DB_CONNECTIONS=all vitest run test/integration
```

## 指定数据库

```bash
INTEGRATION_DB_CONNECTIONS=postgres npm run test:integration
INTEGRATION_DB_CONNECTIONS=mysql npm run test:integration
INTEGRATION_DB_CONNECTIONS=postgres,mysql npm run test:integration
```

也可以使用 `DB_CONNECTION` 指定单个连接：

```bash
DB_CONNECTION=postgres npm run test:integration
```

## 清理数据库

```bash
npm run test:db:down
```

## 测试设计

Integration helper 会为每个测试生成唯一表名前缀，避免并行测试互相影响。测试结束后会清理该前缀下的表和视图。

真实测试覆盖：

- create collection
- alter collection
- relations
- constraints and indexes
- view collection
- metadata-only updates
- apply and dryRun
- rename collection

## Agent 注意事项

- 修改 Builder 编译或 adapter 行为后，应跑 `npm run test:integration:all`。
- SQLite 通过不代表 PostgreSQL/MySQL 一定通过。
- 方言问题应优先通过真实集成测试验证。
