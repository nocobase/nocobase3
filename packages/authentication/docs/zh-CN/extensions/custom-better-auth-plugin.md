# 开发 Better Auth 没有的登录插件

如果目标身份平台使用标准 OAuth 2.0 或 OIDC，通常可以直接使用 Better Auth 的
`genericOAuth` plugin。Magic Link、Email OTP、用户名等常见能力也已有官方
plugin。

真正需要自定义 plugin 的情况，通常是身份平台采用了非标准 ticket、专有签名、
设备回调或企业内部协议。这篇文档介绍如何在基于 `app-template-default` 的应用里
完成这样的扩展。

## 开始前先确认三件事

### 现有能力确实不能满足

建议依次确认：

1. Better Auth 是否有内置 social provider；
2. `genericOAuth` 能否描述这个平台；
3. Better Auth 是否已经提供对应 plugin；
4. 这项能力是否只是登录后的普通业务 API。

只有登录流程需要参与身份校验、账号绑定、session 创建或认证数据模型时，才值得
写一个 Better Auth plugin。

### 身份平台提供稳定的用户标识

插件需要把外部用户映射到 NocoBase 用户。推荐的账号键是：

```text
issuer + subject
```

`issuer` 表示身份来源，`subject` 是该来源下不会随邮箱、昵称变化的用户 ID。
如果平台只能返回可能变化的邮箱或手机号，需要先和平台或产品负责人确认绑定策略。

### 登录协议有明确的安全约束

开始开发前，至少要知道：

- ticket、code 或签名如何验证；
- 凭据多长时间过期；
- 是否只能使用一次；
- callback URL 如何限制；
- 是否需要校验 issuer、audience、domain、state 或 nonce；
- 首次登录是否允许自动创建用户；
- 退出是否需要同步通知身份平台。

## 推荐的应用目录

可以把扩展放在应用自己的认证目录中：

```text
server/auth/ticket/
  plugin.ts
  protocol-client.ts
  types.ts

server/migrations/
  202608210001_create_ticket_accounts.ts

client/auth/ticket/
  auth.ts
  sign-in-button.tsx
  callback-page.tsx
```

`plugin.ts` 只负责 Better Auth 接入；`protocol-client.ts` 负责调用身份平台、验证
签名和解析身份。前端实现放在 `client/auth/ticket`，再由应用自己的登录页和路由
直接引用。

## 用一次性 Ticket 登录举例

假设身份平台把用户带回应用，并提供一个一次性 `ticket`。完整流程是：

```text
用户点击登录
  -> 跳转到身份平台
  -> 身份平台返回 ticket
  -> 浏览器调用 /api/auth/sign-in/ticket
  -> plugin 向身份平台验证 ticket
  -> 查找或创建外部账号绑定
  -> 创建 Better Auth session
  -> 写入 session Cookie
  -> 返回应用页面
```

## 1. 定义 plugin 配置

先把身份平台相关的行为收敛成一个清晰接口：

```ts
export interface TicketAuthPluginOptions {
  issuer: string;
  audience: string;
  allowSignUp?: boolean;
  verifyTicket: (input: {
    ticket: string;
    request: Request;
  }) => Promise<{
    subject: string;
    email?: string;
    emailVerified: boolean;
    name?: string;
    expiresAt: Date;
  }>;
}
```

应用配置负责提供 issuer、audience、endpoint 和 secret；`verifyTicket` 负责把不同
平台的响应转换成稳定的身份结果。

## 2. 实现协议客户端

`protocol-client.ts` 通常需要处理：

- 请求超时和最大响应大小；
- HTTPS endpoint 和证书校验；
- provider 签名或公钥轮换；
- issuer、audience、domain 和过期时间；
- provider 错误码；
- 返回字段的格式检查。

不要把原始 ticket、access token、private key 或签名内容写入日志。日志可以记录
provider、请求 ID、耗时和错误类别。

## 3. 创建 Better Auth plugin

Better Auth 提供公开的 plugin 类型和 endpoint helper：

```ts
import type { BetterAuthPlugin } from 'better-auth';
import { APIError, createAuthEndpoint } from 'better-auth/api';
```

一个 plugin 至少需要稳定的 `id` 和 endpoint：

