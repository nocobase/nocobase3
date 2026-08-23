# Authorization Core

Authorization Core 提供统一的权限判断入口。应用和业务模块可以用它保护订单、文件、
知识库以及自定义资源。

## 快速开始

```ts
import { createAuthorization } from '@nocobase/authorization/core';

const authorization = createAuthorization({
  plugins: [],
});
```

`authorization` 是应用级实例，负责管理资源规则和请求上下文。一次 HTTP 请求进入后，使用
`authorization.for()` 创建请求级实例，或使用 `authorization.middleware()` 自动创建。

## 一次授权请求

授权请求由以下部分组成：

```ts
await authorization
  .for({
    principal: { type: 'user', id: 'user-alice' },
    subjects: [{ type: 'role', id: 'sales' }],
  })
  .require({
    resource: { type: 'post', id: 'post-1' },
    action: 'update',
    params: { post },
  });
```

- `principal` 是直接执行操作的主体，可以是用户、服务账号或 AI Agent。
- `subjects` 是本次请求生效的角色、团队或部门等主体。
- `resource` 用 `type` 和 `id` 标识受保护的资源。
- `action` 是动作名称，例如 `read`、`update`、`download`。
- `params` 是资源 handler 所需的业务参数，类型由资源注册时的泛型定义。

### Principal

Principal 通常根据应用已经验证的用户创建：

```ts
const principal: Principal = {
  type: 'user',
  id: currentUser.id,
  attributes: { tenantId: currentTenant.id },
};
```

`type + id` 组成稳定标识；`attributes` 适合保存租户、组织等已经验证的事实。
Authorization 不负责读取登录状态，应用需要将已经验证的身份转换成 `Principal`。

### Subjects

请求中经过验证的当前角色可以作为 subject 传入：

```ts
const authz = authorization.for({
  principal,
  subjects: [{ type: 'role', id: currentRole.id }],
});
```

授权规则可以使用这组 subjects 区分用户当前生效的角色、团队或部门。

## 注册资源权限

应用可以直接为资源注册 handler。泛型参数会传递到 `request.params`：

```ts
interface PostAuthorizationParams {
  post: Post;
}

authorization.resources.add<PostAuthorizationParams>({
  resourceType: 'post',

  async authorize(request) {
    const { post } = request.params;
    const allowed =
      request.action === 'update' && request.principal.id === post.userId;

    return {
      effect: allowed ? 'permit' : 'deny',
      reasons: allowed
        ? []
        : [{ code: 'POST_UPDATE_DENIED', message: '只有作者可以修改文章' }],
    };
  },
});
```

调用时传入对应参数：

```ts
await authz.require({
  resource: { type: 'post', id: post.id },
  action: 'update',
  params: { post },
});
```

一个 handler 可以根据 `request.action` 处理同一资源的多个动作，也可以在业务模块中
封装自己的 Policy 类，再由 handler 调用。

## 发起权限判断

### `can()`

返回布尔值，适合按钮显示、下载和删除等直接许可的操作：

```ts
const allowed = await authz.can({
  resource: { type: 'file.object', id: fileId },
  action: 'download',
});
```

### `require()`

授权通过后继续执行；拒绝时抛出 `AuthorizationDeniedError`：

```ts
await authz.require({
  resource: { type: 'file.object', id: fileId },
  action: 'delete',
});

await files.delete(fileId);
```

### `authorize()` 与 `explain()`

两者返回完整的 `AuthorizationDecision`，适合列表查询、审计和需要执行约束的操作：

```ts
const decision = await authz.authorize({
  resource: { type: 'report', id: 'sales-summary' },
  action: 'view',
});
```

决策的 `effect` 有三种：

- `permit`：操作可以直接执行。
- `conditional`：资源模块需要先应用 `conditions` 中的执行条件。
- `deny`：操作被拒绝。

资源模块只处理自己认识的 `conditions.type`。

## HTTP 请求中的用法

认证中间件先完成身份验证，`authorization.middleware()` 再创建请求级 `authz`：

```ts
router.use('*', auth.required());
router.use('*', authorization.middleware());

router.put('/posts/:id', async (context) => {
  const post = await postService.get(context.req.param('id'));
  const authz = context.get('authz');

  await authz.require({
    resource: { type: 'post', id: post.id },
    action: 'update',
    params: { post },
  });

  return context.json(
    await postService.update(post.id, await context.req.json()),
  );
});
```

后台任务或测试可以直接使用 `authorization.for(identity)`。

同一个请求级实例会复用当前身份已经解析的 Grants 和 Constraints。一个请求中多次执行
页面、按钮或数据权限判断，不会重复加载相同的基础权限配置。新请求应创建新的实例，
从而读取最新配置。

### 基础权限快照

`authz.permissions()` 返回当前身份可以在客户端本地判断的基础权限。带有动态 `policy`
的授权不会进入快照，它们仍然需要由服务端执行：

```ts
const snapshot = await authz.permissions();

// {
//   permissions: [
//     {
//       resource: { type: "report", id: "sales-summary" },
//       actions: ["view"],
//     },
//   ],
// }
```

Core 同时提供 Fetch handler，应用可以自行决定挂载路径：

```ts
router.get('/authz/permissions', (context) =>
  authorization.permissions.handler({
    request: context.req.raw,
    authorization: context.get('authz'),
  }),
);
```

这个接口适合在客户端启动或身份切换后请求一次。它主要服务于页面入口、功能入口等
静态判断，不能代替实际业务 API 的服务端授权。

### 路由 Guard

直接使用路由参数：

```ts
router.put(
  '/posts/:post',
  authorization.guard((context) => ({
    resource: {
      type: 'post',
      id: context.req.param('post'),
    },
    action: 'update',
  })),
  async (context) => {
    const post = await posts.findOrFail(context.req.param('post'));
    return context.json(await posts.update(post.id, await context.req.json()));
  },
);
```

传入完整对象：

```ts
router.put(
  '/posts/:post',
  authorization.guard(async (context) => {
    const post = await posts.findOrFail(context.req.param('post'));
    return {
      resource: { type: 'post', id: post.id },
      action: 'update',
      params: { post },
    };
  }),
  updatePost,
);
```

## 业务模块接入

业务模块继续保留自己的 API，在执行前调用授权：

```ts
async function downloadFile(fileId: string, authz: AuthorizationScope) {
  await authz.require({
    resource: { type: 'file.object', id: fileId },
    action: 'download',
  });
  return storage.download(fileId);
}
```

不同资源的参数和 conditions 由对应的业务模块解释，并将授权结果应用到自己的查询、
下载或检索流程。

## 运行状态

```ts
authorization.describe();
// {
//   plugins: [],
//   resourceTypes: ['report'],
//   constraintResolvers: []
// }
```

Core 在未知资源、handler 异常或不完整的 conditional decision 时返回拒绝决策，便于
业务模块采用安全的默认行为。
