# Agent 开发指南

这份指南面向会读写本仓库代码和文档的 Agent。

## DSL 选择

Agent 的推荐 DSL 取决于输出载体：

- 写 migration 文件、插件代码或其他 TypeScript 代码时，优先使用 Fluent DSL。
- 调用 HTTP API、CLI，或生成 `collection.json` 这类可序列化配置时，优先使用 Object DSL。
- 做 file sync、snapshot diff、执行计划审计或批量 apply 时，优先使用 `CollectionOperation[]`。

## Builder 规则

- 写 Builder schema 代码时使用逻辑名。
- 写当前可运行代码时不要调用 `db.repository()` 或 `connection.repository()`；Repository 是规划接口，尚未实现。
- 表名和列名按 effective naming 确定性生成；不要写 `tableName`、`columnName` 或自定义 naming strategy。
- 默认使用 `underscored: true`；需要保留 camelCase 物理名时可在 Connection 或 Collection 配置 `underscored: false`。
- 只有表前缀不同时才配置 `naming.tablePrefix`。
- 关系参数引用 Collection 或 Field 的 `name`，不要把 `foreignKey()`、`targetKey()`、`through()` 当作物理名配置。
- 重要 index、constraint 建议显式命名；未命名时 Builder 会生成稳定名称，过长会截断加哈希。
- 只补充 `title`、`description` 等应用元信息时，使用 metadata-only API，不要调用 `createCollection` 或 `alterCollection`。

## 数据库配置规则

- 用户配置必须写 `dialect`。
- 用户配置里的 `driver` 是底层 Node.js 数据库驱动，通常不写。
- `sqlite` 默认 driver 是 `better-sqlite3`。
- `postgres` 默认 driver 是 `pg`。
- `mysql` 默认 driver 是 `mysql2`。
- 不在用户配置中写 `adapter`、`client` 或 `connection`。
- 常用连接参数平铺，例如 `filename`、`host`、`port`、`database`、`username`、`password`、`ssl`、`charset`。
- 用户配置使用 `username`，不使用底层 driver 的 `user`。
- 当前不提供连接 URL 配置方式，不生成 `url`、`connectionString` 或 `uri`。
- MySQL 的 `socketPath` 可以和 `database`、`username`、`password` 一起使用，但不要和 `host`、`port` 混用。
- `driverOptions` 只放非常规底层参数，不放常用连接参数。
- 判断数据库类型使用 `connection.dialect`，不要使用 `connection.driver`。
- 只有 driver-specific 逻辑才读取 `connection.driver`。
- 外部 Schema 配置 `schemaManagement: 'external'`；它禁止 DDL 和 Migration，但不禁止 Query API 的记录读写。
- `connection.client()` 返回当前 adapter client；默认 Knex adapter 下返回 Knex 实例。
- `connection.client()` 会绕过 Schema guard，不能用它规避 `schemaManagement: 'external'`。

## Migration 规则

生成 migration 文件或维护 migration runner 时遵守以下规则：

- 只生成 `export default defineMigration({})`。
- 文件内只保留 default export，不添加 named export、`module.exports` 或 class migration。
- `name` 必须显式声明，并和文件名主体保持一致。
- 常规结构变更使用 `builder`。
- 数据迁移使用 `query`。
- 不在 migration context 顶层使用或暴露 `schema`。
- 底层 adapter client 兜底只通过 `connection.client()`。
- `dialect` 和 `capabilities` 只通过 `connection` 访问。
- 普通 migration 不显式写 `transaction`，默认由 runner 使用 `transaction: 'auto'`。
- 使用 `connection.client()` 的特殊 migration 应显式判断 `connection.dialect` 或 `connection.capabilities`。
- 没有 `down` 时必须声明 `irreversible: true`，不要生成虚假的 rollback。
- Runner 应在事务连接内创建 context，确保 `builder`、`query`、`connection.client()` 和 history 写入共享同一个事务。
- 插件 package 的 migration 通过 `sources` 注册，并使用 package 的 `package.json.name` 作为 `packageName`。
- 所有来源的 migration 按全局 `name` 排序，`name` 必须全局唯一；`packageName` 只用于归属、历史记录和诊断。
- 旧的单目录 `directory` API 默认使用 `packageName: 'app'`。

## Seed 规则

- 插件安装默认数据放在 package 自己的 `database/seeds/`。
- 上层安装器必须先执行 migrations，再执行 seeds。
- 只生成 `export default defineSeed({})`，文件名主体和 `name` 完全一致。
- Seed 使用 `query` 写数据，不使用 `builder` 修改数据库结构。
- Seed context 顶层只使用 `query` 和 `connection`。
- 所有 package 的 seed `name` 全局唯一，并按 `name` 排序；`packageName` 只用于归属和历史。
- 已发布 seed 不修改、不插队；默认数据变化时新增更晚的 seed。
- Seed 应幂等，并以稳定业务 key 和数据库唯一约束防止重复数据。
- Seed 失败时不写历史；不要生成 rollback、refresh 或 truncate 行为。

