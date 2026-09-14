# @nocobase/app-plugin-authentication

`@nocobase/app-plugin-authentication` 是 NocoBase 应用的认证基础包。它将 Better Auth
接入 NocoBase Database 和 Caching，提供 Hono 中间件、浏览器认证客户端、React 上下文、
路由守卫和无页面依赖的认证动作 hooks。

当前内置的默认认证方式是邮箱或用户名加密码。应用通过 Better Auth 配置和插件扩展
认证能力。

## 文档入口

- 面向应用开发者的功能介绍和 Agent 用法：NocoBase 文档站「内置能力 / 登录注册」。
- 面向应用 Agent 的开发契约：本包 `skills/nocobase-app-plugin-authentication/`。
  插件注册到应用后会同步到应用的 `.agents/skills/`，同步副本不要直接修改。

## 包入口

| 入口                                                 | 用途                                         |
| ---------------------------------------------------- | -------------------------------------------- |
| `@nocobase/app-plugin-authentication`                | 服务端认证、存储适配、数据库适配和 migration |
| `@nocobase/app-plugin-authentication/server`         | 显式的服务端入口，与根入口导出相同           |
| `@nocobase/app-plugin-authentication/client`         | 浏览器 `AuthClient`、认证上下文和路由守卫    |
| `@nocobase/app-plugin-authentication/client/actions` | 无页面依赖的认证动作 hooks                   |

根入口是服务端入口，浏览器代码必须从 `@nocobase/app-plugin-authentication/client` 导入。

## 认证页面归应用所有

插件不发布 `/login` 等路由，也不提供路由覆盖契约。认证守卫会跳转到 `/login`，因此
使用本插件的应用必须在自己的 `client/routes.ts` 中声明 `/login`、`/register`、
`/forgot-password` 和 `/reset-password` 四条 `auth: 'guest'` 路由。仓库内的三个模板
已内置这些路由，页面组件来自 `client/extensions/nocobase-auth-ui/`，该目录由插件的
UI registry 物化到模板中，安装后属于应用，可以直接修改。

## 应用配置

模板中的 `server/config/auth.ts` 和 `client/config/auth.ts` 分别提供认证服务端与
客户端 options，两端均从对应入口导入 `AuthConfig`。插件列表和回调写在 TS 中，部署
密钥写在 `config.yml` 或 `AUTH_SECRET` 中。

## 常用命令

```bash
pnpm --filter @nocobase/app-plugin-authentication lint
pnpm --filter @nocobase/app-plugin-authentication typecheck
pnpm --filter @nocobase/app-plugin-authentication test
pnpm --filter @nocobase/app-plugin-authentication build
```
