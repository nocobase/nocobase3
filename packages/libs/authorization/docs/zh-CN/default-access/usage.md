# Default Access

Default Access 为资源和动作设置默认对象范围。它只扩大已经获得对应 Action Grant 的
主体的访问范围，不会单独授予动作权限。

## 安装

```ts
import { defaultAccess } from '@nocobase/authorization/default-access';

const authz = createAuthorization({
  plugins: [grantProvider, defaultAccess({ store }), resourceAuthorization],
});
```

本包只定义 Store 契约 `DefaultAccessStore`，插件必须由调用方提供一个 Store，本包不带任何存储
实现，也不依赖 `@nocobase/db`。`@nocobase/app-plugin-authz-default-access` 提供数据库 Store，
并与创建下面这些表的 migration 一起发布：

- `authorizationDefaultAccessRules`

显式记录 ID 与每个 Action 的范围一起保存在规则表的 `actions` JSON 中；同一动作的不同 `scopeKey` 保留各自的 ID。

## 设置默认范围

允许所有已获得文章读取权限的主体读取全部文章：

```ts
await authz.defaultAccess.set({
  resource: {
    type: 'database.collection',
    id: 'articles',
  },
  actions: [{ action: 'read', scope: { type: 'all' } }],
});
```

也可以设置指定对象范围：

```ts
await authz.defaultAccess.set({
  resource: {
    type: 'document.library',
    id: 'help-center',
  },
  actions: [
    {
      action: 'read',
      scope: { type: 'ids', ids: ['getting-started', 'faq'] },
    },
  ],
});
```

资源插件可以提供自己的 Scope 构造方法。Database Authorization 可以使用 Record
Access Policy：

```ts
await authz.defaultAccess.set({
  resource: {
    type: 'database.collection',
    id: 'articles',
  },
  actions: [
    {
      action: 'read',
      scope: authz.db.scope('publishedArticles'),
    },
  ],
});
```

## 管理配置

```ts
const rule = await authz.defaultAccess.get('database.collection', 'articles');

const rules = await authz.defaultAccess.list();

await authz.defaultAccess.delete('database.collection', 'articles');
```

再次调用 `set()` 会更新相同 Resource Type 和 Resource ID 的配置。

## 授权结果

Default Access 返回 `effect: "expand"` 的访问约束。资源 Handler 决定如何解释和执行
具体 Scope。

以 Database Authorization 为例，默认范围会与 Grant Record Access、Sharing Rules
一起组成正向记录范围，之后再应用 Restriction Rules。

## HTTP API

插件在安装时把自己的管理路由注册到 `authz.routes`，应用只需要挂载一个分发器（见
Core 文档的 `routes`）。处理器会先用请求级 Authorization 检查
`settings/authorization.default-access` 的相应权限，拒绝时返回 `403 FORBIDDEN`，请求体不合法时
返回 `400 INVALID_AUTHORIZATION_INPUT`。

可用端点：

| Method | Path                        | 用途               |
| ------ | --------------------------- | ------------------ |
| GET    | `/default-access`           | 列出默认访问配置   |
| PUT    | `/default-access`           | 新建或更新一条配置 |
| DELETE | `/default-access/:type/:id` | 删除某个资源的配置 |

`PUT` 是 upsert：配置已存在时检查 `update` 权限，不存在时检查 `create`。

## 自定义 Store

测试或使用其他持久化方案时，可以实现 `DefaultAccessStore`：

```ts
const plugin = defaultAccess({
  store: customDefaultAccessStore,
});
```

`store` 是必填项，应用需要自行负责数据结构和生命周期。

Store 接口都要求实现 `withTransaction(transaction)`：它返回一个绑定到调用方事务的
Store，事务由调用方开启并提交。事务句柄的类型由 Store 自己声明——数据库 Store 用它自己的
连接类型，内存 Store 没有事务，直接返回自身即可。

对应的 API 同样提供 `authz.defaultAccess.withTransaction(connection)`，返回绑定该事务的 API。
