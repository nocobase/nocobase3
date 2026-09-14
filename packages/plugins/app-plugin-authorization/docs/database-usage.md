# Database Authorization

Database Authorization 是应用插件里的资源插件：它把 Authorization 的授权结果翻译成
`@nocobase/db` 的 Repository Policy，由 Repository 负责下推查询。Authorization 库本身
不认识数据库，也不生成 SQL。

一个完整的接入过程包括：

1. 安装 Database Authorization 插件；
2. 注册需要保护的数据表；
3. 通过 Permission Set、Role 或其他 Grant Provider 提供动作权限；
4. 在数据访问入口用 `policyFor()` 得到 Repository Policy；
5. 用 `repository.withPolicy(policy)` 绑定后照常读写。

## 安装插件

```ts
import {
  createAppAuthorization,
  databaseAuthorization,
} from '@nocobase/app-plugin-authorization/server';

const authz = createAppAuthorization({
  connection,
  config: { plugins: [databaseAuthorization({ source: 'main' })] },
});
```

Database Authorization 需要一个 Grant Provider。应用插件默认安装 Permission Sets；
应用也可以安装自己的 Role Grant Provider。

## 注册数据表

Database 插件不会自动把所有 Collection 变成授权资源。业务模块应当按需注册自己需要
保护的数据表：

```ts
authz.database.collections.add({
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

未注册的数据表、动作和字段都会被拒绝。

```ts
const orders = authz.database.collections.get('orders');
const collections = authz.database.collections.list();
```

## 定义数据表权限

`authz.database.grant()` 创建 Database 能够解释的 Grant：

```ts
await authz.permissionSets.create({
  key: 'order-reader',
  title: '订单只读',
  grants: [
    authz.database.grant('orders', {
      read: {
        fields: { output: ['id', 'number', 'amount'] },
        recordAccess: ['recordsIOwn'],
      },
      update: {
        fields: { input: ['amount'] },
        recordAccess: ['recordsIOwn'],
      },
    }),
  ],
});
```

`read` 使用 `fields.output`，写动作使用 `fields.input`。`"*"` 表示 `collections.add()`
中登记的全部字段——Policy 节点把缺省的字段清单读作“没有任何字段”，所以 `"*"` 会
在生成 Policy 时展开成真实清单。写动作要注意：自增主键这类数据库不接受写入的列
即使登记在 `fields` 里，也不能出现在写入字段清单中，因此写授权应当明确列出该动作
真正写入的列。

## 得到 Repository Policy

`policyFor()` 把本次请求的四个动作判断折叠成一个 Repository Policy：

```ts
const policy = await authz.database.policyFor('main.articles', c.get('authz'));
const repository = database.repository('articles').withPolicy(policy);

const rows = await repository.findMany({ limit: 20 });
await repository.createOne({ values });
await repository.updateOne({ filter: { id }, values });
```

折叠规则：

- 拒绝 → `false`，该动作在 Repository 上直接不可用；
- 无条件允许 → `true`；
- 有条件允许 → `{ scope, fields }`，`scope` 是 db 的 Filter AST，`fields` 是字段清单；
- 拥有 unrestricted 权限的身份 → 每个已注册动作都是 `true`。

四次判断共用同一个请求作用域的 Grant 与约束缓存，因此一次 `policyFor()` 不会重复
解析权限。`relations` 不会被写入：Authorization 没有关系模型，缺省即“不开放”。

调用方仍然可以先检查 Policy，再决定返回什么状态码：

```ts
if (policy.read === false) return c.json({ code: 'FORBIDDEN' }, 403);
```

需要单个动作的原始判断时，`authz.authorize()` 依然可用，`conditions` 的形状是：

```ts
{
  type: 'database',
  collection: 'main.orders',
  action: 'read',
  scope: { kind: 'filter', version: 1, collection: 'orders', root: { … } },
  fields: ['id', 'number', 'amount'],
}
```

## Record Access Policy

Database 插件内置三个 Policy：

- `allRecords`：所有记录；
- `recordsIOwn`：`attributes.owner` 等于 Principal ID；
- `recordsICreated`：`attributes.creator` 等于 Principal ID；
- `customFilter`：直接使用 `params.filter` 给出的节点。

业务模块也可以定义自己的 Policy。`resolve()` 返回 `true`（全部记录）、`false`
（没有记录）或一个 Filter 节点：

```ts
import { condition } from '@nocobase/app-plugin-authorization/server';

authz.database.recordAccess.add<{ field: string }>({
  key: 'regionalRecords',
  title: '当前区域的记录',
  resolve: ({ principal, params }) =>
    condition(params.field, '$eq', String(principal.attributes?.regionId)),
});
```

节点是字面量构造的，不走 `FilterBuilder`：Builder 需要按字段类型选择 `string()` 还是
`number()`，而 Collection 注册表只记录字段名。一个条件节点是
`{ kind: 'condition', path: [field], operator, value }`，分组是
`{ kind: 'group', logic: 'and' | 'or', items }`。

Policy 返回的节点只能引用当前注册 Collection 的字段，不能穿越关系，也不能使用 JSON
操作符；违反时该次授权以 `DATABASE_AUTHORIZATION_FAILED` 拒绝。

在 Grant 中引用：

```ts
recordAccess: [{ key: 'regionalRecords', params: { field: 'regionId' } }];
```

## 与范围插件配合

Default Access、Sharing Rules 和 Restriction Rules 都可以向 Database Authorization 提供
记录范围。Database 按下面的方式组合：

```text
(Grant Record Access OR Default Access OR Sharing Rules)
AND Restriction Rules
```

正向范围为空表示没有任何记录，该动作直接拒绝；限制为空表示不额外收窄。分享指定
记录时，Database 会把 ID 列表展开成若干个 `$eq` 的 `or`——db 的 Filter 目前没有 `$in`，
等它有了这里会收敛成一个条件。

```ts
await authz.sharingRules.create({
  key: 'share-orders-with-auditors',
  resource: { type: 'database.collection', id: 'main.orders' },
  actions: [
    {
      action: 'read',
      selection: { type: 'records', ids: ['order-1', 'order-2'] },
    },
  ],
  subjects: [{ type: 'role', id: 'auditor' }],
});

await authz.restrictionRules.create({
  key: 'contractor-owned-orders',
  resource: { type: 'database.collection', id: 'main.orders' },
  actions: [
    { action: 'read', scope: authz.database.scope('recordsIOwn') },
    { action: 'update', scope: authz.database.scope('recordsIOwn') },
  ],
  subjects: [{ type: 'role', id: 'contractor' }],
});
```

## 常见拒绝原因

| Code                                  | 含义                                         |
| ------------------------------------- | -------------------------------------------- |
| `UNKNOWN_DATABASE_RESOURCE_OR_ACTION` | 数据表未注册，或没有声明该 Action            |
| `UNKNOWN_DATABASE_FIELD`              | 请求使用了未注册字段                         |
| `NO_OBJECT_PERMISSION`                | Grant Provider 没有返回匹配的 Database Grant |
| `FIELD_NOT_ALLOWED`                   | Grant 不允许使用请求中的一个或多个字段       |
| `NO_RECORD_ACCESS`                    | 没有任何正向记录范围                         |
| `DATABASE_AUTHORIZATION_FAILED`       | Record Access Policy 解析或范围校验失败      |

`authz.explain()` 返回完整 Decision 和原因，可用于调试和审计。生产代码仍应采用默认
拒绝策略。
