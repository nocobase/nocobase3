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

Permission Sets 使用数据库保存配置。应用初始化时执行包内 migration：

```text
@nocobase/authorization/permissions/migrations/202608210001_create_permission_set_tables
```

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
      resource: { type: 'authorization.permission-sets', id: '*' },
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
