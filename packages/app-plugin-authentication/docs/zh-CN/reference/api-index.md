# API 索引

## 服务端入口

以下导出同时存在于：

```ts
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

### AuthClient

```ts
class AuthClient {
  constructor(options: AuthClientOptions);
  getSession(): Promise<AuthSession | null>;
  signIn(identifier: string, password: string): Promise<AuthSession>;
  signUp(
    name: string,
    username: string,
    email: string,
    password: string,
  ): Promise<AuthSession>;
  signOut(): Promise<void>;
  requestPasswordReset(email: string, redirectTo: string): Promise<void>;
  resetPassword(newPassword: string, token: string): Promise<void>;
}
```

所有请求通过 `AppClient` 发送到 `auth/*`。

### createAuthClient

```ts
function createAuthClient(options: AuthClientOptions): AuthClient;
```

### AuthClientOptions

```ts
interface AuthClientOptions {
  client: AppClient;
}
```

### 客户端 AuthSession

```ts
interface AuthSessionUser {
  id: string;
  name: string;
  username?: string | null;
  email: string;
  image?: string | null;
}

interface AuthSession {
  user: AuthSessionUser;
  session: {
    id: string;
    expiresAt: string;
  };
}
```

客户端 `AuthSession` 与服务端同名类型来自不同入口，字段范围也不同。避免在同一
文件中不加别名地同时导入两者。

### createAuthProvider

```ts
function createAuthProvider(client: AuthClient): AuthProvider;
```

返回 Refine `AuthProvider`，实现 login、register、forgotPassword、updatePassword、
logout、check、getIdentity 和 onError。

## 客户端插件入口

- `@nocobase/app-plugin-authentication/client/bootstrap` 默认导出客户端插件
  bootstrap，用于注册 Refine `authProvider`；
- `@nocobase/app-plugin-authentication/client/routes` 默认导出登录、注册、忘记密码和
  重置密码的 guest 路由定义；
- `@nocobase/app-plugin-authentication/client/route-contracts` 导出稳定的
  `AUTHENTICATION_ROUTE_IDS`，应用或 Registry 用它声明 component override；
- `@nocobase/app-plugin-authentication/client/actions` 导出密码登录、注册、请求重置和
  完成重置的 headless hooks；
- `@nocobase/app-plugin-authentication/client/ui` 仅导出用于应用内 SPA 导航的
  `AuthLink`。密码表单由 `auth-ui` Registry 拥有；需要自行实现表单时使用
  `@nocobase/app-plugin-authentication/client/actions` 的 headless hooks。

具体 fallback 页面通过路由的 `componentLoader` 按需加载，不从公开入口导出。默认
表单直接持有按需生成的 shadcn 基础组件源码；品牌、营销区域和最终页面组合由宿主
Registry 源码负责。