```ts
export function ticketAuthPlugin(
  options: TicketAuthPluginOptions,
): BetterAuthPlugin {
  return {
    id: 'nocobase-ticket-auth',
    version: '0.1.0',
    endpoints: {
      signInWithTicket: createAuthEndpoint(
        '/sign-in/ticket',
        {
          method: 'POST',
          requireRequest: true,
          body: ticketBodySchema,
          metadata: {
            noStore: true,
          },
        },
        async (context) => {
          const identity = await options.verifyTicket({
            ticket: context.body.ticket,
            request: context.request,
          });

          if (identity.expiresAt <= new Date()) {
            throw new APIError('UNAUTHORIZED', {
              code: 'TICKET_EXPIRED',
              message: 'The sign-in ticket has expired.',
            });
          }

          // 接下来依次完成：
          // 1. 原子消费 ticket 摘要，避免重复使用；
          // 2. 按 issuer + subject 查找账号绑定；
          // 3. 按应用策略查找或创建用户；
          // 4. 创建 Better Auth session；
          // 5. 用 Better Auth Cookie helper 写入 session Cookie；
          // 6. 返回必要的 user/session 信息。
        },
      ),
    },
    rateLimit: [
      {
        pathMatcher: (path) => path === '/sign-in/ticket',
        window: 60,
        max: 5,
      },
    ],
    $ERROR_CODES: {
      INVALID_TICKET: {
        code: 'INVALID_TICKET',
        message: 'The sign-in ticket is invalid.',
      },
      TICKET_EXPIRED: {
        code: 'TICKET_EXPIRED',
        message: 'The sign-in ticket has expired.',
      },
      TICKET_REPLAYED: {
        code: 'TICKET_REPLAYED',
        message: 'The sign-in ticket has already been used.',
      },
    },
    options,
  };
}
```

`ticketBodySchema` 使用当前应用选择的 Standard Schema 兼容校验库定义。若使用
Zod，应把 Zod 声明为应用的直接依赖，并限制 ticket 长度，避免把任意大输入传给
外部平台。

### 关于 session 创建

自定义登录最终仍应创建 Better Auth session，并使用 Better Auth 提供的 Cookie
helper。这样默认模板中的这些能力才能继续工作：

```ts
auth.getSession(headers)
auth.required()
createAuthProvider(authClient)
```

具体方法应以应用所安装 Better Auth 版本的 plugin 文档和公开类型为准。优先使用：

- endpoint context 提供的 adapter 和 internal adapter；
- `better-auth/cookies` 公开导出的 Cookie helper；
- `better-auth/api` 公开导出的 `APIError` 和 middleware。

不要从 Better Auth 未公开的 `dist/*` 路径导入，也不要另外生成一套 JWT 或把
session token 存进 localStorage。这会绕开默认的 session、Cookie 和退出机制。

## 4. 决定如何保存账号绑定

如果协议只需要标准 provider 信息，可以优先复用 authentication 已有的 `account`
表：

```text
providerId  -> plugin/provider ID
issuer      -> 身份来源
accountId   -> 外部 subject
userId      -> NocoBase user ID
```

如果还需要保存租户 ID、设备 ID 或其他需要查询的协议字段，可以为 plugin 增加
独立 model，例如 `ticketAccount`。

Better Auth plugin 可以通过 `schema` 描述 model：

```ts
const ticketAccountSchema = {
  ticketAccount: {
    fields: {
      userId: {
        type: 'string',
        required: true,
        index: true,
      },
      issuer: {
        type: 'string',
        required: true,
      },
      subject: {
        type: 'string',
        required: true,
      },
      createdAt: {
        type: 'date',
        required: true,
      },
      updatedAt: {
        type: 'date',
        required: true,
      },
    },
  },
} as const;
```

把 schema 放进 plugin 返回值：

```ts
return {
  id: 'nocobase-ticket-auth',
  schema: ticketAccountSchema,
  // endpoints、rateLimit 等配置
};
```

schema 让 Better Auth 知道如何访问 model，但应用仍然需要自己的 NocoBase
migration。

## 5. 增加 NocoBase migration

在 `server/migrations/` 中创建对应表：

```ts
import { defineMigration } from '@nocobase/database';

export default defineMigration({
  name: '202608210001_create_ticket_accounts',

  async up({ builder }) {
    await builder.createCollection('ticketAccount', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('userId', { length: 64 }).notNull();
      collection.string('issuer', { length: 512 }).notNull();
      collection.string('subject', { length: 512 }).notNull();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();

      collection.primary('id', { name: 'pk_ticket_account' });
      collection.unique(['issuer', 'subject'], {
        name: 'uq_ticket_account_issuer_subject',
      });
      collection.index('userId', {
        name: 'idx_ticket_account_user',
      });
    });
  },

  async down({ builder }) {
    await builder.dropCollection('ticketAccount');
  },
});
```

`issuer + subject` 的唯一约束很重要：它既防止同一外部账号被重复绑定，也能帮助
处理两个首次登录请求同时到达的情况。

plugin schema 和 migration 应保持一致。增加字段时，两处需要一起更新。

## 6. 防止 ticket 被重复使用

一次性 ticket、code 或 nonce 不应只靠“先查询、后删除”处理。并发请求可能在
删除前都读取到同一个值。

更稳妥的做法是：

1. 对原始凭据生成带用途前缀的安全摘要；
2. 只保存摘要，不长期保存原文；
3. 设置较短的过期时间；
4. 验证时使用原子 consume；
5. 对 endpoint 配置限流；
6. 多实例部署使用共享数据库或 secondary storage。

即使身份平台声称 ticket 只能使用一次，应用侧仍值得保留 replay 防护，以覆盖
网络重试和并发请求。

