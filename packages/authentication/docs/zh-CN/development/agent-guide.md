# 用 AI Agent 扩展认证方式

这篇指南适合两类读者：希望在应用里增加登录方式的开发者，以及协助完成这项工作
的 AI Agent。

这里假设应用基于 `app-template-default` 创建，`@nocobase/authentication` 已作为
发布包安装。Agent 能修改的是应用代码，不需要、通常也无法读取 authentication
包的仓库源码。

## 先了解应用里的认证结构

默认模板已经把认证分成了几块：

```text
server/config/auth.ts
  认证配置和环境变量

server/runtime/deps.ts
  创建 Auth，并接入数据库和缓存

server/routes/api/auth.ts
  把 /api/auth/* 交给 Better Auth

server/migrations/
  应用拥有的认证表结构

client/auth/
  用户自己的认证 client、页面和组件
```

新增认证方式时，可以把客户端实现放在 `client/auth/<provider>`，然后由应用的
登录页、路由或其他组合入口直接引用。

开始前，Agent 可以先阅读这些应用文件，再查看：

- 当前安装的 `@nocobase/authentication` 版本及其文档；
- 当前应用使用的 Better Auth 版本；
- 目标 provider 或 plugin 对应版本的 Better Auth 官方文档；
- 应用现有的路由、登录页面和 migration。

重点是确认公开 API 和应用接入点，而不是研究 authentication 包的内部实现。

## 先选最合适的扩展方式

增加一种登录方式时，建议按下面的顺序判断：

| 需求                                       | 推荐方式                                   |
| ------------------------------------------ | ------------------------------------------ |
| GitHub、Google 等 Better Auth 已支持的平台 | 配置 `socialProviders`                     |
| 标准 OAuth 2.0 或 OIDC 服务                | 使用 Better Auth `genericOAuth` plugin     |
| Magic Link、Email OTP 等已有功能           | 使用对应的 Better Auth 官方 plugin         |
| 登录后的普通业务操作                       | 增加 Hono API，并用 `auth.required()` 保护 |
| 非标准 ticket、签名或企业协议              | 开发自定义 Better Auth plugin              |

前面三种方式通常更容易维护，也能直接复用 Better Auth 已有的安全处理。只有现有
能力确实不能描述目标协议时，才需要自定义 plugin。

## 和 Agent 一起明确需求

在开始写代码前，可以让 Agent 先整理一张简单的认证说明：

```text
登录方式：
协议或身份平台：
如何发起登录：
如何返回应用：
外部用户的稳定 ID：
是否允许首次登录自动创建用户：
如何绑定已有用户：
是否需要新增表或字段：
需要哪些环境变量：
生产 callback URL：
退出时是否需要同步退出身份平台：
```

这里最值得提前确认的是“外部用户的稳定 ID”。OAuth/OIDC 通常使用 issuer 和
subject；企业 ticket 协议也应该提供类似的稳定标识。邮箱适合展示和联系用户，
但未必适合充当跨系统账号主键。

## 应用里的推荐实现顺序

### 1. 增加配置

在 `server/config/auth.ts` 或相邻配置文件中读取 provider 所需的环境变量，例如：

```ts
const clientId = env.string("ACME_CLIENT_ID");
const clientSecret = env.string("ACME_CLIENT_SECRET");

if (!clientId || !clientSecret) {
  throw new Error("ACME_CLIENT_ID and ACME_CLIENT_SECRET are required.");
}
```

secret 只保留在服务端配置里，不通过 Vite 环境变量传给浏览器。

### 2. 注册 provider 或 plugin

默认模板在 `server/runtime/deps.ts` 中调用 `createAuthentication()`。可以把新的
provider 或 plugin 配置传进去：

```ts
const auth = createAuthentication({
  connection: runtime.database?.connection(),
  secret: config.auth.secret,
  plugins: [myAuthPlugin(config.auth.myProvider)],
});
```

模板已经把 `/api/auth/*` 交给 `auth.handler()`，因此 Better Auth plugin 新增的
endpoint 通常会自动生效，不需要再写一套重复的 Hono 路由。

### 3. 补充 migration

有些 provider 只使用现有的 `user`、`session`、`account`、`verification` 表；有些
plugin 会增加字段或 model。

如果需要新结构，应在应用的 `server/migrations/` 中增加 migration。应用应把
migration 当作自己的数据库历史，而不是在生产环境依赖 Better Auth 自动改表。

```text
server/migrations/
  202608200001_create_authentication_tables.ts
  202608210001_add_my_auth_provider.ts
```

