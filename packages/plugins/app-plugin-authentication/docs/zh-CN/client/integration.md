# 客户端与 Refine 集成

在应用的 `client/config/auth.ts` 中配置认证客户端：

```ts
import { defineAppConfig, type AppConfigFactory } from '@nocobase/app-client';
import { username } from 'better-auth/plugins';
import { usernameClient } from 'better-auth/client/plugins';
import { type AuthConfig } from '@nocobase/app-plugin-authentication/client';

const auth: AppConfigFactory<AuthConfig> = defineAppConfig((runtime) => ({
  plugins: [usernameClient({ displayUsername: false })],
}));

export default auth;
```

`client/config/index.ts` 通过 `defaultAppConfigs({ auth })` 汇总配置；runtime 执行配置函数并与公开静态配置合并；入口随后创建应用。认证 Provider 从 `app.config` 读取 options，调用原生 `createAuthClient()`，并根据应用的公开路径设置默认 URL。服务端和客户端的用户名插件配置应保持一致。

## 原生客户端 API

需要独立使用客户端时，从插件入口导入 `createAuthClient`：

```ts
import { createAuthClient } from '@nocobase/app-plugin-authentication/client';

const client = createAuthClient({
  baseURL: 'https://example.com/main/api/auth',
  plugins: [usernameClient({ displayUsername: false })],
});

const { data: session, error } = await client.getSession();
await client.signIn.email(
  { email: 'alice@example.com', password },
  { throw: true },
);
await client.signIn.username({ username: 'alice', password }, { throw: true });
await client.signUp.email({
  name: 'Alice',
  username: 'alice',
  email: 'alice@example.com',
  password,
});
await client.signOut();
await client.requestPasswordReset({
  email: 'alice@example.com',
  redirectTo: 'https://example.com/main/reset-password',
});
await client.resetPassword({ newPassword, token });
```

默认请求返回 `{ data, error }`。设置 `throw: true` 后，成功时直接返回数据，失败时抛出错误。服务端需要在 `server/config/auth.ts` 提供密码重置邮件回调。

## 页面与 Refine

插件的 ServiceProvider 为 Refine 注册认证适配器。页面继续使用 `client/actions` 提供的登录、注册和重置密码 hooks。适配器处理原生 API 的返回值与错误，并在登录、注册、退出或会话失效时刷新实时连接。

独立接入 Refine 时，调用 `createAuthProvider(client, realtime)`，其中 `realtime` 提供 `reconnect()`。
