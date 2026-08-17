# Agent 开发指南

这份指南面向会读写本仓库代码和文档的 Agent。

## DSL 选择

Agent 的推荐 DSL 取决于输出载体：

- 写 migration 文件、插件代码或其他 TypeScript 代码时，优先使用 Fluent DSL。
- 调用 HTTP API、CLI，或生成 `collection.json` 这类可序列化配置时，优先使用 Object DSL。
- 做 file sync、snapshot diff、执行计划审计或批量 apply 时，优先使用 `CollectionOperation[]`。

## Builder 规则

- 写 Builder schema 代码时使用逻辑名。
- 只有确实需要绑定物理数据库对象时才写 `tableName` 或 `columnName`。
- `tableName`、`columnName` 是物理名，不要再参与命名转换。
- 关系参数引用 Collection 或 Field 的 `name`，不要把 `foreignKey()`、`targetKey()`、`through()` 当作物理名配置。
- 重要 index、constraint 建议显式命名；未命名时 Builder 会生成稳定名称，过长会截断加哈希。
- 只补充 `title`、`description`、`uiSchema` 等应用元信息时，使用 metadata-only API，不要调用 `createCollection` 或 `alterCollection`。

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
- 需要 `field.name -> columnName` 的查询映射时，等待或实现 Repository，而不是让 `db.query()` 读取 Collection metadata。

## Repository Filter 规则

Repository 和 Repository Filter Builder 当前是规划设计，尚未实现。写设计文档、示例或未来代码时遵守以下规则：

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

## 测试规则

- 新增 Builder 行为时，通常需要同时补 `test/unit/builder/` 和 `test/integration/builder/`。
- 新增 Query 行为时，优先补 `test/integration/query/`，因为 QueryAdapter 的价值在真实数据库行为。
- `test/integration` 是真实数据库连接测试，不是 SQLite 专属。
- 修改 Builder 编译或 adapter 行为后，应跑 `npm run test:integration:all`。
- SQLite 通过不代表 PostgreSQL/MySQL 一定通过。

## 文档规则

- 概念说明放 `concepts/`。
- 连接管理放 `database/`。
- Collection Builder 用法放 `builder/`。
- QueryAdapter 用法放 `query/`。
- Repository 和 Repository Filter 规划放 `repository/`。
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
