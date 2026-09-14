# Authorization Core

Authorization Core 提供统一的权限判断入口。应用和业务模块可以用它保护订单、文件、
知识库以及自定义资源。

## 快速开始

```ts
import { createAuthorization } from '@nocobase/authorization/core';

const authz = createAuthorization({
  plugins: [],
});
```

`authz` 是应用级实例，负责管理资源规则和请求上下文。一次 HTTP 请求进入后，使用
`authz.for()` 创建请求级实例，或使用 `authz.middleware()` 自动创建。

## 一次授权请求

授权请求由以下部分组成：

```ts
await authz
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
const identity = {
  principal,
  subjects: [{ type: 'role', id: currentRole.id }],
};
```

授权规则可以使用这组 subjects 区分用户当前生效的角色、团队或部门。

Principal 本身也是一个 subject：解析时 `{ type, id }` 会被放在 subjects 列表的首位，
因此 `user:alice` 既是执行者，也可以直接持有权限分配。`Principal` 额外带有
`attributes`，subject 只有 `type` 和 `id`。

subject 的 `type` 是开放字符串，库不认识其中任何一个：`use()` 注册的中间件想加什么
就加什么。subject 中的 `id` 一律按字面量比较，`{ type: 'authenticated', id: '*' }`
里的 `*` 只是这个受众的名字；只有资源 `id` 中的 `*` 才是通配符。

## 注册资源权限

应用可以直接为资源注册 handler。泛型参数会传递到 `request.params`：

```ts
interface PostAuthorizationParams {
  post: Post;
}

authz.resources.add<PostAuthorizationParams>({
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
await authz.for(identity).require({
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

认证中间件先完成身份验证，`authz.middleware()` 再创建请求级授权实例：

```ts
router.use('*', auth.required());
router.use('*', authz.middleware());

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

后台任务或测试可以直接使用 `authz.for(identity)`。

同一个请求级实例会复用当前身份已经解析的 Grants 和 Constraints。一个请求中多次执行
页面、按钮或数据权限判断，不会重复加载相同的基础权限配置。新请求应创建新的实例，
从而读取最新配置。

### `use()` 注册身份解析步骤

`authz.use()` 注册一个解析请求 principal 与 subjects 的步骤。`authz.middleware()`
返回的 Hono 中间件会依次执行已注册的每个步骤，再用解析结果创建请求级授权实例：

```ts
authz.use(async (request, next) => {
  const session = request.http.var.auth;
  request.principal = { type: 'user', id: session.user.id };
  request.subjects.add({ type: 'authenticated', id: '*' });
  await next();
});
```

### `subjects.define()` 补充说明某个 subject 类型

添加 subject 不需要事先声明类型，`subjects.define()` 只是为某个类型补充库无法自己知道
的事实。目前唯一的事实是"哪些 subject 还能行使权限"：

```ts
authz.subjects.define('user', {
  // 一次问清整批 id，而不是逐个判断
  filterActive: (ids, transaction) => enabledUserIds(ids, transaction),
});
```

`filterActive` 收到的是该类型自己的 id，以及调用方正在持有的事务（如果有）。未声明的
类型一律原样通过，所以 `authenticated:*` 这样的受众始终有效。

### `onGrantsChanged()` 订阅授权变更

Grant Provider 知道自己的授权什么时候变了，`authz.onGrantsChanged()` 就把这件事
转达给应用，返回解除订阅的函数。应用因此可以在不知道装的是哪个 Grant Provider 的
情况下让缓存或 Realtime 失效：

```ts
const release = authz.onGrantsChanged((subject) => {
  invalidatePermissions(subject);
});
```

没有实现 `onChange` 的 Grant Provider 不会通告任何变更，此时返回的函数什么也不解除。

### `routes` 插件自己的 HTTP 界面

插件在 `setup` 中注册自己的管理路由，应用只挂载一个分发器，不需要按名字逐个列出插件：

```ts
// 插件侧
setup(authz) {
  authz.routes.add('/sharing-rules', createSharingRulesHandler(service));
}

// 应用侧
const response = authz.routes.handle({
  request: context.req.raw,
  // 相对于挂载点的路径。分发器同时看得到完整路径和自己匹配到的路由模式，
  // 因此挂载点不需要在任何地方声明。
  path: relativePath(context),
  authorization: context.get('authz'),
});
return response ? await response : context.notFound();
```

同一个路径重复注册会抛错，`authz.routes.list()` 返回已注册的路径。没有插件认领的路径
`handle()` 返回 `undefined`，因此应用没有安装的插件天然就是 404，不需要任何存在性判断。

### 基础权限快照

`authz.permissions()` 返回当前身份可以在客户端本地判断的基础权限。带有动态 `policy`
的授权不会进入快照，它们仍然需要由服务端执行：

```ts
const snapshot = await authz.permissions();

// {
//   unrestricted: false,
//   permissions: [
//     {
//       resource: { type: "report", id: "sales-summary" },
//       actions: ["view"],
//     },
//   ],
// }
```

快照中的 `unrestricted` 表示当前身份拥有不受限访问。此时 `permissions` 通常为空，客户端
应当直接放行，而不是去匹配列表。

Core 同时提供 Fetch handler，应用可以自行决定挂载路径：

```ts
router.get('/authz/permissions', (context) =>
  authz.permissions.handler({
    request: context.req.raw,
    authorization: context.get('authz'),
  }),
);
```

这个接口适合在客户端启动或身份切换后请求一次。它主要服务于页面入口、功能入口等
静态判断，不能代替实际业务 API 的服务端授权。

### 不受限访问

Grant Provider 可以实现可选的 `unrestricted(identity)`，用来声明某个身份拥有不受限访问。
返回 `true` 时，Core 跳过该请求的逐资源授权。

资源 handler 可以实现可选的 `authorizeUnrestricted(request)` 来给出这种情况下的判定；不
实现时 Core 直接放行，理由码为 `UNRESTRICTED_ACCESS`。需要返回条件（例如数据库查询用的
filter 和字段范围）的 handler 应当实现它，同时保留自身的合法性校验——未知资源、未知
动作或未注册字段仍然应当拒绝，因为那是请求本身有问题，而不是权限问题。

Permission Sets 插件即是这样一个 Grant Provider：在
`authz.permissionSets.protect({ ..., unrestricted: true })` 中声明的 Permission Set，其持有者
就拥有不受限访问。详见 Permission Sets 的“超级用户（不受限访问）”一节。

### 路由 Guard

直接使用路由参数：

```ts
router.put(
  '/posts/:post',
  authz.guard((context) => ({
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
  authz.guard(async (context) => {
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
authz.describe();
// {
//   plugins: [],
//   resourceTypes: ['report'],
//   constraintResolvers: []
// }
```

Core 在未知资源、handler 异常或不完整的 conditional decision 时返回拒绝决策，便于
业务模块采用安全的默认行为。
