---
title: Repository API 快速开始
description: 基于 Repository 示例插件，使用 defineRepositoryApiRoutes 声明服务端接口，通过 api.repository() 完成查询与写入，并选择 JSON AST 或 Builder 参数风格。
---

# Repository API 快速开始

服务端用 `defineRepositoryApiRoutes()` 声明可访问的 Repository 和操作，前端通过 `api.repository()` 调用。结构化参数支持 JSON 输入和 Builder 回调，客户端将 Builder 转成 JSON 后发送。

本文沿用 [Repository 示例插件](../../../packages/examples/app-plugin-repository-example/README.md)的客户 Collection `repositoryExampleCustomers`。前提是插件已注册到目标 App，并已执行创建该 Collection 的 Migration；下面的 CRUD 不依赖 Seed。新插件先按 [Migrations](./database-migrations.md)建立数据结构。

## 1. 声明服务端 API

在 `server/routes/index.ts` 声明操作、写入策略和认证边界：

```ts
import { authenticationToken } from '@nocobase/app-plugin-authentication';
import {
  defineApiRoutes,
  defineRepositoryApiRoutes,
  type AppApiRouteContribution,
  type RepositoryApiExposure,
} from '@nocobase/app-server/router';
import type { AppPluginApplication } from '@nocobase/app-server/plugins';
import { Hono } from 'hono';

const repositories: readonly RepositoryApiExposure[] = [
  {
    name: 'repositoryExampleCustomers',
    actions: {
      findMany: { maxLimit: 100 },
      findOne: {},
      count: {},
      createOne: {
        writePolicy: (w) => w.fields('id', 'name', 'email', 'status'),
      },
      updateOne: {
        writePolicy: (w) => w.fields('name', 'email', 'status'),
      },
      deleteOne: {},
    },
  },
];
const repositoryRoutes = defineRepositoryApiRoutes({ repositories });

const apiRoutes: AppApiRouteContribution<AppPluginApplication> =
  defineApiRoutes(async (app) => {
    const router = new Hono();
    const authentication = app.container.resolve(authenticationToken);
    for (const { name, actions } of repositories)
      for (const action of Object.keys(actions))
        router.use(`/${name}:${action}`, authentication.required());
    router.route('/', await repositoryRoutes.createRouter(app));
    return router;
  });

const routes: readonly AppApiRouteContribution<AppPluginApplication>[] = [
  apiRoutes,
];
export default routes;
```

在已有的 `server/plugin.ts` 中导入 `routes`，传入 `defineServerPlugin({ packageName, routes, ... })`；保留插件原有的 Database 等声明。前后端插件的 App 注册见[插件注册](./plugin-registration.md)。

- `name` 是 Collection 逻辑名称；`actions` 只开放列出的操作。
- `maxLimit` 限制单次列表读取数量。
- API 的 `createOne`、`updateOne` 默认拒绝写入；`writePolicy` 声明允许的字段和嵌套关系操作，只能由服务端配置。
- 本例允许所有登录用户管理共享示例数据。业务权限、数据范围需由服务端按需求补充；`defineRepositoryApiRoutes()` 和 `/api` 前缀都不自动提供认证或授权，见 [Route 边界](./routes.md)。

## 2. 前端获取 Repository

在 React 组件或自定义 Hook 内使用应用提供的 API Client：

```ts
import { apiClientToken, useService } from '@nocobase/app-client';

export function useCustomersRepository() {
  const api = useService(apiClientToken);
  return api.repository('repositoryExampleCustomers');
}
```

组件调用 `const customers = useCustomersRepository()`，在数据加载逻辑或事件处理器中执行后续示例，不在 render 中直接发请求。

`customers.findMany()` 对应 `POST /api/repositoryExampleCustomers:findMany`。API Client 处理应用挂载前缀并解包 `{ data }`，无需手工拼接地址。它调用远程 API，不在浏览器连接数据库。

## 3. 查询：Builder 与 AST

应用代码可直接使用 Builder，不需要调用 `.build()`：

```ts
const records = await customers.findMany({
  filter: (f) => f.string('name').includes('Alice'),
  select: (s) => s.fields('id', 'name', 'email'),
  sort: (s) => s.field('name').asc(),
  limit: 20,
  offset: 0,
});
```

