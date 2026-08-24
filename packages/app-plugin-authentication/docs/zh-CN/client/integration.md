# 客户端与 Refine 集成

浏览器代码必须从 `@nocobase/app-plugin-authentication/client` 导入。这个入口不包含
Database、Hono 或 Better Auth 服务端实现。

## 创建 AuthClient

```ts
import { createAuthClient } from '@nocobase/app-plugin-authentication/client';
import { createAppClient } from '@nocobase/app-sdk';

const appClient = createAppClient();
const authClient = createAuthClient({ client: appClient });
```

`AuthClient` 通过 `AppClient` 请求相对路径 `auth/*`。应用的 API base 和公开
mount path 应由 `AppClient` 统一处理。

## 查询 Session

```ts
const current = await authClient.getSession();

if (current) {
  console.log(current.user.id, current.user.email);
}
```

客户端 session 结构只暴露 UI 当前需要的字段：

```ts
interface AuthSession {
  user: {
    id: string;
    name: string;
    username?: string | null;
    email: string;
    image?: string | null;
  };
  session: {
    id: string;
    expiresAt: string;
  };
}
```

## 登录与注册

```ts
await authClient.signIn('alice@example.com', password);
await authClient.signIn('alice.admin', password);

await authClient.signUp('Alice', 'alice.admin', 'alice@example.com', password);
```

`signIn()` 使用简单的 identifier 路由规则：包含 `@` 时调用邮箱登录，否则调用
用户名登录。它不是完整的邮箱语法校验。

## 退出与密码重置

```ts
await authClient.signOut();

await authClient.requestPasswordReset(
  'alice@example.com',
  resolveAppUrl('/reset-password'),
);

await authClient.resetPassword(newPassword, token);
```

插件自带的 `/reset-password` 页面会读取 Better Auth 附加在 URL 上的 `token`。
`resolveAppUrl()` 会保留 `/main/` 之类的应用 basename。应用仍必须配置服务端密码
重置邮件发送能力；仅调用客户端方法不会自动提供邮件服务。

## Refine AuthProvider

```ts
import { createAuthProvider } from '@nocobase/app-plugin-authentication/client';

const authProvider = createAuthProvider(authClient);
```

```tsx
<Refine authProvider={authProvider}>{/* routes */}</Refine>
```

适配器实现以下 Refine 行为：

| 方法             | 行为                                                        |
| ---------------- | ----------------------------------------------------------- |
| `login`          | 使用 identifier、email 或 username 登录，成功后默认跳转 `/` |
| `register`       | 创建密码账号，成功后默认跳转 `/login`                       |
| `forgotPassword` | 请求发送重置链接                                            |
| `updatePassword` | 使用 URL 或调用参数中的 token 更新密码，成功后跳转 `/login` |
| `logout`         | 退出并跳转 `/login`                                         |
| `check`          | 有 session 时返回 authenticated，否则跳转 `/login`          |
| `getIdentity`    | 将 session user 映射为 Refine identity                      |
| `onError`        | HTTP 401 时清除缓存并请求 logout                            |

provider 会合并并缓存并发的 session 查询。login、register、logout 和 HTTP 401
会清除当前 identity 缓存，下一次读取重新请求服务端。

## 插件页面与路由

客户端插件清单声明独立的 `bootstrap` 和 `routes` 入口：

```json
{
  "client": {
    "bootstrap": "./client/bootstrap",
    "routes": "./client/routes"
  }
}
```

`bootstrap` 注册 Refine `authProvider`；`routes` 使用 `defineClientRoutes()` 声明
四个 `auth: 'guest'` 的认证路由。每个页面通过 `componentLoader` 独立按需加载，
不会进入初始客户端 bundle。页面只依赖 `@nocobase/app-client/ui`、Refine 和语义化
主题 class，因此能跟随宿主应用主题。

默认页面使用响应式双栏布局：左侧放置品牌、标题和认证表单，桌面端右侧展示平台
说明，窄屏时隐藏说明区域并让表单占满页面。品牌标记、说明面板和图标都由插件自身
提供，不引用宿主应用的组件 alias、公开资源或 `client-old` 目录。

需要品牌化时，应由应用或扩展插件提供明确的替换机制，不再维护一份与运行时页面
重复的可复制 UI registry。
