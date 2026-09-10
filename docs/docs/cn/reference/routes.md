---
title: '路由类型对照'
description: 'NocoBase 3 的五种路由：服务端顶层路由和 API 路由，客户端普通页面、设置页和开发页，各自挂载的路径和声明位置。'
keywords: 'NocoBase,路由,defineRootRoutes,defineApiRoutes,defineAppRoutes,defineSettingsRoutes,defineDevRoutes'
---

# 路由类型对照

五种路由，两种在服务端，三种在客户端。

| 用途                          | API                      | 运行位置 | 源码中的路径 | 最终路径           |
| ----------------------------- | ------------------------ | -------- | ------------ | ------------------ |
| 顶层 HTTP 入口、webhook、回调 | `defineRootRoutes()`     | 服务端   | `/callback`  | `/callback`        |
| 业务接口                      | `defineApiRoutes()`      | 服务端   | `/orders`    | `/api/orders`      |
| 普通业务页面                  | `defineAppRoutes()`      | 客户端   | `/orders`    | `/orders`          |
| 设置页、管理页、诊断页        | `defineSettingsRoutes()` | 客户端   | `/orders`    | `/settings/orders` |
| 只在开发期存在的调试页        | `defineDevRoutes()`      | 客户端   | `/orders`    | `/dev/orders`      |

## 声明位置

| 路由                     | 应用里的位置                                      |
| ------------------------ | ------------------------------------------------- |
| `defineRootRoutes()`     | `server/routes/`，导出在 `server/routes/index.ts` |
| `defineApiRoutes()`      | `server/routes/`，导出在 `server/routes/index.ts` |
| `defineAppRoutes()`      | `client/routes.ts`                                |
| `defineSettingsRoutes()` | `client/routes.ts`                                |
| `defineDevRoutes()`      | `client/routes.ts`                                |

服务端两种路由各自返回自己的 Hono router。客户端三种从同一个 `client/routes.ts` 以数组导出。

## 路径规则

- 路由路径是应用内部路径，不包含部署前缀。不要写 `/main` 或其他 public base path。
- `defineApiRoutes()` 的路径不重复写 `/api`，`defineSettingsRoutes()` 不重复写 `/settings`，`defineDevRoutes()` 不重复写 `/dev`。
- 设置页和开发页是两个独立的路径空间，同一个相对路径可以同时出现在两者中。
- 客户端页面的路径通过惰性的 `componentLoader()` 加载组件，`path` 本身保持同步声明。

## 客户端页面的 auth

| 值         | 行为                                           |
| ---------- | ---------------------------------------------- |
| `required` | 只有登录用户能访问，根路由省略时使用这个默认值 |
| `guest`    | 访客页面，已登录用户会被跳走                   |
| `optional` | 登录前后都可访问，页面自行调整显示             |

设置页和开发页统一要求登录。子路由继承父级的 `auth`，不能声明不同的值。

普通 App 页面在 `auth` 之外默认还按 `resource: <路由 name>, action: access` 做一次权限检查。子页面只在显式声明 `access` 时额外检查。

设置页和开发页还可以声明 `access: { resource, action }`，在页面加载前检查。被拒绝时页面从导航中移除，直接访问 URL 也不会加载组件。没有声明 `access` 的页面对所有能进入该区域的登录用户开放。

## 前后端路由的关系

- 客户端和服务端路由不会因为名称或路径相似而自动配对。
- 客户端的 `auth` 和 `access` 只保护浏览器导航，不是服务端安全边界。
- 每个服务端路由都必须自己声明并测试 authentication 和 authorization，不能依赖其他路由或注册顺序。

## 开发页的构建边界

`defineDevRoutes()` 声明的页面在生产构建里完全不存在，页面组件以及只被它们 import 的模块都不会进入打包产物。守卫写在 `defineDevRoutes()` 内部，调用处无条件调用即可。

这是打包边界，不是权限边界。需要在生产环境按角色控制的页面，用带 `access` 的设置页，并由服务端强制执行。

:::warning 注意

`defineSettingsRoutes()` 和 `defineDevRoutes()` 的签名完全一致，区别只有挂载前缀和生产构建中是否存在。

:::

## 相关链接

- [页面和菜单](../app/pages-and-routes)：应用里怎么声明页面、配菜单和控制访问。
- [接口](../app/server-routes)：服务端路由怎么写，以及它自己的安全边界。
- [名词解释](./glossary)：App、Hub、插件、迁移这些词是什么意思。
