# Database Authorization

Database Authorization 为数据表提供动作、字段和记录范围授权。它负责把权限配置解析
成数据库执行计划，但不替代 Repository，也不直接执行查询。

一个完整的接入过程包括：

1. 安装 Database Authorization 插件；
2. 注册需要保护的数据表；
3. 通过 Permission Set、Role 或其他 Grant Provider 提供动作权限；
4. 在数据访问入口发起授权；
5. 将授权返回的字段和记录约束应用到真实查询。

## 安装插件

```ts
import { createAuthorization } from '@nocobase/authorization/core';
import { databaseAuthorization } from '@nocobase/authorization/database';
import { permissionSets } from '@nocobase/authorization/permissions';

const authorization = createAuthorization({
  connection,
  plugins: [permissionSets(), databaseAuthorization()],
});
```

Database Authorization 需要一个 Grant Provider。上例使用 Permission Sets；应用也可以
安装自己的 Role Grant Provider。

## 注册数据表

Database 插件不会自动把所有 Collection 变成授权资源。业务模块应当按需注册自己需要
保护的数据表：

```ts
authorization.database.collections.add({
  name: 'orders',
  actions: ['create', 'read', 'update', 'delete', 'approve'],
  fields: [
    'id',
    'number',
    'amount',
    'status',
    'ownerId',
    'createdById',
    'createdAt',
  ],
  attributes: {
    identifier: 'id',
    owner: 'ownerId',
    creator: 'createdById',
  },
});
```

- `name` 是 Collection 名称。默认数据源为 `main`，最终资源 ID 是 `main.orders`。
- `actions` 是该表允许参与授权的动作，也可以包含 `approve` 等业务动作。
- `fields` 是能够出现在输入、输出、筛选、排序和分组中的字段。
- `attributes.identifier` 用于显式记录分享，未设置时使用 `id`。
- `attributes.owner` 供 `recordsIOwn` 使用。
- `attributes.creator` 供 `recordsICreated` 使用。

未注册的数据表、动作和字段都会被拒绝。一个业务模块可以在自己的初始化代码中注册
数据表，不需要把所有定义集中到应用入口：

```ts
export function registerOrderAuthorization(authz: AppAuthorization): void {
  authz.database.collections.add(orderCollectionAuthorization);
}
```

可以查询已经注册的定义：

```ts
const orders = authorization.database.collections.get('orders');
const collections = authorization.database.collections.list();
```

## 定义数据表权限

`authorization.database.grant()` 创建 Database 能够解释的 Grant。下面的 Permission Set
允许读取订单的三个字段，并把记录范围限制为当前用户拥有的订单：

```ts
await authorization.permissionSets.create({
  key: 'order-reader',
  title: '订单只读',
  grants: [
    authorization.database.grant('orders', {
      read: {
        fields: {
          output: ['id', 'number', 'amount'],
        },
        recordAccess: ['recordsIOwn'],
      },
    }),
  ],
});
```

创建和更新可以分别声明输入、输出字段：

```ts
authorization.database.grant('orders', {
  create: {
    fields: {
      input: ['number', 'amount'],
      output: ['id', 'number', 'amount'],
    },
  },
  update: {
    fields: {
      input: ['amount'],
      output: ['id', 'amount'],
    },
    recordAccess: ['recordsIOwn'],
  },
});
```

使用 `"*"` 可以允许所有已注册字段：

```ts
fields: {
  output: "*",
}
```

`"*"` 只覆盖 `collections.add()` 中已经注册的字段，不会让未知字段绕过数据表定义。

## 发起授权

列表查询通常只提供本次查询会使用的字段：

```ts
const decision = await authz.authorize({
  resource: {
    type: 'database.collection',
    id: 'main.orders',
  },
  action: 'read',
  params: {
    fields: {
      output: ['id', 'number', 'amount'],
      filter: ['status'],
      sort: ['createdAt'],
    },
  },
});
```

字段含义如下：

- `input`：写入数据使用的字段；
- `output`：返回给调用方的字段；
- `filter`：业务查询条件使用的字段；
- `sort`：排序使用的字段；
- `group`：分组或聚合使用的字段。

筛选、排序和分组字段按可读输出字段检查。这样可以防止调用方通过不可读字段推断
数据。

## 处理授权结果

Database Authorization 可能返回三种结果：

- `permit`：可以直接执行；
- `deny`：拒绝执行；
- `conditional`：满足返回的 Database Conditions 后可以执行。

读取、更新和删除等涉及已有记录的查询通常返回 `conditional`：

```ts
{
  effect: "conditional",
  conditions: {
    type: "database",
    collection: "main.orders",
    action: "read",
    fields: {
      input: [],
      output: ["id", "number", "amount"],
    },
    filter: {
      $and: [
        {
          ownerId: {
            $eq: "user-alice",
          },
        },
      ],
    },
  },
}
```

Repository 或查询适配层必须同时应用：

- `conditions.filter`：与业务 Filter 合并后，下推为查询、更新或删除条件；
- `conditions.fields.input`：限制允许写入的字段；
- `conditions.fields.output`：限制允许读取和返回的字段。

示意代码：

