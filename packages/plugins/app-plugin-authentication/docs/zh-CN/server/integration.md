# 服务端认证配置

应用在 `server/config/auth.ts` 提供默认认证 options：

```ts
import {
  defineAppConfig,
  type AppConfigFactory,
} from '@nocobase/app-server/config';
import { username } from 'better-auth/plugins';
import { type AuthConfig } from '@nocobase/app-plugin-authentication/server';

const auth: AppConfigFactory<AuthConfig> = defineAppConfig((runtime) => ({
  plugins: [username({ displayUsername: false })],
  emailAndPassword: {
    enabled: true,
    autoSignIn: false,
    // disableSignUp: true,
    // sendResetPassword: async ({ user, url }) => { /* 发送邮件 */ },
  },
  session: { storeSessionInDatabase: true },
}));

export default auth;
```

`AuthConfig` 复用原生认证 options。应用可以直接填写插件、social providers 和邮件回调。用户名插件由 `plugins` 数组决定；邮箱密码登录与注册分别使用 `emailAndPassword.enabled`、`emailAndPassword.disableSignUp` 配置。

模板的 `server/config/index.ts` 使用 `defaultAppConfigs({ auth })` 汇总模块配置。runtime 先加载静态配置，执行代码配置工厂并合并得到最终 options；入口随后创建应用。优先级为默认值、TS 配置、YAML、已声明的环境变量映射。普通对象按字段合并，数组和函数整体替换。

```yaml
auth:
  secret: 至少 32 个字符的部署密钥
app:
  publicOrigin: https://example.com
```

认证 Provider 从 `app.config.get<AuthConfig>('auth')` 读取最终 options，补充数据库、缓存、ID 生成和公开路径等运行时依赖，然后创建认证服务。修改认证配置后重启应用。

```ts
const auth = runtime.app!.container.resolve(authenticationToken);
const session = await auth.getSession(request.headers);
const nativeSession = await auth.api.getSession({ headers: request.headers });
```

业务路由仍通过 `auth.required()` 或 `auth.optional()` 明确指定认证策略。Better Auth 原生插件的数据库扩展需要对应的迁移；配置插件不会自动创建表。
