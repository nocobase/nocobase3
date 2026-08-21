# 数据库与 Migration

authentication 使用 NocoBase Database 实现 Better Auth 的持久化。应用必须先
完成认证表 migration，再接受认证请求。

## 表结构

内置 migration 创建四个 Collection：

| Collection     | 用途                                          |
| -------------- | --------------------------------------------- |
| `user`         | 用户名、邮箱、名称、头像和邮箱验证状态        |
| `session`      | Session token、过期时间、客户端信息和所属用户 |
| `account`      | 密码或外部身份提供者账号、token 和所属用户    |
| `verification` | 邮箱验证、密码重置等短期验证值                |

主要唯一约束包括：

- `user.username`
- `user.email`
- `session.token`
- `account(issuer, accountId)`

session、account 和 verification 的常用查询字段带有索引。

## 使用内置 migration

服务端入口导出：

```ts
import { authenticationMigration } from "@nocobase/authentication/server";
```

它是标准 `MigrationDefinition`，可以交给使用 `@nocobase/database` 的 migration
runner。具体注册方式取决于应用如何发现 migration。

默认应用模板选择将 migration 源文件复制到自己的 `server/migrations` 目录：

```text
server/migrations/
  202608200001_create_authentication_tables.ts
```

这种方式让应用构建产物独立拥有数据库历史，不要求部署时扫描依赖包源码。如果
应用采用集中式 migration registry，也可以直接注册导出的 definition。两种方式
只能选一种，避免同名 migration 被重复发现。

## 不创建物理外键

内置 migration 不在 `session.userId` 和 `account.userId` 上创建物理 foreign
key。认证关系由 Better Auth 管理，索引用于保持查询效率。

不要在不了解删除语义和跨数据库行为的情况下自行补外键。物理外键会改变用户
删除、migration 回滚、数据导入和不同数据库方言下的行为。

## 命名策略

database adapter 使用 Collection 和 Field 的逻辑名，通过 NocoBase Database
解析物理表名和列名。当前实现覆盖 `underscored: true` 和
`underscored: false`。

例如在下划线命名策略下：

```text
emailVerified -> email_verified
userId -> user_id
expiresAt -> expires_at
```

应用代码和 Better Auth schema 仍使用逻辑字段名。

## Database adapter 边界

`databaseAdapter(connection)` 返回 Better Auth `DBAdapterInstance`，支持：

- create、findOne、findMany；
- update、updateMany；
- delete、deleteMany；
- count；
- transaction；
- 原子 consume 和 increment fallback。

当前 adapter 不支持 Better Auth join 查询。收到 join 请求时会明确报错，而不是
静默执行不完整查询。

大小写不敏感条件会先通过 NocoBase Query API 解析逻辑名称，再使用底层数据库
client 完成 `lower(...)` 比较。邮箱和用户名登录因此可以进行不区分大小写的
凭据匹配。

## 扩展 Better Auth schema

增加 Better Auth 插件前，需要同时检查：

1. 插件是否增加 model 或字段；
2. 应用 migration 是否创建对应结构；
3. adapter 是否支持插件需要的查询能力；
4. upgrade 和 rollback 是否有明确迁移路径；
5. SQLite、PostgreSQL 和 MySQL 是否保持一致语义。

只在 `plugins` 中加入插件并不会自动修改生产数据库结构。
