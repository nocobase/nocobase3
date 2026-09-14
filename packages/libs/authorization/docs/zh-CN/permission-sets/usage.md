# Permission Sets

Permission Set 是一组可以重复分配的权限声明。它适合把“订单只读”“文件下载”等
常用权限集中管理，再分配给用户、角色、团队或部门。

## 安装

```ts
import { createAuthorization } from '@nocobase/authorization/core';
import { permissionSets } from '@nocobase/authorization/permissions';
import { databaseAuthorization } from '@nocobase/authorization/database';

const authz = createAuthorization({
  connection,
  plugins: [permissionSets(), databaseAuthorization()],
});

authz.database.collections.add({
  name: 'orders',
  actions: ['read'],
  fields: ['id', 'number', 'amount'],
});
```

Permission Sets 使用数据库保存配置。默认 Store 读写下面的表，表结构由宿主应用
的 migration 创建和维护，本包不包含 migration；`@nocobase/app-plugin-authorization`
自带一份与默认 Store 匹配的 migration：

- `authorizationPermissionSets`
- `authorizationPermissionSetAssignments`

## 创建 Permission Set

Database 插件安装后，通过 `authz.database.grant()` 定义数据库权限：

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
    resource: { type: 'database.collection', id: 'main.orders' },
    action: 'read',
    params: {
      fields: { output: ['id', 'number', 'amount'] },
    },
  });
```

## HTTP API

Permission Sets 提供 Fetch handler。应用可以自行决定路由路径：

```ts
router.on(
  ['GET', 'POST', 'PUT', 'DELETE'],
  ['/authz/permission-sets', '/authz/permission-sets/*'],
  (context) =>
    authz.permissionSets.handler({
      request: context.req.raw,
      authorization: context.get('authz'),
      basePath: '/authz',
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
  keys: ['system-administrator'],
  allow: ['assign', 'revoke'],
  requireActiveAssignment: true,
});
```

`revoke()` 和 `replaceSubjectAssignments()` 在会移除最后一条有效分配时抛出
`PermissionSetLastAssignmentError`，HTTP handler 返回 `409 LAST_ASSIGNMENT`。账号生命周期
（例如禁用用户）调用 `assertSubjectRemovable(subject)`，它对该 subject 持有的每个声明了此
标记的 Permission Set 做同样的检查。

“还能行使权限”由应用定义。Authorization 不掌握账号状态，因此由应用传入
`filterActiveSubjects`；不传时每条分配都算数：

```ts
permissionSets({
  // 一次查询整批 subject，过滤掉已禁用的账号；
  // 在事务中调用时会拿到调用方的事务句柄
  filterActiveSubjects: (subjects, connection) =>
    enabledSubjects(subjects, connection),
});
```

检查在读取分配之前调用 `PermissionSetStore.lock(key)`，让并发的两次撤销不会读到同一份
“还剩一条”的快照。数据库 Store 已实现：SQLite 以一次空更新占住写锁，其他方言用
`SELECT ... FOR UPDATE`。没有事务的 Store 可以不实现该方法。

## 超级用户（不受限访问）

Permission Set 可以在代码中声明为“不受限访问”。持有该 Permission Set 的身份会跳过
逐资源授权：不再匹配 grants，也不再应用 Sharing Rules 和 Restriction Rules。

它是 protection 上的一个字段，而不是单独的一次声明：

```ts
const release = authz.permissionSets.protect({
  owner: '@nocobase/app-plugin-authorization',
  keys: ['system-administrator'],
  allow: ['assign', 'revoke'],
  requireActiveAssignment: true,
  unrestricted: true,
});

authz.permissionSets.isUnrestricted('system-administrator'); // true

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

## 自定义存储

默认配置使用数据库 Store。需要接入其他存储时，实现 `PermissionSetStore` 并传入：

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
Store，事务由调用方开启并提交。数据库 Store 的事务句柄是 `DatabaseConnection`；内存
Store 没有事务，直接返回自身即可。

需要在自己的事务中写入 Permission Set 时，用
`authz.permissionSets.withTransaction(connection)` 取得绑定该事务的 API。它共享
protection 注册表（不受限访问也在其中），并且不会触发 `onAssignmentsChanged`——由持有事务的调用方在提交
之后自行发布变更。
