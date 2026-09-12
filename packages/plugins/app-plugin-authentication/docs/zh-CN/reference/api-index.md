# API 索引

## 服务端入口

以下导出同时存在于：

```ts
import { username } from 'better-auth/plugins';
import { usernameClient } from 'better-auth/client/plugins';
import {} from '@nocobase/app-plugin-authentication';
import {} from '@nocobase/app-plugin-authentication/server';
```

### Auth

```ts
class Auth {
  constructor(options: AuthOptions);
  handler(request: Request): Promise<Response>;
  getSession(headers: Headers): Promise<AuthSession>;
  optional(options?: AuthMiddlewareOptions): MiddlewareHandler<AuthEnv>;
  required(options?: AuthMiddlewareOptions): MiddlewareHandler<AuthEnv>;
}
```

`Auth` 封装 Better Auth handler、session API 和 Hono middleware。

### createAuthentication

```ts
function createAuthentication(options: CreateAuthenticationOptions): Auth;
```

创建 `Auth`。`options.connection` 在类型上允许省略，以便应用组合配置，但运行时
必须存在；缺少时抛出 `Authentication requires a database connection.`。

### AuthOptions

```ts
interface AuthOptions extends Omit<BetterAuthOptions, 'database'> {
  connection: DatabaseConnection;
}
```

Better Auth 配置加 NocoBase database connection。数据库实现由本包接管，调用方
不能通过 `database` 覆盖。

### CreateAuthenticationOptions

```ts
interface CreateAuthenticationOptions extends Omit<AuthOptions, 'connection'> {
  connection?: DatabaseConnection;
}
```

用于应用运行时组合依赖。虽然 `connection` 可选，运行时仍是必需依赖。

### AuthSession

```ts
type AuthSession = {
  user: User;
  session: Session;
} | null;
```

这里的 `User` 和 `Session` 来自 Better Auth。

### AuthEnv

```ts
interface AuthEnv {
  Variables: {
    auth: AuthSession;
  };
}
```

用于声明 Hono `context.get('auth')`。如果 middleware 的 `skip()` 返回 true，
运行时不会写入该变量。

### AuthMiddlewareOptions

```ts
interface AuthMiddlewareOptions {
  skip?: (context: Context) => boolean;
}
```

`skip` 为 true 时跳过 session 查询和 context 写入。

### createAuthStorage

```ts
function createAuthStorage(
  caching: Caching,
  options?: {
    namespace?: string;
    provider?: string;
  },
): NonNullable<BetterAuthOptions['secondaryStorage']>;
```

将 NocoBase `Caching` 适配为 Better Auth secondary storage。默认 namespace
是 `nocobase-auth`。

### databaseAdapter

```ts
interface DatabaseAdapterOptions {
  debugLogs?: boolean;
}

function databaseAdapter(
  connection: DatabaseConnection,
  options?: DatabaseAdapterOptions,
): DBAdapterInstance;
```

将 NocoBase `DatabaseConnection` 适配为 Better Auth database factory。通常由
`Auth` 内部调用；只有扩展或测试 adapter 时才需要直接使用。

## 客户端入口

```ts
import {} from '@nocobase/app-plugin-authentication/client';
```

### AuthConfig、AuthClient 与 createAuthClient

`AuthConfig` 是原生客户端 options 的类型别名，供应用的 `client/config/auth.ts` 使用。`createAuthClient(options)` 创建原生客户端，支持插件和 fetch options。`AuthSession`、`AuthSessionUser` 从客户端推导。

```ts
const { data, error } = await client.getSession();
await client.signIn.email({ email, password });
await client.signIn.username({ username, password });
await client.signUp.email({ name, username, email, password });
await client.signOut();
await client.requestPasswordReset({ email, redirectTo });
await client.resetPassword({ newPassword, token });
```

`username` API 需要配置 `usernameClient()`。请求默认返回 `{ data, error }`，传入 `{ throw: true }` 时直接返回数据或抛出错误。

### createAuthProvider

`createAuthProvider(client, realtime)` 返回 Refine `AuthProvider`，实现 login、register、forgotPassword、updatePassword、logout、check、getIdentity 和 onError。`realtime` 提供 `reconnect()`，用于刷新身份变化后的连接。

## 客户端插件入口

- `@nocobase/app-plugin-authentication/client` 默认导出 Client plugin factory，
  其 ServiceProvider 在 `boot()` 中注册 Refine `authProvider`；
- `@nocobase/app-plugin-authentication/client/actions` 导出密码登录、注册、请求重置和
  完成重置的 headless hooks；
- 密码表单和页面由 UI Library Registry 拥有；需要自行实现表单时使用
  `@nocobase/app-plugin-authentication/client/actions` 的 headless hooks。页面之间的
  链接由应用自己的路由和页面源码负责。

插件不声明客户端路由。应用在自己的 `client/routes.ts` 中声明 `/login`、`/register`、
`/forgot-password` 和 `/reset-password` 四条 `auth: 'guest'` 路由；页面组件通过
`componentLoader` 按需加载，品牌、表单和最终页面组合由应用的 Registry 源码负责。