可以让 Agent 对照 plugin 文档中的 schema，逐项列出字段、类型、唯一约束和索引，
再转换为 `@nocobase/database` Fluent DSL。

### 4. 增加客户端入口

简单场景可以直接通过现有 `AppClient` 请求 plugin endpoint：

```ts
await appClient.request("auth/sign-in/my-provider", {
  method: "POST",
  body: JSON.stringify(input),
});
```

如果多个页面都要使用，建议在 `client/auth/<provider>/auth.ts` 中封装成具名
client。登录成功后继续使用默认 Refine `AuthProvider` 查询 session，不需要另外
维护一份浏览器身份状态。

### 5. 增加登录 UI 和 callback 页面

根据协议补充登录按钮、表单或 callback 页面，并处理：

- 请求进行中的状态；
- 用户取消；
- provider 返回错误；
- callback 成功后的跳转；
- 重复点击或重复 callback；
- 登录完成后的 session 刷新。

密码登录 UI 可以继续保留，让应用同时提供多种认证方式。

应用可以直接在自己的登录页中导入组件：

```tsx
import { MyProviderSignInButton } from "@/auth/my-provider/sign-in-button";
```

如果 callback 需要独立页面，也可以直接在应用自己的路由配置中引用
`client/auth/my-provider/callback-page.tsx`。

## Agent 应交付哪些内容

一次完整扩展通常包括：

```text
服务端配置
provider 或 plugin 注册
必要的 migration
客户端 helper
登录或 callback UI
成功与失败流程测试
环境变量和部署说明
```

如果某一项不需要，也可以在交付说明中写清原因。例如：“该 plugin 只使用标准
verification 表，因此不新增 migration。”

## 建议的测试场景

除了成功登录，最好让 Agent 一起覆盖这些情况：

- 新用户首次登录；
- 已绑定用户再次登录；
- 无效、过期或被篡改的 code、ticket、nonce；
- 同一个一次性凭据被重复使用；
- provider 返回错误或用户取消；
- callback URL 不在允许范围；
- 两个首次登录请求同时到达；
- 登录后能访问 `auth.required()` 保护的 API；
- 退出后 session 失效；
- 应用部署在子路径时 Cookie 和 callback 仍然正确。

涉及外部身份平台时，可以在测试中使用本地 fake provider 或 mock transport，避免
测试依赖真实账号和生产系统。

## 数据库方面需要留意什么

authentication 的 Database adapter 当前不支持 Better Auth join 查询。如果目标
plugin 需要 join，Agent 应先说明这个兼容性问题，再决定是调整 plugin 数据访问，
还是由 authentication 包的新版本提供 adapter 支持。

新增账号绑定表时，通常应给外部账号键增加唯一约束，例如：

```text
issuer + subject
```

这样既能防止重复绑定，也能帮助处理并发首次登录。

## 安全方面需要留意什么

认证扩展涉及账号接管风险，下面几项值得让 Agent 明确检查：

- callback、issuer、audience、domain 和 state/nonce 是否经过验证；
- 一次性 ticket 或 code 是否能原子消费；
- 登录 endpoint 是否有限流；
- 日志是否避开密码、ticket、token 和签名原文；
- 是否在未经产品确认的情况下按相同邮箱自动合并账号；
- Cookie 是否继续由 Better Auth 创建和管理；
- secret 是否只存在于服务端。

并不是每种协议都需要同样的检查，但 Agent 应说明哪些适用、哪些不适用。

## 验证修改

完成后，至少运行所有被修改 package 的：

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

如果修改了依赖，还需要同步 lockfile：

```bash
CI=true pnpm install --no-frozen-lockfile
```

## 推荐的 Agent 任务描述

可以把下面这段作为任务起点，再补充具体身份平台信息：

```text
请为这个基于 app-template-default 的应用增加 <登录方式>。

先检查当前应用的 authentication 配置、migration、API 路由和登录 UI，并确认
当前版本 Better Auth 是否已有 social provider、genericOAuth 配置或官方 plugin。
优先使用已有能力；只有现有能力无法满足时才设计自定义 plugin。

请交付服务端配置、必要的 migration、客户端 helper、登录/callback UI、测试和
部署说明。账号绑定使用稳定的 issuer + subject，不要仅按未验证邮箱合并账号。
完成后运行受影响 package 的 lint、typecheck、test 和 build，并报告结果与仍需
部署方提供的环境变量。
```

如果确认需要自定义 plugin，继续阅读
[开发 Better Auth 没有的自定义插件](../extensions/custom-better-auth-plugin.md)。
