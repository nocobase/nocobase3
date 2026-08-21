# 客户端与 Refine 集成

浏览器代码必须从 `@nocobase/authentication/client` 导入。这个入口不包含
Database、Hono 或 Better Auth 服务端实现。

## 创建 AuthClient

```ts
import { createAuthClient } from '@nocobase/authentication/client';
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
  `${window.location.origin}/reset-password`,
);
```

应用必须配置服务端密码重置邮件发送能力，并实现 redirect target 页面；仅调用
客户端方法不会自动提供邮件服务或页面。

## Refine AuthProvider

```ts
import { createAuthProvider } from '@nocobase/authentication/client';

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
| `logout`         | 退出并跳转 `/login`                                         |
| `check`          | 有 session 时返回 authenticated，否则跳转 `/login`          |
| `getIdentity`    | 将 session user 映射为 Refine identity                      |
| `onError`        | HTTP 401 时清除缓存并请求 logout                            |

provider 会合并并缓存并发的 session 查询。login、register、logout 和 HTTP 401
会清除当前 identity 缓存，下一次读取重新请求服务端。

## UI registry

包内 [`ui/password`](../../../ui/password) 提供可复制的登录和注册表单。registry
声明位于 [`ui/registry.json`](../../../ui/registry.json)。

这些文件是应用源码模板，不属于 npm runtime export。模板依赖：

- Refine hooks；
- 应用的 `@/components/ui/button`；
- 应用的 `@/components/ui/input`；
- 应用的 `@/components/ui/label`。

应用可以复制后修改布局和文案，不应从 `@nocobase/authentication/ui/*` 直接做
运行时导入。