```ts
const decision = await authz.authorize(request);

if (
  decision.effect !== 'conditional' ||
  decision.conditions?.type !== 'database'
) {
  throw new AuthorizationDeniedError(decision);
}

const conditions = decision.conditions as DatabaseAuthorizationConditions;

return ordersRepository.find({
  fields: conditions.fields.output,
  filter: {
    $and: [businessFilter, conditions.filter],
  },
});
```

`conditions.filter` 使用 NocoBase Filter AST，可以直接与业务 Filter 组合。Authorization
不会绕过 Repository，也不直接执行查询；Repository 或数据访问适配层负责校验并安全
下推 Filter。

更新和删除也应当把记录约束直接合并到真实 SQL 条件中，不要先查询记录、在内存中
检查，再发起一个不带授权条件的写操作。

## 检查指定记录

检查某条记录时，仍然使用 Database Authorization 返回的 Filter，并在 Repository 查询
中同时加入记录 ID：

```ts
const decision = await authz.authorize({
  resource: { type: 'database.collection', id: 'main.orders' },
  action: 'read',
  params: {
    fields: { output: ['id', 'number', 'amount'] },
  },
});

if (
  decision.effect !== 'conditional' ||
  decision.conditions?.type !== 'database'
) {
  throw new AuthorizationDeniedError(decision);
}

const conditions = decision.conditions as DatabaseAuthorizationConditions;
const allowed = await ordersRepository.exists({
  filter: {
    $and: [{ id: { $eq: order.id } }, conditions.filter],
  },
});
```

这样单条记录检查与列表、更新和删除使用相同的 Filter 语义，不会在 Authorization
内部重复实现一套 Filter 求值规则。

## Record Access Policy

Database 插件内置三个 Policy：

- `allRecords`：所有记录；
- `recordsIOwn`：`attributes.owner` 等于 Principal ID；
- `recordsICreated`：`attributes.creator` 等于 Principal ID。

业务模块也可以定义自己的 Policy：

```ts
authorization.database.recordAccess.add<{
  field: string;
}>({
  key: 'regionalRecords',
  title: '当前区域的记录',
  resolve({ principal, params }) {
    return {
      $and: [
        {
          [params.field]: {
            $eq: String(principal.attributes?.regionId),
          },
        },
      ],
    };
  },
});
```

`add<P>()` 的泛型参数定义 `params` 类型。Policy 的 `resolve()` 可以使用当前 Principal、
Collection 定义和 Action，返回 NocoBase Filter AST。

可以查询当前可用的 Policy：

```ts
const policy = authorization.database.recordAccess.get('regionalRecords');
const policies = authorization.database.recordAccess.list();
```

`allRecords`、`recordsIOwn` 和 `recordsICreated` 也注册在这个 registry 中。Policy key
必须唯一，重复注册会直接报错。

在 Grant 中引用：

```ts
recordAccess: [
  {
    key: 'regionalRecords',
    params: { field: 'regionId' },
  },
];
```

Policy 返回 Filter AST，不直接操作 Repository 或 Knex。Filter 必须以 `$and` 或 `$or`
作为根节点，只能引用当前注册 Collection 中的字段；未知字段和操作符会被拒绝。

## 与范围插件配合

Default Access、Sharing Rules 和 Restriction Rules 都可以向 Database Authorization 提供
记录范围。Database 按下面的方式组合：

```text
(Grant Record Access OR Default Access OR Sharing Rules)
AND Restriction Rules
```

例如把两张订单分享给审计角色：

```ts
await authorization.sharingRules.create({
  key: 'share-orders-with-auditors',
  resource: { type: 'database.collection', id: 'main.orders' },
  actions: ['read'],
  subjects: [{ type: 'role', id: 'auditor' }],
  selection: {
    type: 'records',
    recordIds: ['order-1', 'order-2'],
  },
});
```

限制外部协作者只能访问自己拥有的订单：

```ts
await authorization.restrictionRules.create({
  key: 'contractor-owned-orders',
  resource: { type: 'database.collection', id: 'main.orders' },
  actions: ['read', 'update'],
  subjects: [{ type: 'role', id: 'contractor' }],
  scope: authorization.database.scope('recordsIOwn'),
});
```

安装和存储配置参见 [Default Access](../default-access/usage.md)、
[Sharing Rules](../sharing-rules/usage.md) 和
[Restriction Rules](../restriction-rules/usage.md)。

## 常见拒绝原因

| Code                                  | 含义                                         |
| ------------------------------------- | -------------------------------------------- |
| `UNKNOWN_DATABASE_RESOURCE_OR_ACTION` | 数据表未注册，或没有声明该 Action            |
| `UNKNOWN_DATABASE_FIELD`              | 请求使用了未注册字段                         |
| `NO_OBJECT_PERMISSION`                | Grant Provider 没有返回匹配的 Database Grant |
| `FIELD_NOT_ALLOWED`                   | Grant 不允许使用请求中的一个或多个字段       |
| `NO_RECORD_ACCESS`                    | 没有任何正向记录范围                         |
| `DATABASE_AUTHORIZATION_FAILED`       | Policy 解析或 Filter 校验失败                |

可以使用 `authz.explain()` 获取完整 Decision 和原因，用于调试和审计：

```ts
const decision = await authz.explain(request);
```

生产代码仍应采用默认拒绝策略：不认识的资源、执行计划或约束都不应继续执行查询。
