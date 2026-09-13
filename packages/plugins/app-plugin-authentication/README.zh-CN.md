# @nocobase/app-plugin-authentication

`@nocobase/app-plugin-authentication` 是 NocoBase 应用的认证基础包。它将 Better Auth
接入 NocoBase Database 和 Caching，提供 Hono 中间件、浏览器客户端以及
基于 Better Auth 的认证客户端、React 上下文和路由守卫。

当前内置的默认认证方式是邮箱或用户名加密码。应用可以继续通过 Better Auth
配置和插件扩展认证能力。

## 文档入口

- [整体概览](./docs/zh-CN/overview.md)
- [快速开始](./docs/zh-CN/quick-start.md)
- [服务端集成](./docs/zh-CN/server/integration.md)
- [数据库与 Migration](./docs/zh-CN/server/database-and-migration.md)
- [客户端与 Refine 集成](./docs/zh-CN/client/integration.md)
- [AI Agent 开发指南](./docs/zh-CN/development/agent-guide.md)
- [开发 Better Auth 没有的自定义插件](./docs/zh-CN/extensions/custom-better-auth-plugin.md)
- [部署与安全](./docs/zh-CN/security/deployment.md)
- [API 索引](./docs/zh-CN/reference/api-index.md)

## 包入口

| 入口                                                 | 用途                                         |
| ---------------------------------------------------- | -------------------------------------------- |
| `@nocobase/app-plugin-authentication`                | 服务端认证、存储适配、数据库适配和 migration |
| `@nocobase/app-plugin-authentication/server`         | 显式的服务端入口，与根入口导出相同           |
| `@nocobase/app-plugin-authentication/client`         | 浏览器 `AuthClient`、认证上下文和路由守卫    |
| `@nocobase/app-plugin-authentication/client/actions` | 无页面依赖的认证动作 hooks                   |

插件还在独立的 UI Library 发布官方认证 UI 配方。Template 可以将它物化到
`client/extensions/nocobase-auth-ui`；安装后的副本属于应用，可以直接修改，不是插件
运行时源码。认证页面路由由应用声明：插件不发布 `/login` 等路由，也不提供路由覆盖
契约。

Registry 元数据位于 `registry.config.json`，使用仓库级工具构建 shadcn 安装产物：

```bash
pnpm registry:build
```

生成的安装入口为 `public/r/auth-ui.json`。Registry 源码变更后需要重新构建；消费方只需
对已发布的 JSON 执行 `shadcn add`。

认证守卫会跳转到 `/login`，因此使用本插件的应用必须在自己的 `client/routes.ts` 中声明
`/login`、`/register`、`/forgot-password` 和 `/reset-password` 四条 `auth: 'guest'`
路由。仓库内的三个模板已内置这些路由，页面组件来自
`client/extensions/nocobase-auth-ui/`。

根入口是服务端入口，浏览器代码必须从 `@nocobase/app-plugin-authentication/client` 导入。

## 常用命令

```bash
pnpm --filter @nocobase/app-plugin-authentication lint
pnpm --filter @nocobase/app-plugin-authentication typecheck
pnpm --filter @nocobase/app-plugin-authentication test
pnpm --filter @nocobase/app-plugin-authentication build
```

## 应用配置

模板中的 `server/config/auth.ts` 和 `client/config/auth.ts` 分别提供认证服务端与原生客户端 options。两端均从对应的 authentication 入口导入 `AuthConfig`。插件列表和回调写在 TS 中，部署密钥写在 `config.yml` 或 `AUTH_SECRET` 中。详细用法见 [服务端配置](./docs/zh-CN/server/integration.md) 与 [客户端配置](./docs/zh-CN/client/integration.md)。
