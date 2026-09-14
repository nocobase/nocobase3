# Permission Sets

Permission Set 是一组可以重复分配的权限声明。它适合把“订单只读”“文件下载”等
常用权限集中管理，再分配给用户、角色、团队或部门。

## 安装

```ts
import { createAuthorization } from '@nocobase/authorization/core';
import { permissionSets } from '@nocobase/authorization/permissions';
import { databaseAuthorization } from '@nocobase/app-plugin-authorization/server';

const authz = createAuthorization({
  connection,
  plugins: [permissionSets({ store }), databaseAuthorization()],
});
```

数据库插件从 `connection.collections` 读取 Collection 元数据，不需要另行注册。

本包只定义 Store 契约 `PermissionSetStore`，插件必须由调用方提供一个 Store，本包不带
任何存储实现，也不依赖 `@nocobase/db`。`@nocobase/app-plugin-authorization` 提供数据库
Store，并与创建下面这些表的 migration 一起发布：

- `authorizationPermissionSets`
- `authorizationPermissionSetAssignments`

## 创建 Permission Set

数据库资源插件由 `@nocobase/app-plugin-authorization` 提供；安装后通过
`authz.database.grant()` 定义数据库权限：

```ts
await authz.permissionSets.create({
  key: 'order-reader',
  title: '订单只读',
  grants: [
    authz.database.grant('orders', {
      read: { fields: { output: ['id', 'number', 'amount'] } },
    }),
  ],
});
```

### 资源策略

Permission Set 的每个 Action 可以携带一个 `policy`。`type` 标识负责解释策略的
资源插件，其余字段由该插件定义：

```ts
{
  resource: { type: "file.object", id: "*" },
  actions: [
    {
      action: "download",
      policy: {
        type: "file",
        recordAccess: ["filesIOwn"],
      },
    },
  ],
}
```

Permission Sets 只保存和传递 Policy，不解释插件字段。业务代码通常优先使用资源插件
提供的 `grant()` API，例如 `authz.database.grant()`，由插件生成正确的 Policy
结构。

## 分配 Permission Set

### 分配给用户

```ts
const assignment = await authz.permissionSets.assign({
  permissionSet: 'order-reader',
  subject: { type: 'user', id: 'user-alice' },
});
```

撤销分配：

```ts
await authz.permissionSets.revoke(assignment.id);
```

### 分配给所有已认证用户

`authenticated:*` 由应用的认证集成加入当前请求的 `subjects`，Authorization 不会根据
Principal 类型自行推断是否已经认证：

```ts
await authz.permissionSets.assign({
  permissionSet: 'help-center-reader',
  subject: { type: 'authenticated', id: '*' },
});

authz.for({
  principal: { type: 'user', id: 'user-alice' },
  subjects: [{ type: 'authenticated', id: '*' }],
});
```

### 分配给角色、团队或部门

应用在请求入口解析当前角色，并把它加入 `subjects`：

```ts
authz.for({
  principal: { type: 'user', id: 'user-alice' },
  subjects: [{ type: 'role', id: 'sales-manager' }],
});

await authz.permissionSets.assign({
  permissionSet: 'order-manager',
  subject: { type: 'role', id: 'sales-manager' },
});
```

`subjects` 可以使用 `role`、`team`、`department` 或应用定义的主体类型。

## 查询和维护

```ts
const all = await authz.permissionSets.list();
const reader = await authz.permissionSets.get('order-reader');
const assignments = await authz.permissionSets.listAssignments('order-reader');

await authz.permissionSets.update('order-reader', {
  key: 'order-reader',
  title: '订单查看者',
  grants: updatedGrants,
});

await authz.permissionSets.delete('order-reader');
```

查询某个 Principal 当前生效的 Permission Sets：

```ts
const effective = await authz.permissionSets.getEffective({
  principal: { type: 'user', id: 'user-alice' },
  subjects: [{ type: 'role', id: 'sales-manager' }],
});
```

这个 API 适合权限管理界面和审计。具体资源的最终访问结果通过请求级 `authz` 判断：

```ts
const decision = await authz
  .for({
    principal: { type: 'user', id: 'user-alice' },
    subjects: [{ type: 'role', id: 'sales-manager' }],
  })
  .explain({
    resource: { type: 'database.collection', id: 'orders' },
    action: 'read',
    params: {
      fields: { output: ['id', 'number', 'amount'] },
    },
  });
```

## HTTP API

Permission Sets 在安装时把自己的路由注册到 `authz.routes`（路径 `/permission-sets`），
应用挂载 Core 文档里的分发器即可。也可以直接使用它的 Fetch handler，自行决定路由路径：

```ts
router.on(
  ['GET', 'POST', 'PUT', 'DELETE'],
  ['/authz/permission-sets', '/authz/permission-sets/*'],
  (context) =>
    authz.permissionSets.handler({
      request: context.req.raw,
      authorization: context.get('authz'),
      // 相对于挂载点的路径，由调用方给出
      path: context.req.path.slice('/authz'.length),
    }),
);
```