## 7. 选择用户创建和绑定策略

常见策略有三种。

### 只允许已有绑定

找不到 `issuer + subject` 时拒绝登录。用户需要由管理员或在已登录状态下完成
绑定。这种方式最保守，适合企业内部系统。

### 首次登录自动创建用户

仅在应用明确允许注册时使用。需要处理 provider 不返回 email/name 的情况，并
确保生成的占位字段不会冒充已验证联系方式。

### 按已验证邮箱关联已有用户

这种方式最方便，也最容易造成账号接管。只有身份平台的 email 验证语义可信，且
产品明确允许跨 provider 合并时才使用。还应考虑邮箱被回收、租户隔离和冲突审计。

不要仅因为两个系统返回相同邮箱，就默认它们属于同一个人。

## 8. 注册 plugin

在应用创建 authentication service 时加入 plugin：

```ts
const auth = createAuthentication({
  connection: runtime.database?.connection(),
  secret: config.auth.secret,
  plugins: [
    ticketAuthPlugin({
      issuer: config.auth.ticket.issuer,
      audience: config.auth.ticket.audience,
      verifyTicket: ticketProtocolClient.verify,
      allowSignUp: false,
    }),
  ],
});
```

默认模板已经挂载 `/api/auth/*`，因此 `/sign-in/ticket` 会出现在：

```text
POST /api/auth/sign-in/ticket
```

不需要再为它创建一条独立的 Hono route。

## 9. 增加客户端登录入口

当前 NocoBase authentication client 通过 `AppClient` 调用认证接口。可以在应用中
封装一个小 client：

```ts
import type { AppClient } from '@nocobase/app-sdk';

export class TicketAuthClient {
  constructor(private readonly client: AppClient) {}

  async signIn(ticket: string): Promise<void> {
    await this.client.request('auth/sign-in/ticket', {
      method: 'POST',
      body: JSON.stringify({ ticket }),
    });
  }
}
```

登录成功后，让现有 Refine `AuthProvider` 重新查询 session。不要直接用 provider
返回的 profile 替换前端 identity，因为服务端可能已经做了账号绑定、字段映射和
用户状态检查。

Better Auth 还提供 `BetterAuthClientPlugin`，适合使用 Better Auth 原生 client 的
项目做 endpoint 类型推导、actions 和状态 signals。默认模板没有使用那套 client，
所以一般不需要额外实现它。

## 10. 测试完整流程

建议至少覆盖：

### 正常登录

- 新用户首次登录；
- 已绑定用户再次登录；
- session Cookie 被正确写入；
- 登录后可以访问 `auth.required()` 保护的接口；
- 退出后 session 失效。

### 凭据和 callback

- ticket 无效、过期或被篡改；
- issuer、audience 或 domain 不匹配；
- 用户取消登录；
- callback URL 不在允许范围；
- 同一个 ticket 第二次使用失败。

### 账号和并发

- 不允许注册时，未知 subject 被拒绝；
- 已验证邮箱冲突按产品策略处理；
- 两个并发首次登录只创建一个账号绑定；
- 唯一约束冲突后能够重新读取已有绑定。

### Migration

- migration up/down；
- 字段、唯一约束和索引与 plugin schema 一致；
- 下划线和非下划线命名策略下都能访问；
- 没有意外增加物理 foreign key。

测试可以使用内存 SQLite 和本地 fake provider，不需要访问真实身份平台。

## 上线前检查

- [ ] provider endpoint、issuer 和 audience 使用生产配置。
- [ ] secret 或 private key 只存在于服务端。
- [ ] callback URL 已在身份平台和应用两侧登记。
- [ ] Cookie path 与应用公开子路径一致。
- [ ] 一次性凭据有过期、原子消费和限流。
- [ ] migration 已在目标数据库执行。
- [ ] 多实例环境使用共享存储。
- [ ] 日志不包含 ticket、code、token 或签名原文。
- [ ] 用户创建和账号绑定策略已经产品确认。
- [ ] 成功、失败、并发和重复使用测试均通过。

## 让 AI Agent 协助实现

可以向 Agent 提供目标平台的协议文档、测试账号或 fake provider 说明，再使用类似
下面的任务描述：

```text
请在这个基于 app-template-default 的应用中实现 <平台名称> 登录。

该平台使用非标准 <ticket/signature> 协议，Better Auth 当前没有对应 provider 或
plugin。请把协议调用封装在 server/auth/<name>/protocol-client.ts，把 Better Auth
接入放在 plugin.ts。账号绑定使用稳定的 issuer + subject。

请同时完成 NocoBase migration、plugin 注册、客户端登录入口、callback UI 和测试。
session 与 Cookie 必须继续使用 Better Auth；一次性凭据需要过期、原子消费和限流。
不要仅按未验证邮箱合并账号，也不要记录凭据原文。

完成后运行应用的 lint、typecheck、test 和 build，并列出部署需要的环境变量、
callback URL 和仍然存在的限制。
```
