# Sharing Rules

Sharing Rules 把指定对象或满足条件的对象分享给用户、角色、团队、部门等主体。它扩大
已有 Action Grant 的对象范围，不会单独授予动作权限。

## 安装

```ts
import { sharingRules } from '@nocobase/authorization/sharing-rules';

const authz = createAuthorization({
  plugins: [grantProvider, sharingRules({ store }), resourceAuthorization],
});
```

本包只定义 Store 契约 `SharingRuleStore`，插件必须由调用方提供一个 Store，本包不带任何存储
实现，也不依赖 `@nocobase/db`。`@nocobase/app-plugin-authorization` 提供数据库 Store，
并与创建下面这些表的 migration 一起发布：

- `authorizationSharingRules` 保存规则和条件范围
- `authorizationSharingRuleAssignments` 保存接收主体
- `authorizationSharingRuleRecords` 保存显式选择的记录 ID

## 分享指定对象

把两张订单分享给审计角色：

```ts
await authz.sharingRules.create({
  key: 'share-orders-with-auditors',
  title: '审计订单',
  resource: {
    type: 'database.collection',
    id: 'main.orders',
  },
  actions: [
    {
      action: 'read',
      selection: {
        type: 'records',
        ids: ['order-1', 'order-2'],
      },
    },
  ],
  subjects: [{ type: 'role', id: 'auditor' }],
});
```

`ids` 会按 Action 写入 `authorizationSharingRuleRecords`，不会作为 JSON 数组保存在规则表。

## 按条件分享

把北区订单分享给北区销售部门：

```ts
await authz.sharingRules.create({
  key: 'share-north-orders',
  resource: {
    type: 'database.collection',
    id: 'main.orders',
  },
  actions: [
    {
      action: 'read',
      selection: {
        type: 'policy',
        policy: authz.database.scope({
          key: 'regionalRecords',
          params: { region: 'north' },
        }),
      },
    },
  ],
  subjects: [{ type: 'department', id: 'north-sales' }],
});
```

`policy` 使用资源插件能够解释的 Scope。具体记录只通过 `records` 表达，Policy 中不再
重复提供 Specific IDs。其他资源类型也可以定义自己的
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
const rule = await authz.sharingRules.get('share-orders-with-auditors');
const rules = await authz.sharingRules.list();

await authz.sharingRules.update('share-orders-with-auditors', updatedRule);

await authz.sharingRules.delete('share-orders-with-auditors');
```

更新显式记录分享时，Store 会同步替换对应的记录 ID；删除规则时，也会删除它的记录
明细。

## HTTP API

插件在安装时把自己的管理路由注册到 `authz.routes`，应用只需要挂载一个分发器（见
Core 文档的 `routes`）。处理器会先用请求级 Authorization 检查
`authorization.settings/sharing-rules` 的相应权限，拒绝时返回 `403 FORBIDDEN`，请求体不合法时
返回 `400 INVALID_AUTHORIZATION_INPUT`。

可用端点：

| Method | Path                  | 用途              |
| ------ | --------------------- | ----------------- |
| GET    | `/sharing-rules`      | 列出 Sharing Rule |
| POST   | `/sharing-rules`      | 创建（返回 201）  |
| PUT    | `/sharing-rules/:key` | 更新              |
| DELETE | `/sharing-rules/:key` | 删除（返回 204）  |

`selection.type` 只能是 `records` 或 `policy`，且 policy 不接受 `ids`——指定记录请用
`records`。

## 自定义 Store

测试或使用其他持久化方案时，可以实现 `SharingRuleStore`：

```ts
const plugin = sharingRules({
  store: customSharingRuleStore,
});
```

`store` 是必填项。

Store 接口都要求实现 `withTransaction(transaction)`：它返回一个绑定到调用方事务的
Store，事务由调用方开启并提交。事务句柄的类型由 Store 自己声明——数据库 Store 用它自己的
连接类型，内存 Store 没有事务，直接返回自身即可。

对应的 API 同样提供 `authz.sharingRules.withTransaction(connection)`，返回绑定该事务的 API。
