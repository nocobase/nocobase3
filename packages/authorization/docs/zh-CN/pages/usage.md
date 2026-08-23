# 页面权限

Pages 插件把应用页面作为可授权资源。页面 ID 使用应用定义的稳定名称，不依赖 URL，
因此修改路径不会改变已经配置的权限。

## 安装

```ts
import { createAuthorization } from '@nocobase/authorization/core';
import { pages } from '@nocobase/authorization/pages';
import { permissionSets } from '@nocobase/authorization/permissions';

const authz = createAuthorization({
  connection,
  plugins: [permissionSets(), pages()],
});
```

## 授予页面访问权限

页面使用 `page` 资源类型和 `access` 动作：

```ts
await authz.permissionSets.create({
  key: 'user-administrator',
  title: '用户管理员',
  grants: [
    {
      resource: { type: 'page', id: 'users' },
      actions: [{ action: 'access' }],
    },
  ],
});
```

再将 Permission Set 分配给用户、角色或其他 subject。Pages 插件不管理页面定义，也不
要求页面预先注册。

## 服务端判断

```ts
await authz.require({
  resource: { type: 'page', id: 'users' },
  action: 'access',
});
```

只有 `access` 是 Pages 插件支持的动作。没有匹配授权、使用其他动作或没有安装 Grant
Provider 时，页面访问不会被允许。

## 获取基础权限

页面授权不带动态 policy，因此会进入 Core 提供的基础权限快照：

```ts
const snapshot = await authz.permissions();

// {
//   permissions: [
//     {
//       resource: { type: "page", id: "users" },
//       actions: ["access"],
//     },
//   ],
// }
```

客户端可以在登录后获取一次快照，用于页面导航、菜单显示和前端路由保护。实际业务
接口仍然需要在服务端独立授权。
