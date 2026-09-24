---
title: '注册 Tool'
description: '使用 defineTools 注册 AI 员工可调用的后端 Tool，通过 dependencies 声明服务，并设置 Scope、执行位置和权限。'
keywords: 'defineTools,AI Tool,dependencies,AgentContext,ctx.deps,ctx.actor,SPECIFIED,GENERAL,ASK,ALLOW'
---

# 注册 Tool

**Tool** 让 AI 员工读取应用数据或执行业务操作。模型只负责决定何时调用和提供参数，真正的输入校验、用户授权和数据范围必须由 Tool 代码执行。

## 定义后端 Tool

Tool 需要的服务通过 `dependencies` 声明成应用容器里的 token。先在应用自己的 Provider 中定义服务和 token，并在 `server/providers/index.ts` 导出。下面只给出类型和 token，服务实现和注册方式与应用的其他路由共用：

```ts
// server/providers/customers.ts
import type { AgentActor } from '@nocobase/ai-employee';
import {
  createServiceToken,
  type ServiceToken,
} from '@nocobase/service-provider';

export type CustomerRecord = {
  id: string;
  name: string;
};

export interface CustomerService {
  // 按当前用户的权限读取，没有权限或不存在时返回 undefined
  findForActor(
    actor: AgentActor,
    customerId: string,
  ): Promise<CustomerRecord | undefined>;
}

export const customerServiceToken: ServiceToken<CustomerService> =
  createServiceToken<CustomerService>('@acme/example-app/customers');
```

然后在 `server/ai/tools/find-customer.ts` 中默认导出 Tool：

```ts
import { defineTools } from '@nocobase/ai-employee';
import { z } from 'zod';
import { customerServiceToken } from '../../providers/index.js';

export default defineTools({
  scope: 'SPECIFIED',
  execution: 'backend',
  defaultPermission: 'ALLOW',
  i18n: { namespace: '@acme/example-app' }, // 应用 package.json 的真实 name
  introduction: {
    title: 'Find customer',
    about: 'Read one customer that the current user is allowed to access.',
  },
  definition: {
    name: 'find-customer',
    description:
      'Find one customer by ID within the current user access scope.',
    schema: z.object({ customerId: z.string().min(1) }),
  },
  dependencies: { customers: customerServiceToken },
  invoke: async (ctx, { customerId }) => {
    const customer = await ctx.deps.customers.findForActor(
      ctx.actor,
      customerId,
    );
    return customer
      ? { status: 'success', content: customer }
      : { status: 'error', content: 'Customer not found or unavailable.' };
  },
});
```

`defineTools` 的类型参数来自 `dependencies` 里的 token，不是上下文类型。直接写 `defineTools({ ... })`，让 TypeScript 从 `dependencies` 推断出 `ctx.deps` 的类型；写成 `defineTools<AgentContext>({ ... })` 无法通过编译。

返回值统一是 `{ status: 'success' | 'error', content }`，`content` 要能序列化，不能返回数据库连接、DOM、函数或带循环引用的对象。`definition.schema` 要完整描述参数对象，模型不会传入 schema 之外的字段。

## 常用字段

| 字段                | 取值                                 | 作用                                                           |
| ------------------- | ------------------------------------ | -------------------------------------------------------------- |
| `scope`             | `SPECIFIED` \| `GENERAL` \| `CUSTOM` | 谁能用到这个 Tool，见下文「选择 Scope」                        |
| `execution`         | `backend` \| `frontend`              | `invoke` 在哪里运行，`server/ai/tools/` 下的 Tool 用 `backend` |
| `defaultPermission` | `ASK` \| `ALLOW`                     | 每次调用前是否要用户确认，省略时是 `ASK`                       |
| `i18n.namespace`    | 应用或插件 `package.json` 的 `name`  | 管理页显示 Tool 标题和介绍时使用的翻译命名空间                 |
| `introduction`      | `{ title, about? }`                  | 管理页显示的标题和介绍，英文原文本身就是翻译键                 |
| `definition`        | `{ name, description, schema }`      | 注册名、给模型看的说明和参数 schema                            |
| `dependencies`      | 名称到容器 token 的映射              | 运行时解析后放在 `ctx.deps` 上                                 |

`introduction.title` 和 `introduction.about` 写可读的英文原文，在应用 `client/locales/` 的语言包里用同一段英文作为键，提供 `en-US` 和 `zh-CN` 的条目。翻译只影响显示，`definition.description`、schema 等给模型看的内容保持不变。

## Tool 能拿到什么

`invoke` 的第一个参数是 `AgentContext`，只包含下面几项：

| 属性          | 内容                                                                        |
| ------------- | --------------------------------------------------------------------------- |
| `ctx.deps`    | 这个 Tool 在 `dependencies` 中声明的服务，已经从应用容器解析好              |
| `ctx.actor`   | 当前用户身份：`id`、`roles`、`isRoot`，以及可选的 `locale`                  |
| `ctx.state`   | 这次执行的数据，比如 `sessionId`、`messageId`、已解析的 `model`、`timezone` |
| `ctx.runtime` | 运行时借给 Tool 的能力：`logger`，以及可选的 `translate` 和 `getHeader`     |

