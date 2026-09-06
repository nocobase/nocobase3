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
- 通过客户端插件路由按需加载登录、注册、忘记密码和重置密码页面。

## 默认行为

`Auth` 在调用 Better Auth 前补充以下默认值：

- `appName` 默认为 `NocoBase3`。
- `emailAndPassword.enabled` 默认为 `true`。
- 自动安装 username plugin；如果调用方已经配置同 ID 插件，则不重复安装。
- username plugin 使用 `displayUsername: false`，数据库中不增加展示用户名字段。
- `advanced.database.generateId` 默认使用 `crypto.randomUUID()`。

调用方传入的配置优先于默认值。

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