handler 使用当前请求级 Authorization 检查管理权限。应用可以创建一个管理用
Permission Set：

```ts
await authz.permissionSets.create({
  key: 'permission-administrator',
  grants: [
    {
      resource: { type: 'authorization.settings', id: 'permission-sets' },
      actions: [
        { action: 'read' },
        { action: 'create' },
        { action: 'update' },
        { action: 'delete' },
      ],
    },
  ],
});
```

可用端点：

| Method | Path                   | 用途                     |
| ------ | ---------------------- | ------------------------ |
| GET    | `/`                    | 列出 Permission Sets     |
| POST   | `/`                    | 创建 Permission Set      |
| GET    | `/:key`                | 读取 Permission Set      |
| PUT    | `/:key`                | 更新 Permission Set      |
| DELETE | `/:key`                | 删除 Permission Set      |
| GET    | `/:key/assignments`    | 查询分配关系             |
| POST   | `/:key/assignments`    | 创建分配关系             |
| DELETE | `/assignments/:id`     | 撤销分配                 |
| GET    | `/effective/:type/:id` | 查询有效 Permission Sets |

两个读取端点（`GET /` 和 `GET /:key`）在存储的 Permission Set 之外，还会报告它当前的
保护状态与是否授予不受限访问，字段来自代码中的注册表而不是数据库：

| 字段           | 含义                                                                                    |
| -------------- | --------------------------------------------------------------------------------------- |
| `protection`   | 该 Permission Set 受保护时出现，形如 `{ owner, allow }`，`allow` 是通用接口仍允许的操作 |
| `unrestricted` | 该 Permission Set 为超级用户集合时为 `true`，即持有它即拥有不受限访问                   |

两个字段在不适用时都会被省略，因此普通 Permission Set 的返回结构保持不变。管理界面据此
决定是否提供编辑、删除、分配和撤销入口，不需要把某个 key 写死在前端。`GET /effective/:type/:id`
和所有写入端点的返回结构不受影响。

## 受保护的 Permission Set

由代码创建和维护的 Permission Set 可以标记为受保护。HTTP handler 会拒绝对它的创建、
修改、删除和分配变更；注册方自己的代码通过 `authz.permissionSets` 直接调用不受影响。

```ts
const release = authz.permissionSets.protect({
  owner: '@nocobase/app-plugin-hub',
  keys: ['hub-administrator', 'hub-operator'],
  allow: ['assign'], // 可选：通用管理接口仍允许的操作
});

authz.permissionSets.protection('hub-administrator');
// { owner: '@nocobase/app-plugin-hub', allow: ['assign'] }

release(); // 解除本次注册的保护
```

同一个 key 只能由一个 owner 保护，重复注册会抛错。handler 对受保护的写操作返回
`403 PROTECTED_PERMISSION_SET`；直接调用 `authz.permissionSets.assertWritable(key, operation)`
会抛出 `PermissionSetProtectedError`，业务代码可以用它复用同一条规则。

### 必须保留一个有效分配

protection 可以额外声明 `requireActiveAssignment: true`，表示这个 Permission Set 任何时候
都必须保留至少一条“还能行使权限”的分配。它与“不受限访问”相互独立：Hub 的管理员角色
并不具备不受限访问，同样需要这条规则。

```ts
authz.permissionSets.protect({
  owner: '@nocobase/app-plugin-authorization',
  keys: ['root'],
  allow: ['assign', 'revoke'],
  requireActiveAssignment: true,
});
```

`revoke()` 和 `replaceSubjectAssignments()` 在会移除最后一条有效分配时抛出
`PermissionSetLastAssignmentError`，HTTP handler 返回 `409 LAST_ASSIGNMENT`。账号生命周期
（例如禁用用户）调用 `assertSubjectRemovable(subject)`，它对该 subject 持有的每个声明了此
标记的 Permission Set 做同样的检查。

“还能行使权限”由应用定义。Authorization 不掌握账号状态，检查时会把剩余的 subject 交给
`authz.subjects` 过滤；没有任何类型声明 `filterActive` 时，每条分配都算数：

```ts
authz.subjects.define('user', {
  filterActive: (ids, transaction) => enabledUserIds(ids, transaction),
});
```

检查在读取分配之前调用 `PermissionSetStore.lock(key)`，让并发的两次撤销不会读到同一份
“还剩一条”的快照。`@nocobase/app-plugin-authorization` 的数据库 Store 已实现：SQLite 以一次空更新占住写锁，其他方言用
`SELECT ... FOR UPDATE`。没有事务的 Store 可以不实现该方法。

### 限制可分配的 subject 类型