`ctx` 上没有数据库、容器或应用管理器的句柄，也没有 `ctx.database`、`ctx.repositories`、`ctx.logger` 这类属性。需要什么服务，就在 `dependencies` 里声明它的 token——通常就是应用路由已经在用的那个服务，由 `server/providers/` 下的 Provider 注册。容器解析不到某个 token 时，这次执行会失败，错误信息里带着 Tool 名和 token 名。

日志写到 `ctx.runtime.logger`，本地化用 `ctx.runtime.translate`，时区读 `ctx.state.timezone`，不要自己再去解析 `x-timezone` 请求头。

`ctx.actor` 是唯一可信的身份。模型可以在参数里写任何东西，包括一个用户 ID，所以不要把模型传入的 `userId` 当作授权依据。

## 写入业务数据

会写数据的 Tool 要自己负责三件事，运行时不会替它做。

**授权。** 检查放在 Tool 所用的服务里，针对 `ctx.actor` 执行，不要写在提示词或 schema 里，也不要写成 `ctx.actor.roles.includes('admin')`。优先声明一个已经执行应用权限规则的服务 token，而不是一个原始的数据库句柄。

应用服务通常依靠授权中间件安装的请求 scope 做检查，而 Tool 调用没有请求。所以 Tool 声明的服务要从 actor 自己建出同样的 scope，带上中间件会加的主体——`authenticated:*`，以及授权服务为这个用户解析出的全部成员关系：

```ts
import { authorizationToken } from '@nocobase/app-plugin-authorization';

// 在 Tool 声明的应用服务内部，authz 从 authorizationToken 解析
const principal = { type: 'user', id: String(actor.id) };
const scope = authz.for({
  principal,
  subjects: [
    { type: 'authenticated', id: '*' },
    ...(await authz.subjects.resolveFor(principal)),
  ],
});
const decision = await scope.authorize({
  resource: { type: 'resource', id: 'sales.orders' },
  action: 'create',
});
```

漏掉 `resolveFor` 时检查照样会执行，但授予团队或其他成员关系的权限都会被拒绝。拿到 decision 之后怎样拒绝、怎样把条件绑定到写入上，属于授权插件的内容，见 [权限](../../authorization/index.md)。

**事务。** 一次 Tool 调用应当留下一个一致的状态。写入跨多个集合时，在 Tool 声明的应用服务内部开启并管理事务。

**幂等。** 模型会重试——超时后、断线后、被告知结果不对之后。两次相同的调用不能产生两条记录。用调用方提供的或数据本身决定的值作为写入的键，记录已经存在时返回已有记录，而不是报错。

另外，会持久化数据的 Tool 设置 `defaultPermission: 'ASK'`，并在 `content` 中返回新建记录的标识，方便对话后面引用它。

## 选择 Scope

| `scope`     | 使用方式                                                   |
| ----------- | ---------------------------------------------------------- |
| `GENERAL`   | 所有员工都能用到，适合真正通用且低耦合的能力               |
| `SPECIFIED` | 由 Employee、Skill 或会话设置显式启用，应用 Tool 默认用它  |
| `CUSTOM`    | 由调用方或管理员按员工选择，管理页可以单独调整它的调用权限 |

默认使用 `SPECIFIED`。不要为了让某个员工找到 Tool 就改成 `GENERAL`，应当在 Employee 的 `tools` 或 Skill 的 `tools` 中绑定它。注意，只要有 Skill 点名了某个 Tool，它就要等会话加载那个 Skill 之后才可用，详见 [注册 AI 员工](./employee.md#字段说明)。

## 选择权限

| `defaultPermission` | 行为                                   |
| ------------------- | -------------------------------------- |
| `ASK`               | 执行前暂停，由用户允许、拒绝或修改参数 |
| `ALLOW`             | 满足运行时策略时可以直接执行           |

写入数据、发送消息、触发流程、跳转到有副作用的页面或执行不可逆操作时使用 `ASK`。只有无副作用、可重复且结果范围清晰的读取，才考虑 `ALLOW`。

## 注册 Tool

在 `server/ai/index.ts` 中静态 import，并交给 `ToolsManager`：

```ts
protected override async registerTools(manager: ToolsManager): Promise<void> {
  await manager.registerTools(findCustomer);
}
```

这里没有 Tool 文件系统扫描，没有注册的文件不会生效。同名 Tool 后注册的会覆盖先注册的，如果确实要覆盖，应当是明确的决定，不要依赖目录遍历顺序。

## 相关链接

- [定义自己的 AI 员工](./index.md) — 注册应用 AI 资源
- [注册 AI 员工](./employee.md) — 把 Tool 绑定给员工
- [注册 Skill](./skill.md) — 从 Skill 激活 Tool
- [页面上下文](../components/context.md) — 注册只在当前页面可用的前端 Tool
- [Tool 卡片](../components/tool-cards.md) — 为 Tool 结果提供专用界面
- [权限](../../authorization/index.md) — 业务操作、权限集和数据范围
