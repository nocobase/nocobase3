# @nocobase/authentication

`@nocobase/authentication` 是 NocoBase 应用的认证基础包。它将 Better Auth
接入 NocoBase Database 和 Caching，提供 Hono 中间件、浏览器客户端以及
Refine `AuthProvider` 适配器。

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

| 入口                              | 用途                                              |
| --------------------------------- | ------------------------------------------------- |
| `@nocobase/authentication`        | 服务端认证、存储适配、数据库适配和 migration      |
| `@nocobase/authentication/server` | 显式的服务端入口，与根入口导出相同                |
| `@nocobase/authentication/client` | 浏览器 `AuthClient` 和 Refine `AuthProvider` 适配 |

根入口是服务端入口，浏览器代码必须从 `@nocobase/authentication/client` 导入。

## 常用命令

```bash
pnpm --filter @nocobase/authentication lint
pnpm --filter @nocobase/authentication typecheck
pnpm --filter @nocobase/authentication test
pnpm --filter @nocobase/authentication build
```
