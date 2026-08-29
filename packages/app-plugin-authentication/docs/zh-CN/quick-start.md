# 快速开始

这篇文档完成一条最小认证链路：准备数据表、创建 `Auth`、挂载 Hono 路由、
保护业务接口，再把客户端接入 Refine。

## 1. 准备认证表

认证依赖以下 Collection：

- `user`
- `session`
- `account`
- `verification`

插件在 `package.json` 中声明自己的 `database/migrations`，应用启用插件后会将
该目录纳入统一的 migration 管理。自定义应用也应通过 migration source 加载这个
目录，不需要手工导入 migration definition。

详细说明见[数据库与 Migration](./server/database-and-migration.md)。

## 2. 创建认证服务

```ts
import { createAuthentication } from '@nocobase/app-plugin-authentication';

const secret = process.env.AUTH_SECRET;
if (!secret) {
  throw new Error('AUTH_SECRET is required.');
}

const auth = createAuthentication({
  connection: database.connection(),
  baseURL: 'https://example.com/api/auth',
  secret,
  appName: 'My NocoBase App',
  emailAndPassword: {
    enabled: true,
    autoSignIn: false,
  },
  session: {
    storeSessionInDatabase: true,
  },
});
```

`connection` 和非空 `secret` 都是必需的。`createAuthentication()` 缺少连接时
会立即报错，`Auth` 收到空 secret 时也会立即报错。

## 3. 挂载认证协议路由

```ts
import { Hono } from 'hono';

const router = new Hono();

router.on(['GET', 'POST'], '/api/auth/*', (context) =>
  auth.handler(context.req.raw),
);
```

必须把原始 `Request` 交给 `auth.handler()`。不要自行解析后重建认证请求，避免
丢失 Cookie、Header 或响应中的 `Set-Cookie`。

常用端点包括：

```text
POST /api/auth/sign-up/email
POST /api/auth/sign-in/email
POST /api/auth/sign-in/username
POST /api/auth/sign-out
GET  /api/auth/get-session
POST /api/auth/request-password-reset
```

Better Auth 插件可以在同一路径下增加其他端点。

## 4. 保护业务路由

```ts
import type { AuthEnv } from '@nocobase/app-plugin-authentication';
import { Hono } from 'hono';

const api = new Hono<AuthEnv>();

api.get('/private', auth.required(), (context) => {
  const current = context.get('auth');
  return context.json({ userId: current.user.id });
});
```

匿名请求会收到：

```json
{
  "code": "UNAUTHORIZED",
  "message": "Authentication required"
}
```

HTTP 状态码为 `401`。

## 5. 创建浏览器客户端

```ts
import {
  createAuthClient,
  createAuthProvider,
} from '@nocobase/app-plugin-authentication/client';
import { createAppClient } from '@nocobase/app-sdk';

export const appClient = createAppClient();
export const authClient = createAuthClient({ client: appClient });
export const authProvider = createAuthProvider(authClient);
```

将适配器传给 Refine：

```tsx
<Refine authProvider={authProvider}>{/* application routes */}</Refine>
```

插件注册到支持 Client Plugin 协议的应用后，会从独立的 `client/routes` 入口提供
`/login`、`/register`、`/forgot-password` 和 `/reset-password`。这些路由均为
`auth: 'guest'`，已登录用户访问时由应用路由层返回首页，页面模块仅在对应 URL
被访问时按需加载。

`/forgot-password` 只是调用密码重置协议。生产环境还必须在
`emailAndPassword.sendResetPassword` 中接入真实邮件服务；未配置时 Better Auth
不会发送重置链接。

## 下一步

- 服务端完整配置见[服务端集成](./server/integration.md)。
- 客户端方法和 Refine 行为见[客户端与 Refine 集成](./client/integration.md)。
- 上线前检查见[部署与安全](./security/deployment.md)。
