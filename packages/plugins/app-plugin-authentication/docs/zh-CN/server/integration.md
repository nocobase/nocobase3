# 服务端集成

应用通过 `authenticationToken` 获取 `AuthManager`，直接使用原生 `auth.api`，
或使用 `getSession()`、`required()`、`optional()` 和 `handler()`。

## 在 Service Provider 中扩展

认证插件先注册，扩展 Provider 在 `register()` 中登记原生插件和运行时配置。
App 自己的 Provider 放在 `server/providers/`，加入该目录的 `index.ts`。

```ts
import type { Application } from '@nocobase/app-server/application';
import { ServiceProvider } from '@nocobase/service-provider';
import { authenticationToken } from '@nocobase/app-plugin-authentication/server';
import { sendEmail } from '../email.js';

export default class AppAuthProvider extends ServiceProvider<Application> {
  override register(): void {
    const auth = this.app.container.resolve(authenticationToken);
    auth.mergeOptions({
      emailAndPassword: {
        enabled: true,
        requireEmailVerification: true,
        onExistingUserSignUp: async ({ user }) => {
          await sendEmail({
            to: user.email,
            subject: 'Sign-up attempt',
            text: 'Someone tried to sign up with your email.',
          });
        },
      },
    });
  }
}
```

`sendEmail` 是应用自己的邮件函数。需要其他服务时，在回调执行时解析服务，
避免在注册阶段依赖尚未完成注册的 Provider。要求验证邮箱时，还需通过
`emailVerification.sendVerificationEmail` 配置验证邮件发送。

- `plugin(plugin)`：追加原生 Better Auth 插件。
- `socialProviders(providers)`：按名称设置社交 Provider，同名整项替换。
- `mergeOptions(options)`：使用对象展开进行浅合并，同名配置项整体替换。

默认配置统一由 AuthenticationProvider 提供。扩展配置按登记顺序浅合并，最后覆盖
初始化参数；例如设置 `session` 会替换整个 `session` 对象，需要保留的字段应显式传入。
插件和 social providers 通过各自专用方法登记。回调等运行时值写在 Provider 中。

所有 Provider 完成 `register()` 后，authentication 在 `boot()` 中调用一次 `init(options)`，
同步创建 Better Auth 实例。原生 handler 和 API 在处理请求时等待内部初始化完成。
配置登记应在 `register()` 完成。

```ts
const auth = container.resolve(authenticationToken);
const session = await auth.api.getSession({ headers: request.headers });
// auth.auth 是同一个原生 Better Auth 实例。
```

`genericOAuth({ config: [...] })` 使用已有的 `api.signInSocial()`。多个 OAuth Provider
放在同一次 genericOAuth 调用中。

## 默认认证方式

```yaml
auth:
  username:
    enabled: true
  emailAndPassword:
    enabled: true
    disableSignUp: false
```

UsernameProvider 在注册阶段加入 `username({ displayUsername: false })`。
`username.enabled: false` 关闭默认插件；如需自定义 username，关闭默认插件后在 Provider
中显式登记。用户名字段和历史数据继续保留。

行为遵循 Better Auth：关闭 `emailAndPassword.enabled` 会关闭邮箱密码登录和注册，
已有密码凭据的账号仍可用 username 登录；`disableSignUp` 只关闭原生邮箱密码注册。
OAuth 首次登录的账号创建由对应 OAuth Provider 的选项控制。服务端开关不自动改变
客户端表单，应用需要相应调整 UI。

## 扩展原生实例类型

插件可以从其服务端入口导出类型声明：

```ts
import type { genericOAuth } from 'better-auth/plugins';
import '@nocobase/app-plugin-authentication/server';

declare module '@nocobase/app-plugin-authentication/server' {
  interface AuthenticationPluginTypes {
    genericOAuth: ReturnType<typeof genericOAuth>;
  }
}
```

登记完整的原生插件类型即可。`auth.api` 和 `auth.auth` 的类型由 Better Auth 推导。
声明需要进入应用的 TypeScript 编译项目；它不验证运行时是否启用了插件，也不随
同一编译项目内的不同 App 配置变化。不同插件应使用独立的 API 和字段名称，类型登记
顺序不代表运行时插件顺序。插件新增数据库字段仍需提供独立 migration。

## 独立创建 Auth

```ts
import { databaseManagerToken } from '@nocobase/db';
import { AuthManager } from '@nocobase/app-plugin-authentication';

const database = services.resolve(databaseManagerToken);

const auth = new AuthManager();
auth.init({
  connection: database.connection(),
  baseURL: app.config.get(appConfig).publicOrigin,
  secret: app.config.get(authenticationConfig).secret,
  appName: app.config.get(appConfig).name,
});
```

`auth.init(options)` 接收 Better Auth 配置，并额外要求 NocoBase
`DatabaseConnection`。如果应用的数据库运行时可能为空，应该在创建认证服务前
完成配置校验；不要把缺少连接推迟到首个 HTTP 请求。

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
import type { AuthEnv } from '@nocobase/app-plugin-authentication';

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
import { createAuthStorage } from '@nocobase/app-plugin-authentication';
import { createCaching } from '@nocobase/caching';

const caching = createCaching(app.config.get(cachingConfig));

const auth = new AuthManager();
auth.init({
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
const auth = new AuthManager();
auth.init({
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
