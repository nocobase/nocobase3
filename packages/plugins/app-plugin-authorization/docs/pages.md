# 页面权限

Pages 插件把应用页面作为可授权资源。页面 ID 使用应用定义的稳定名称，不依赖 URL，因此修改路径不会改变已经配置的权限。

## 安装

Pages 插件由 `@nocobase/app-plugin-authorization` 提供，`createAppAuthorization()` 已经把它和 Permission Sets 一起装进应用的 Authorization 实例，应用代码不需要单独安装。它的实现在本包的 `server/pages-authorization.ts`，依赖 Permission Sets 作为 Grant Provider。

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

再将 Permission Set 分配给用户、角色或其他 subject。运行时授权不要求页面预先注册；要让权限集编辑器和权限检查器展示页面，应用应注册页面名称和标题：

```ts
const usersPage = authz.pages.define('users', { title: '用户管理' });

// 与上面的 JSON DSL 授权等价。
const grant = usersPage.access();
```

已注册页面显示在独立的“页面权限”分类中，即使应用没有业务分组也会显示。页面权限只控制进入页面，不授予数据库操作。业务权限只组合数据库权限，不包含页面访问；权限集需要分别声明这两类授权。默认数据范围、共享规则和限制规则只配置业务数据范围。

## 服务端判断

```ts
await authz.require({
  resource: { type: 'page', id: 'users' },
  action: 'access',
});
```

只有 `access` 是 Pages 插件支持的动作。没有匹配授权、使用其他动作或没有安装 Grant Provider 时，页面访问不会被允许。

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

客户端可以在登录后获取一次快照，用于页面导航、菜单显示和前端路由保护。实际业务接口仍然需要在服务端独立授权。
