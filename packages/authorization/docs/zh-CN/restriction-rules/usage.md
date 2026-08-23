# Restriction Rules

Restriction Rules 为指定主体增加必须满足的对象范围限制。它只缩小访问范围，不会产生
新的动作权限或扩大已有范围。

## 安装

```ts
import { restrictionRules } from '@nocobase/authorization/restriction-rules';

const authorization = createAuthorization({
  connection,
  plugins: [grantProvider, restrictionRules(), resourceAuthorization],
});
```

使用默认数据库 Store 时，需要提供 `connection`，并执行 migration：

```text
@nocobase/authorization/restriction-rules/migrations/202608210004_create_restriction_rules
```

## 创建限制规则

限制外部协作者只能读取和修改自己拥有的订单：

```ts
await authorization.restrictionRules.create({
  key: 'contractor-owned-orders',
  title: '外部协作者只能操作自己的订单',
  resource: {
    type: 'database.collection',
    id: 'main.orders',
  },
  actions: ['read', 'update'],
  subjects: [{ type: 'role', id: 'contractor' }],
  scope: authorization.database.scope('recordsIOwn'),
});
```

限制指定用户只能访问一组对象：

```ts
await authorization.restrictionRules.create({
  key: 'temporary-order-access',
  resource: {
    type: 'database.collection',
    id: 'main.orders',
  },
  actions: ['read'],
  subjects: [{ type: 'user', id: 'temporary-reviewer' }],
  scope: {
    type: 'ids',
    ids: ['order-1', 'order-2'],
  },
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
const rule = await authorization.restrictionRules.get(
  'contractor-owned-orders',
);
const rules = await authorization.restrictionRules.list();

await authorization.restrictionRules.update(
  'contractor-owned-orders',
  updatedRule,
);

await authorization.restrictionRules.delete('contractor-owned-orders');
```

## 授权结果

Restriction Rules 返回 `effect: "restrict"` 的访问约束。它不能让缺少 Action Grant 的
请求通过，也不能作为唯一的正向对象范围。

以 Database Authorization 为例：

```text
(Grant Record Access OR Default Access OR Sharing Rules)
AND Restriction Rules
```

## 自定义 Store

测试或使用其他持久化方案时，可以实现 `RestrictionRuleStore`：

```ts
const plugin = restrictionRules({
  store: customRestrictionRuleStore,
});
```

提供自定义 Store 时不需要 `connection`。
