# Database Authorization

Database Authorization 是应用插件里的资源插件：它把 Authorization 的授权结果翻译成
`@nocobase/db` 的 Repository Policy，由 Repository 负责下推查询。Authorization 库本身
不认识数据库，也不生成 SQL。

一个完整的接入过程包括：

1. 把要纳入权限模型的 Collection 注册到 `authz.db.collections`；
2. 通过 Permission Set、Role 或其他 Grant Provider 提供动作权限；
3. 在数据访问入口用 `policyFor()` 得到 Repository Policy；
4. 用 `repository.withPolicy(policy)` 绑定后照常读写，或者用
   `authz.db.repositories()` 保护 Repository API 路由。

## 插件是内置的

Database Authorization 是 `createAppAuthorization()` 固定安装的插件之一，应用不需要、
也无法把它列进 `plugins`：

```ts
import { createAppAuthorization } from '@nocobase/app-plugin-authorization/server';

const authz = createAppAuthorization({ connection });
```

它需要一个 Grant Provider。应用插件默认安装 Permission Sets；应用也可以安装自己的
Role Grant Provider。

## 注册即纳入权限模型

`authz.db.collections` 记录哪些 Collection 属于权限模型，只记录这一件事：

```ts
authz.db.collections.add({ name: 'orders', title: '订单' });
```

`title` 与 `description` 只服务于权限配置界面。字段清单、主键以及主键是否由数据库
生成，仍然在授权时从 `connection.collections` 读取，所以两边不会对不上。

**没有注册的 Collection 没有任何权限。** 授权在查元数据和 Grant 之前就以
`COLLECTION_NOT_REGISTERED` 拒绝，unrestricted 身份同样如此——超级用户跳过的是
Grant，不是权限模型。这样一来，数据库里的系统表与记账表不会出现在可授权列表里，
也不会因为「db 认得这张表」而意外可授。

`add()` 在启动阶段调用，不接触数据库；重复注册同一个名字会抛错。

- 资源 ID 就是注册时的 Collection 名，例如 `orders`，不带数据源前缀：插件只面向一个
  连接。
- 动作固定为 `read`、`create`、`update`、`delete`。
- 字段是 Collection 的直接列；关系由 Repository Policy 的 `relations` 管辖，不出现在
  字段清单里。
- 记录标识使用主键；`recordsIOwn` 与 `recordsICreated` 通过 `params.field` 指定列。

没有注册的 Collection、db 不认识的 Collection、四个动作之外的动作、以及不属于该表的
字段都会被拒绝。

## 定义数据表权限

`authz.db.grant()` 创建 Database 能够解释的 Grant：

```ts
await authz.permissionSets.create({
  key: 'order-reader',
  title: '订单只读',
  grants: [
    authz.db.grant('orders', {
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

`read` 使用 `fields.output`，写动作使用 `fields.input`。`"*"` 表示 db 报告的全部字段
——Policy 节点把缺省的字段清单读作“没有任何字段”，所以 `"*"` 会在生成 Policy 时展开
成真实清单。`create` 会自动排除由数据库生成的主键（自增或带默认值），因为调用方
本来就写不进去。

## 得到 Repository Policy

`policyFor()` 把本次请求的四个动作判断折叠成一个 Repository Policy：

```ts
const policy = await authz.db.policyFor('articles', c.get('authz'));
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
  collection: 'orders',
  action: 'read',
  scope: { kind: 'filter', version: 1, collection: 'orders', root: { … } },
  fields: ['id', 'number', 'amount'],
}
```

## Record Access Policy

Database 插件内置三个 Policy：

- `allRecords`：所有记录；
- `recordsIOwn`：`params.field`（缺省 `ownerId`）等于 Principal ID；
- `recordsICreated`：`params.field`（缺省 `createdById`）等于 Principal ID；
- `customFilter`：直接使用 `params.filter` 给出的节点。

字段必须属于该 Collection，否则这次授权以 `DATABASE_AUTHORIZATION_FAILED` 拒绝：

```ts
recordAccess: [{ key: 'recordsIOwn', params: { field: 'salesRepId' } }];
```

业务模块也可以定义自己的 Policy。`resolve()` 返回 `true`（全部记录）、`false`
（没有记录）或一个 Filter 节点：

```ts
import { condition } from '@nocobase/app-plugin-authorization/server';