同一查询也可以用 JSON AST 表达，适合保存、传输和动态生成：

```ts
const records = await customers.findMany({
  filter: {
    kind: 'filter',
    version: 1,
    root: {
      kind: 'group',
      logic: 'and',
      items: [
        {
          kind: 'condition',
          path: ['name'],
          operator: '$includes',
          value: 'Alice',
        },
      ],
    },
  },
  select: {
    kind: 'select',
    version: 1,
    root: { kind: 'selection', fields: ['id', 'name', 'email'] },
  },
  sort: {
    kind: 'sort',
    version: 1,
    items: [{ kind: 'field', path: ['name'], direction: 'asc' }],
  },
  limit: 20,
  offset: 0,
});
```

两种写法表达相同查询，且可以按参数混用。Builder 回调在客户端同步执行，HTTP 只传递其 JSON 结果。需要显式标注 AST 类型时，从 `@nocobase/api-client` 导入 `RemoteFilterAst`、`RemoteSelectAst`、`RemoteSortAst` 等类型。

| 参数        | JSON 输入                                         | Builder                                |
| ----------- | ------------------------------------------------- | -------------------------------------- |
| `filter`    | Filter AST，另支持 `{ id: '...' }` 等简单等值条件 | 字段条件、逻辑组合、关系筛选           |
| `select`    | Select AST                                        | 字段、关系 include、关系聚合和 combine |
| `sort`      | Sort AST                                          | 字段、to-one 路径、to-many 聚合排序    |
| `aggregate` | Aggregate AST                                     | count、sum、avg、min、max              |
| `having`    | Filter AST                                        | 按分组结果筛选                         |
| `values`    | 普通值对象及写入表达式                            | 值表达式、数值原子更新、关系操作       |

`limit`、`offset`、`ifVersion` 等保持普通值，`by`、`distinct` 保持字段数组。`values` 的普通对象不是查询 AST，不必为标量赋值包装 Builder。当前不支持 `sort: { name: 'asc' }` 或嵌套操作符式的 Filter 简写。

## 4. 创建、读取、更新和删除

```ts
const created = await customers.createOne({
  values: {
    id: crypto.randomUUID(),
    name: 'Alice',
    email: 'alice@example.com',
    status: 'lead',
  },
});

const customer = await customers.findOne({
  filter: { id: created.record.id },
});

await customers.updateOne({
  filter: { id: created.record.id },
  values: { name: 'Alice Chen' },
});

await customers.deleteOne({
  filter: { id: created.record.id },
});
```

`findMany` 返回记录数组，`findOne` 返回记录或 `null`，`count` 返回数量，`exists` 返回布尔值；创建和更新返回含 `record` 的结果对象。启用版本控制的 Collection 可在更新、删除时传 `ifVersion`，例如示例插件的订单。

关系写入放在 `values` 中：`customer: { connect: { id: customerId } }`，也可写成 `customer: (r) => r.connect({ id: customerId })`。服务端需显式允许对应关系操作；嵌套创建、更新还需允许目标字段。`disconnect` 保留目标记录，`delete` 删除目标，`set` 仅适用于 to-many。一次根写入及其嵌套操作具有事务性，多次 HTTP 请求不会自动组成一个事务。

## 按需继续

- [API Client](../../../packages/libs/api-client/README.md)：各方法的 Builder 位置、`build*Options`、流式 `findMany`、返回值与错误。`api.request()` 不自动转换回调，需先调用构建函数。
- [Filter](../../../packages/libs/db/docs/zh-CN/repository/filter.md)、[Select](../../../packages/libs/db/docs/zh-CN/repository/select.md)、[Sort](../../../packages/libs/db/docs/zh-CN/repository/sort.md)：完整参数语义；其中的 `db.repository()` 示例运行在服务端，HTTP 调用仍受已开放操作和服务端策略限制。
- [关系写入](../../../packages/libs/db/docs/zh-CN/repository/relation-mutations.md)：各关系类型支持的操作、作用范围与约束。
- [可运行示例](../../../packages/examples/app-plugin-repository-example/README.md)：CRUD、独立关系表单与表格、select combine、排序、聚合、原子更新和流式读取。

新增接口至少验证匿名请求、允许及禁止的字段/关系操作，以及一次真实数据库读写；完整流程见[测试与验证](./testing.md)。