## Query 规则

- 写查询代码时，优先使用 `selectFrom()`、`insertInto()`、`updateTable()`、`deleteFrom()`。
- 查询执行使用 `execute()`、`executeTakeFirst()`、`executeTakeFirstOrThrow()`。
- 简单条件使用三参 `where(lhs, op, rhs)`。
- 复杂条件使用 `where((eb) => ...)`。
- 不要生成二参 `where(field, value)`。
- 不要生成 `orWhere()`、`whereIn()`、`whereNull()` 等 Knex 风格快捷方法。
- 不要生成 `orOn()`、`orOnRef()`；join 的 OR 条件使用 `join.on((eb) => eb.or([...]))`。
- 不要生成 raw SQL。
- 不要把 `db.query()` 当成 Collection Repository。
- `db.query()` 是数据库层 query identifier 接口，使用 Connection 的 `underscored` 和 `tablePrefix`，但不会读取 Collection 级 naming 覆盖。
- Query 表来源参数使用不带 Connection 前缀的相对标识符；完整物理表访问使用底层 connection client。
- 需要 Collection-aware 解析时等待或实现 Repository。

## Repository Select、Filter 和 Sort 规则

Repository、Select AST、Filter Builder、Filter AST 和 Sort AST 当前是规划设计，尚未
实现。写设计文档、示例或未来代码时遵守以下规则：

- 结果字段和 relation 使用 Select AST；标量字段放 `fields`，relation 放 `relations`。
- 嵌套 relation 递归写 relation 节点，不在 `fields` 中写 dot-string。
- TypeScript 代码优先使用 `filter: (filter) => ...` 的 Filter Builder。
- HTTP、CLI、file sync 或持久化配置可以使用 Filter AST。
- 不要使用 callable builder，例如 `filter('status')`。
- 不要使用简称方法，例如 `filter.rel()`、`filter.var()` 或 `f.and()`。
- 不要把旧的 object shorthand 当作 Repository V1 的主 API。
- 选择方法组前必须先根据 Collection metadata 确认终点字段类型。
- 字符串字段用 `filter.string()`，数字字段用 `filter.number()`，日期字段用 `filter.date()`。
- 日期条件使用 `on()`、`before()`、`notBefore()` 等日期方法，不要使用 number operator。
- to-one relation 可以使用 typed dot path，例如 `filter.id('createdBy.id')`。
- to-many relation 必须使用 `filter.relation().some()`、`none()`、`exists()`、`notExists()`、`empty()` 或 `notEmpty()`。
- 变量使用 `filter.variable('$user.id')`，Repository operation options 使用 `context`。
- Filter AST 中不写 raw SQL、tableName 或 columnName。
- 排序使用 Sort AST 的结构化 `items`，不使用字符串、tuple 或 object map 简写。
- 当前字段排序使用 `field`，纯 to-one path 使用 `relationField`，to-many 父级排序使用
  显式 `relationAggregate`。
- relation 返回数组的排序放在对应 Select relation 节点中。
- Select AST 和 Sort AST 中也不写 raw SQL、tableName、columnName 或方言 option。

## 测试规则

- 新增 Builder 行为时，通常需要同时补 `tests/unit/builder/` 和 `tests/integration/builder/`。
- 新增 Query 行为时，优先补 `tests/integration/query/`，因为 QueryAdapter 的价值在真实数据库行为。
- `tests/integration` 是真实数据库连接测试，不是 SQLite 专属。
- 修改 Builder 编译或 adapter 行为后，应跑 `npm run test:integration:all`。
- SQLite 通过不代表 PostgreSQL、MySQL、Oracle 或 SQL Server 一定通过。

## 文档规则

- 概念说明放 `concepts/`。
- 连接管理放 `database/`。
- Collection Builder 用法放 `builder/`。
- QueryAdapter 用法放 `query/`。
- Migration 用法和维护清单放 `migration/`。
- Seed 用法和维护清单放 `seed/`。
- Repository、Select AST、Filter 和 Sort AST 规划放 `repository/`。
- 开发维护说明放 `development/`。
- 纯 API 签名和类型说明放 `reference/`。

## 收口检查

常用验证命令：

```bash
npm run typecheck
npm test
npm run test:integration
npm run test:coverage
npm run build
```

完整真实数据库矩阵：

```bash
npm run test:db:up
npm run test:integration:all
npm run test:db:down
```