authz.db.recordAccess.add<{ field: string }>({
  key: 'regionalRecords',
  title: '当前区域的记录',
  resolve: ({ principal, params }) =>
    condition(params.field, '$eq', String(principal.attributes?.regionId)),
});
```

节点是字面量构造的，不走 `FilterBuilder`：Builder 需要按字段类型选择 `string()` 还是
`number()`，而授权只看字段名。一个条件节点是
`{ kind: 'condition', path: [field], operator, value }`，分组是
`{ kind: 'group', logic: 'and' | 'or', items }`。

Policy 返回的节点只能引用当前 Collection 的字段，不能穿越关系，也不能使用 JSON
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
  resource: { type: 'database.collection', id: 'orders' },
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
  resource: { type: 'database.collection', id: 'orders' },
  actions: [
    { action: 'read', scope: authz.db.scope('recordsIOwn') },
    { action: 'update', scope: authz.db.scope('recordsIOwn') },
  ],
  subjects: [{ type: 'role', id: 'contractor' }],
});
```

## 保护 Repository API 路由

`authz.db.repositories()` 把一组 `defineRepositoryApiRoutes` 的 exposure 变成中间件：每个
声明了 `resource` 的 exposure 都会在请求时用调用方的授权结果收窄它自己的静态 Policy，
并在定义时把这个 Collection 注册进权限模型——把一张表的行开放成 HTTP 端点，本身就是
在声明它属于权限模型。已经手动注册过的名字会跳过，不算冲突。

```ts
const authentication = app.container.resolve(authenticationToken);
const authorization = app.container.resolve(authorizationToken);
const authorize = authorization.db.repositories(repositories);
router.use('/orders:findMany', authentication.required(), authorize);
router.route(
  '/',
  await defineRepositoryApiRoutes({
    principal: authorize.principal,
    repositories: authorize.repositories,
  }).createRouter(app),
);
```

- `resource` 就是 Collection 名，例如 `'orders'`。
- 声明了 `resource` 的 exposure 必须给出静态 `policy`：它是这个端点开放的形状，函数
  形式会在定义时抛出 `TypeError`。
- 收窄方向是「形状 ∩ 授权」。`policyFor()` 不产出 `relations`，而 patch 没提到的成员
  保持原样，所以关系规则来自形状，`scope` 与 `fields` 与授权取交集。
- 形状里 `read: true` 表示整表开放，收窄后会退化成没有关系可读；需要读关系时把
  `read` 写成显式节点，列出字段与 `relations`。
- 没有挂上中间件的动作解析不到 principal，app-server 直接以
  `403 PRINCIPAL_REQUIRED` 拒绝——不会回落到静态形状。
- 没有 `resource` 的 exposure 原样透传，不经过授权。

`@nocobase/app-plugin-authorization-example` 是可运行的参考实现：一张归属到人的任务表，
一边是被授权的 Repository API 端点，一边是自己写的创建路由（owner 由服务端按身份写入）。

## 常见拒绝原因

| Code                                  | 含义                                         |
| ------------------------------------- | -------------------------------------------- |
| `COLLECTION_NOT_REGISTERED`           | 这张表没有注册进权限模型                     |
| `UNKNOWN_DATABASE_RESOURCE_OR_ACTION` | db 里没有这张表，或动作不在四个之内          |
| `UNKNOWN_DATABASE_FIELD`              | 请求使用了该表没有的字段                     |
| `DATABASE_UNAVAILABLE`                | 安装插件时没有提供数据库连接                 |
| `NO_OBJECT_PERMISSION`                | Grant Provider 没有返回匹配的 Database Grant |
| `FIELD_NOT_ALLOWED`                   | Grant 不允许使用请求中的一个或多个字段       |
| `NO_RECORD_ACCESS`                    | 没有任何正向记录范围                         |
| `DATABASE_AUTHORIZATION_FAILED`       | Record Access Policy 解析或范围校验失败      |

`authz.explain()` 返回完整 Decision 和原因，可用于调试和审计。生产代码仍应采用默认
拒绝策略。
