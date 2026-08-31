# @nocobase/app-plugin-authentication

`@nocobase/app-plugin-authentication` 是 NocoBase 应用的认证基础包。它将 Better Auth
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

| 入口                                                 | 用途                                              |
| ---------------------------------------------------- | ------------------------------------------------- |
| `@nocobase/app-plugin-authentication`                | 服务端认证、存储适配、数据库适配和 migration      |
| `@nocobase/app-plugin-authentication/server`         | 显式的服务端入口，与根入口导出相同                |
| `@nocobase/app-plugin-authentication/client`         | 浏览器 `AuthClient` 和 Refine `AuthProvider` 适配 |
| `@nocobase/app-plugin-authentication/client/routes`  | 按需加载默认密码认证页面的插件入口                |
| `@nocobase/app-plugin-authentication/client/actions` | 无页面依赖的认证动作 hooks                        |
| `@nocobase/app-plugin-authentication/client/ui`      | 认证路由链接 `AuthLink`                           |

插件还在 `registry/auth-ui` 发布官方认证 UI 配方。Template 可以将它物化到
`client/extensions/nocobase-auth-ui`；安装后的副本属于应用，可以直接修改，不是插件
运行时源码。

Registry 元数据位于 `registry.config.json`，使用仓库级工具构建 shadcn 安装产物：

```bash
pnpm registry:build
```

生成的安装入口为 `public/r/auth-ui.json`。Registry 源码变更后需要重新构建；消费方只需
对已发布的 JSON 执行 `shadcn add`。

插件自身的 fallback 页面不依赖宿主 UI 包，而是在 `client/components/ui` 按需持有
shadcn `base-nova` 源码。新增基础组件可在本包目录执行 `pnpm exec shadcn add <name>`；
由于本包会生成声明文件，生成后需要保留显式导出类型，并将内部引用写成带 `.js` 后缀的
相对 ESM 路径。

根入口是服务端入口，浏览器代码必须从 `@nocobase/app-plugin-authentication/client` 导入。

## 常用命令

```bash
pnpm --filter @nocobase/app-plugin-authentication lint
pnpm --filter @nocobase/app-plugin-authentication typecheck
pnpm --filter @nocobase/app-plugin-authentication test
pnpm --filter @nocobase/app-plugin-authentication build
```
