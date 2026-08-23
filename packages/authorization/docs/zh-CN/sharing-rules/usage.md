# Sharing Rules

Sharing Rules 把指定对象或满足条件的对象分享给用户、角色、团队、部门等主体。它扩大
已有 Action Grant 的对象范围，不会单独授予动作权限。

## 安装

```ts
import { sharingRules } from '@nocobase/authorization/sharing-rules';

const authorization = createAuthorization({
  connection,
  plugins: [grantProvider, sharingRules(), resourceAuthorization],
});
```

使用默认数据库 Store 时，需要提供 `connection`，并执行 migration：

```text
@nocobase/authorization/sharing-rules/migrations/202608210003_create_sharing_rules
```

Migration 创建两张表：

- `authorizationSharingRules` 保存规则、接收主体和条件范围；
- `authorizationSharingRuleRecords` 保存显式选择的记录 ID。

## 分享指定对象

把两张订单分享给审计角色：

```ts
await authorization.sharingRules.create({
  key: 'share-orders-with-auditors',
  title: '审计订单',
  resource: {
    type: 'database.collection',
    id: 'main.orders',
  },
  actions: ['read'],
  subjects: [{ type: 'role', id: 'auditor' }],
  selection: {
    type: 'records',
    recordIds: ['order-1', 'order-2'],
  },
});
```

`recordIds` 会写入 `authorizationSharingRuleRecords`，不会作为 JSON 数组保存在规则表。

## 按条件分享

把北区订单分享给北区销售部门：

```ts
await authorization.sharingRules.create({
  key: 'share-north-orders',
  resource: {
    type: 'database.collection',
    id: 'main.orders',
  },
  actions: ['read'],
  subjects: [{ type: 'department', id: 'north-sales' }],
  selection: {
    type: 'criteria',
    scope: authorization.database.scope({
      key: 'regionalRecords',
      params: { region: 'north' },
    }),
  },
});
```

`criteria` 使用资源插件能够解释的 Scope。其他资源类型也可以定义自己的
Policy。

## 接收主体

`subjects` 可以使用当前请求中已经验证的主体，例如：

```ts
subjects: [
  { type: 'user', id: 'user-alice' },
  { type: 'role', id: 'auditor' },
  { type: 'department', id: 'north-sales' },
];
```

规则只要匹配其中一个当前主体即可生效，Principal 本身也会参与匹配。需要匹配所有
已认证用户时，由认证集成把 `{ type: "authenticated", id: "*" }` 加入当前请求的
`subjects`。

## 管理规则

```ts
const rule = await authorization.sharingRules.get('share-orders-with-auditors');
const rules = await authorization.sharingRules.list();

await authorization.sharingRules.update(
  'share-orders-with-auditors',
  updatedRule,
);

await authorization.sharingRules.delete('share-orders-with-auditors');
```

更新显式记录分享时，Store 会同步替换对应的记录 ID；删除规则时，也会删除它的记录
明细。

## 自定义 Store

测试或使用其他持久化方案时，可以实现 `SharingRuleStore`：

```ts
const plugin = sharingRules({
  store: customSharingRuleStore,
});
```

提供自定义 Store 时不需要 `connection`。
