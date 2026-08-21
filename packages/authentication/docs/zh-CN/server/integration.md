# 服务端集成

服务端入口导出 `Auth`、`createAuthentication()`、Hono middleware、缓存适配器
以及 Better Auth 数据库适配器。通常优先使用 `createAuthentication()` 创建实例。

## 创建 Auth

```ts
import { createAuthentication } from '@nocobase/authentication';

const auth = createAuthentication({
  connection: runtime.database.connection(),
  baseURL: config.auth.baseURL,
  secret: config.auth.secret,
  appName: config.app.name,
});
```

`createAuthentication()` 接收 Better Auth 配置，并额外要求 NocoBase
`DatabaseConnection`。如果应用的数据库运行时可能为空，应该在创建认证服务前
完成配置校验；不要把缺少连接推迟到首个 HTTP 请求。

也可以直接实例化 `Auth`：

```ts
import { Auth } from '@nocobase/authentication/server';

const auth = new Auth({
  connection,
  secret,
});
```

## HTTP handler

`auth.handler(request)` 将完整请求转发给 Better Auth，并返回原始 `Response`：

```ts
app.on(['GET', 'POST'], '/api/auth/*', (context) =>
  auth.handler(context.req.raw),
);
```

建议把 `/api/auth/*` 保持为公开协议面，然后对业务路由使用认证中间件。不要把
`required()` 放在登录、注册、session 查询或认证 callback 路由之前。

## 获取 Session

服务端可以直接从请求 Header 解析 session：

```ts
const current = await auth.getSession(request.headers);

if (current) {
  console.log(current.user.id, current.session.id);
}
```

返回值是 `{ user, session } | null`。验证失败或没有有效 Cookie 时返回 `null`。

## required 中间件

`required()` 只允许有效 session 继续执行：

```ts
import type { AuthEnv } from '@nocobase/authentication';

const protectedRoutes = new Hono<AuthEnv>();

protectedRoutes.use('*', auth.required());
protectedRoutes.get('/apps', (context) => {
  const current = context.get('auth');
  return context.json({ userId: current.user.id });
});
```

认证成功后，`context.get('auth')` 是非空 session。匿名请求由中间件直接返回
HTTP 401。

## optional 中间件

公开页面需要按登录状态返回不同内容时使用 `optional()`：

```ts
const routes = new Hono<AuthEnv>();

routes.get('/profile', auth.optional(), (context) => {
  const current = context.get('auth');
  return context.json({ user: current?.user ?? null });
});
```

匿名请求会继续执行，`context.get('auth')` 为 `null`。

## 跳过特定请求

两个 middleware 都接受 `skip(context)`：

```ts
app.use(
  '*',
  auth.required({
    skip: (context) => context.req.path.endsWith('/healthz'),
  }),
);
```

被跳过的请求不会写入 `auth` context 变量。后续 handler 不应假设该值存在。

## 接入 secondary storage

```ts
import { createAuthStorage } from '@nocobase/authentication';
import { createCaching } from '@nocobase/caching';

const caching = createCaching(config.caching);

const auth = createAuthentication({
  connection,
  secret,
  secondaryStorage: createAuthStorage(caching),
});
```

默认 namespace 是：

```text
nocobase-auth
nocobase-auth:rate-limit
```

可以指定 namespace 和 provider：

```ts
const secondaryStorage = createAuthStorage(caching, {
  namespace: 'customer-portal-auth',
  provider: 'redis',
});
```

Better Auth 的 TTL 单位是秒，适配器会转换为 NocoBase Caching 使用的毫秒。
`getAndDelete()` 使用原子 take，`increment()` 使用原子 counter，分别用于一次性
验证值和固定窗口限流。

应用退出时仍需要释放自己创建的 `Caching` 实例：

```ts
await caching.dispose();
```

## Cookie 路径

应用部署在子路径时，应让 Cookie path 对齐应用公开路径：

```ts
const auth = createAuthentication({
  connection,
  secret,
  advanced: {
    cookiePrefix: 'my_app',
    defaultCookieAttributes: {
      path: '/my-app',
    },
  },
});
```

否则浏览器可能不会在应用 API 请求中携带 session Cookie。生产环境的完整检查
见[部署与安全](../security/deployment.md)。