protection 可以声明 `assignableTo: ['user']`，表示这个 Permission Set 只能分配给这些类型的
subject；不声明则不限制。`assign()` 和 `replaceSubjectAssignments()` 在类型不被允许时抛出
`PermissionSetSubjectNotAllowedError`，HTTP handler 返回
`403 PERMISSION_SET_SUBJECT_NOT_ALLOWED`。它只约束新的写入，已有分配不会被回溯检查。

`permissionSets({ rootSet: { key: 'root', assignableTo: ['user'] } })` 会把它透传到 root
set 的 protection 上。库自身不设默认值：哪些 subject 类型是账号、哪些是受众，是应用的约定。

## 超级用户（不受限访问）

Permission Set 可以在代码中声明为“不受限访问”。持有该 Permission Set 的身份会跳过
逐资源授权：不再匹配 grants，也不再应用 Sharing Rules 和 Restriction Rules。

应用通常不必自己写这次 `protect()`：`permissionSets({ rootSet })` 就是这条声明。

```ts
permissionSets({ rootSet: 'root' });
// 等价于 allow: ['assign', 'revoke']、unrestricted: true、
// requireActiveAssignment: true 的一次 protect()，owner 属于库自身。

permissionSets({
  // 破窗使用之间允许这个 Permission Set 空着
  rootSet: { key: 'root', requireActiveAssignment: false },
});
```

它是 protection 上的一个字段，而不是单独的一次声明：

```ts
const release = authz.permissionSets.protect({
  owner: '@nocobase/app-plugin-authorization',
  keys: ['root'],
  allow: ['assign', 'revoke'],
  requireActiveAssignment: true,
  unrestricted: true,
});

authz.permissionSets.isUnrestricted('root'); // true

release(); // 同时解除本次注册的保护与不受限访问
```

这样一次调用就说完了代码对这个 Permission Set 的全部主张，也意味着**不受限访问必须
连同保护一起声明**：不存在一个不受保护的超级用户 Permission Set。同一个 key 只能由一个
owner 声明，重复注册会抛错；`protect()` 返回的函数只解除本次注册的部分，连同它带来的
不受限访问一并解除。

几点需要注意：

- **成员关系写在代码里，不写在数据里。** 不受限访问由 `protect({ unrestricted: true })`
  声明，Permission Set 本身的 grants 保持原样（通常为空）。这样新增资源类型或动作时，
  不会出现一份需要同步维护的管理员授权清单。
- **谁是超级用户仍然由分配关系决定。** 把这个 Permission Set 分配给用户即授予超级用户
  身份，撤销分配即收回。
- **最后一个分配是否受保护与不受限访问无关。** 由 protection 上的
  `requireActiveAssignment` 单独声明，见上文“必须保留一个有效分配”。

底层上，`unrestricted: true` 让 Grant Provider 实现
`AuthorizationGrantService.unrestricted()`，Core 在命中资源 handler 之后、执行
`authorize()` 之前据此短路。

## 由代码拥有的默认 Permission Set

`defaultSet` 声明另一个由代码拥有的 Permission Set：受保护，grants 仍可编辑，集合本身
不可删除，它的分配也不可撤销。

```ts
permissionSets({ rootSet: 'root', defaultSet: 'member' });
// defaultSet 等价于 allow: ['update'] 的一次 protect()，owner 属于库自身。
```

`defaultSet` 声明的是**一个集合和它的保护**，不是"这些 grants 对所有没有分配的身份
生效"。后者来自把该集合绑定到受众 subject 的那条分配记录，以及宿主中间件为请求加上
该 subject——这个含义必须留在宿主里：在存在匿名身份的宿主中，库所理解的"所有身份"
会把匿名身份也算进去。

## 自定义存储

`store` 是必填项。接入数据库以外的存储时，实现 `PermissionSetStore` 并传入：

```ts
const authz = createAuthorization({
  plugins: [permissionSets({ store: customPermissionSetStore })],
});
```

测试中可以传入测试专用的 Mock Store：

```ts
const authz = createAuthorization({
  plugins: [permissionSets({ store: new MockPermissionSetStore() })],
});
```

Store 接口都要求实现 `withTransaction(transaction)`：它返回一个绑定到调用方事务的
Store，事务由调用方开启并提交。事务句柄的类型由 Store 自己声明——数据库 Store 用它自己的
连接类型，内存 Store 没有事务，直接返回自身即可。

需要在自己的事务中写入 Permission Set 时，用
`authz.permissionSets.withTransaction(connection)` 取得绑定该事务的 API。它共享
protection 注册表（不受限访问也在其中），并且不会通知订阅者——由持有事务的调用方在提交
之后自行发布变更。

## 订阅分配变更

分配变更由 Grant Provider 约定中的 `onChange` 对外通告，应用订阅
`authz.onGrantsChanged(listener)` 即可，不必点名 Permission Sets，见
[核心用法](../core/usage.md)。绑定事务的副本不通知任何订阅者。
