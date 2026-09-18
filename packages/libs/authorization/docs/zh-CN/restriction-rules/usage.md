# Restriction Rules

Restriction Rules 为指定主体增加必须满足的对象范围限制。它只缩小访问范围，不会产生
新的动作权限或扩大已有范围。

## 安装

```ts
import { restrictionRules } from '@nocobase/authorization/restriction-rules';

const authz = createAuthorization({
  plugins: [grantProvider, restrictionRules({ store }), resourceAuthorization],
});
```

本包只定义 Store 契约 `RestrictionRuleStore`，插件必须由调用方提供一个 Store，本包不带任何存储
实现，也不依赖 `@nocobase/db`。`@nocobase/app-plugin-authz-restriction-rules` 提供数据库 Store，
并与创建下面这些表的 migration 一起发布：

- `authorizationRestrictionRules`
- `authorizationRestrictionRuleAssignments` 保存适用主体

## 创建限制规则

限制外部协作者只能读取和修改自己拥有的订单：

```ts
await authz.restrictionRules.create({
  key: 'contractor-owned-orders',
  title: '外部协作者只能操作自己的订单',
  resource: {
    type: 'database.collection',
    id: 'orders',
  },
  actions: [
    { action: 'read', scope: authz.db.scope('recordsIOwn') },
    { action: 'update', scope: authz.db.scope('recordsIOwn') },
  ],
  subjects: [{ type: 'role', id: 'contractor' }],
});
```

限制指定用户只能访问一组对象：

```ts
await authz.restrictionRules.create({
  key: 'temporary-order-access',
  resource: {
    type: 'database.collection',
    id: 'orders',
  },
  actions: [
    {
      action: 'read',
      scope: { type: 'ids', ids: ['order-1', 'order-2'] },
    },
  ],
  subjects: [{ type: 'user', id: 'temporary-reviewer' }],
});
```

## 适用主体

`subjects` 可以使用当前请求中已经验证的用户、角色、团队或部门：

```ts
subjects: [
  { type: 'role', id: 'contractor' },
  { type: 'department', id: 'external-partners' },
];
```

匹配任一主体后，该规则就会加入本次授权。多条 Restriction Rule 同时生效时，资源
Handler 应同时满足这些限制。

## 管理规则

```ts
const rule = await authz.restrictionRules.get('contractor-owned-orders');
const rules = await authz.restrictionRules.list();

await authz.restrictionRules.update('contractor-owned-orders', updatedRule);

await authz.restrictionRules.delete('contractor-owned-orders');
```

## 授权结果

Restriction Rules 返回 `effect: "restrict"` 的访问约束。它不能让缺少 Action Grant 的
请求通过，也不能作为唯一的正向对象范围。

以 Database Authorization 为例：

```text
(Grant Record Access OR Default Access OR Sharing Rules)
AND Restriction Rules
```

## HTTP API

插件在安装时把自己的管理路由注册到 `authz.routes`，应用只需要挂载一个分发器（见
Core 文档的 `routes`）。处理器会先用请求级 Authorization 检查
`settings/authorization.restriction-rules` 的相应权限，拒绝时返回 `403 FORBIDDEN`，请求体不合法时
返回 `400 INVALID_AUTHORIZATION_INPUT`。

可用端点：

| Method | Path                      | 用途                  |
| ------ | ------------------------- | --------------------- |
| GET    | `/restriction-rules`      | 列出 Restriction Rule |
| POST   | `/restriction-rules`      | 创建（返回 201）      |
| PUT    | `/restriction-rules/:key` | 更新                  |
| DELETE | `/restriction-rules/:key` | 删除（返回 204）      |

## 自定义 Store

测试或使用其他持久化方案时，可以实现 `RestrictionRuleStore`：

```ts
const plugin = restrictionRules({
  store: customRestrictionRuleStore,
});
```

`store` 是必填项。

Store 接口都要求实现 `withTransaction(transaction)`：它返回一个绑定到调用方事务的
Store，事务由调用方开启并提交。事务句柄的类型由 Store 自己声明——数据库 Store 用它自己的
连接类型，内存 Store 没有事务，直接返回自身即可。

对应的 API 同样提供 `authz.restrictionRules.withTransaction(connection)`，返回绑定该事务的 API。
