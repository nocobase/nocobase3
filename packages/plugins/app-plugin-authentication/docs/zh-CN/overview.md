# 概览

`@nocobase/app-plugin-authentication` 负责把密码认证协议和默认认证页面接入 NocoBase
应用运行时。用户授权和业务资源访问控制仍由 ACL 模块承担。

## 模块边界

认证调用链如下：

```text
浏览器认证页面
  -> AuthClient
  -> ApiClient + RealtimeClient
  -> /api/auth/*
  -> Auth / Better Auth
  -> NocoBase Database Adapter
  -> user / session / account / verification
```

可选的 secondary storage 调用链如下：

```text
Better Auth
  -> createAuthStorage()
  -> NocoBase Caching
  -> memory / Redis / 其他已配置 provider
```

## 当前能力

- 邮箱和密码注册、登录。
- 用户名和密码登录；用户名按 Better Auth username plugin 的规则归一化。
- Cookie session 获取与退出。
- Hono 必选认证和可选认证中间件。
- NocoBase Database 自定义 Better Auth adapter。
- NocoBase Caching secondary storage 和限流计数器适配。
- Refine `AuthProvider` 适配。
- 登录、注册、忘记密码和重置密码页面由应用的 guest 路由按需加载；插件本身不声明
  客户端路由。

## 默认行为

模板的 `server/config/auth.ts` 默认启用邮箱密码登录和 username plugin，并配置 `displayUsername: false`。`client/config/auth.ts` 配置对应的原生客户端插件。用户可以直接修改这些文件中的登录策略和回调。

认证 Provider 补充应用名称、数据库连接、缓存、ID 生成和公开路径等运行时依赖。`config.yml` 与声明的环境变量覆盖部署相关字段。

## 不属于本包的职责

- 应用品牌化认证页面和其他认证方式的 UI 由相应插件或应用定义。
- 密码重置邮件的发送能力由应用配置。
- 角色、权限和记录级访问控制不由 authentication 判断。
- 应用 migration 的发现和执行由应用数据库运行时负责。
- 多进程部署所需的共享缓存 provider 由应用选择和配置。

## 文档地图

- 完成一条可运行链路见[快速开始](./quick-start.md)。
- Hono handler、中间件和 secondary storage 见[服务端集成](./server/integration.md)。
- 表结构、migration 和 adapter 边界见[数据库与 Migration](./server/database-and-migration.md)。
- `AuthClient` 和 Refine 适配见[客户端与 Refine 集成](./client/integration.md)。
- 让 AI Agent 扩展认证能力见 [AI Agent 开发指南](./development/agent-guide.md)。
- Better Auth 没有目标能力时见[开发自定义插件](./extensions/custom-better-auth-plugin.md)。
- 生产环境配置见[部署与安全](./security/deployment.md)。
- 导出类型和方法见 [API 索引](./reference/api-index.md)。
