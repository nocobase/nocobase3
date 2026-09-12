---
title: Hub App 管理基础体验优化
description: 说明 Application Hub App 管理现状、基础体验问题、技术方案和改动范围。
---

# Hub App 管理基础体验优化

## 1. 背景

Application Hub 已具备 App 创建、Release 上传、Deploy、Rollback、Runtime 查看、Start、Stop、Restart 和配置管理能力。

当前 App 管理的主要问题集中在列表和详情入口：

- App 列表全量加载，搜索只在前端过滤；
- App 详情依赖前端内存中的 `selectedId`；
- 刷新页面、复制链接或新窗口打开后，无法直接定位指定 App；
- Runtime、Deployment 状态和操作不可用原因表达不完整。

本 PR 只优化 Hub App 的管理入口和基础页面体验，不调整 Host 执行协议，不引入 Operation 持久化。

## 2. 当前实现

### 2.1 Hub Client

主要代码位于 `packages/plugins/app-plugin-hub/client`：

- `pages/hub-page.tsx` 同时管理列表、详情、Tab、Release、Deployment 和生命周期弹窗；
- 通过 `selectedId` 决定展示列表还是详情；
- `pages/hub/catalog.tsx` 的搜索只过滤当前已加载的数据；
- `pages/hub/detail.tsx` 展示 Runtime、当前 Release 和操作按钮；
- `client/routes.ts` 只有 Applications 页面，没有 App 详情子路由。

Hub 模板将 Applications 配置为 `/apps`，并将 `/` 和旧 `/hub` 路径重定向到 `/apps`。

### 2.2 Hub Server

主要代码位于 `packages/plugins/app-plugin-hub/server`：

- `services/hub.ts` 的 `listApps()` 返回全部 App；
- `routes/index.ts` 的 `GET /apps` 没有分页参数；
- App 详情、Release 和 Deployment 通过独立 API 查询；
- `listDeployments()` 已有分页实现，可以复用其分页参数校验和响应结构。

### 2.3 Host

`@nocobase/app-host` 提供 Runtime 状态和生命周期管理。本 PR 不修改 Host，不改变 managed/standalone 语义。

## 3. 要解决的问题

### 3.1 列表不能随 App 数量扩展

全量返回 App 会使首次加载和前端过滤成本随 App 数量增长。搜索无法查询当前页面之外的数据，也无法为后续筛选和排序提供服务端基础。

### 3.2 详情不是稳定地址

详情由 `selectedId` 保存，刷新后状态丢失，无法通过 URL 直接打开、分享或恢复浏览器历史。

### 3.3 状态表达不完整

页面需要区分：

- 未部署；
- Deployment 执行中；
- Runtime Running；
- lazy App 尚未首次访问；
- 用户主动 Stop；
- Host 不可用；
- Runtime 启动失败。

这些状态可以基于现有 App、Deployment 和 Runtime 字段计算，本 PR 不新增后端状态枚举。

## 4. 目标和范围

### 4.1 本 PR 目标

1. Applications 列表支持服务端搜索、分页和稳定排序。
2. App 详情支持稳定 URL，可以直接打开、刷新和分享。
3. App 详情 Tab 使用子路由，浏览器前进/后退可以恢复页面状态。
4. 页面明确展示 Runtime/Deployment 状态和操作不可用原因。
5. 保持现有创建 App、Release、Deploy、Rollback、配置和生命周期能力不变。

### 4.2 不包含

- 不新增数据库表或 migration；
- 不修改 `@nocobase/app-host`；
- 不修改 IPC、Runtime 替换和 Deployment 执行协议；
- 不引入 Operation、checkpoint、恢复协调和 `needs-attention`；
- 不把搜索词或列表页码持久化到数据库。

## 5. 技术方案

### 5.1 路由结构

按照当前 NocoBase v3 Client Route 约定，Applications 作为父页面，App 详情和详情 Tab 作为子路由：

```text
/apps
└── /:appId
    ├── /deployments
    ├── /releases
    ├── /development
    ├── /resources
    ├── /configuration
    └── /settings
```

插件路由声明：

```ts
defineAppRoutes([
  {
    name: 'hub',
    path: applicationsPath,
    auth: 'required',
    access: { resource: 'hub', action: 'access' },
    navigation: { title: 'navigation.applications', icon: Boxes },
    componentLoader: () => import('./pages/hub-page.js'),
    children: [
      {
        name: 'app-detail',
        path: ':appId',
        componentLoader: () => import('./pages/hub/app-page.js'),
        children: [
          {
            name: 'app-deployments',
            path: 'deployments',
            componentLoader: () =>
              import('./pages/hub/tabs/deployments-page.js'),
          },
          // releases, development, resources, configuration, settings
        ],
      },
    ],
  },
]);
```

规则：

- `applicationsPath` 仍由插件配置决定，子路由使用相对 path；
- `appId` 从 `useParams()` 读取；
- 详情和 Tab 不配置 navigation，避免动态路径出现在侧边栏；
- `HubPage` 作为父页面放置 `<Outlet />`：没有子路由时渲染 Applications 列表，有 `:appId` 子路由时渲染详情 Outlet；
- App 详情页面继续放置 `<Outlet />`，在详情头部下渲染当前 Tab；
- 访问 `/apps/:appId` 时，由详情页面 `replace` 到第一个当前可见 Tab；
- 访问无效 Tab 时展示 404/不可访问状态，不静默切换到另一个 Tab；
- 列表点击使用 `Link`/`navigate`，不再通过 `selectedId` 切换页面；
- 返回列表使用父级路由导航，保留浏览器历史语义。

当前 `HubPage` 同时承担列表和详情状态，需要拆成两层：

- `HubPage`：管理列表、搜索、分页和创建 App；
- `AppPage`：根据 `appId` 加载详情，管理详情操作和弹窗，并通过 `<Outlet />` 渲染 Tab 内容；
- 现有 `Detail` 调整为详情页头部和 Tab 导航壳，现有 `Deployments`、`Releases` 等组件继续复用；
- `useOutlet()` 只用于父页面判断当前是否进入详情，不把同一份详情状态同时保留在列表和详情两个分支中。

这会新增少量页面文件，但只是插件内部的页面拆分，不新增独立插件、共享包或内核模块。

### 5.2 服务端列表查询

新增分页查询能力：

```http
GET /api/hub/apps?search=customer&page=1&pageSize=24
```

响应：

```ts
interface HubAppPage {
  readonly items: readonly HubAppSummary[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
}
```

服务层增加独立分页方法，保留现有 `listApps()` 数组返回语义，降低对已发布 Service Contract 的影响：

```ts
interface ListHubAppsOptions {
  readonly search?: string;
  readonly page?: number;
  readonly pageSize?: number;
}

listAppsPage(options?: ListHubAppsOptions): Promise<HubAppPage>;
```

`GET /hub/apps` 改为调用 `listAppsPage()`；现有 `listApps()` 保留给内部兼容调用和旧测试使用。

查询规则：

- `search` trim 后按 App ID 或 name 做包含匹配；
- 搜索不区分大小写；当前 Query API 没有统一的 `ilike` 能力，因此在 Hub Service 内使用现有 `DatabaseConnection.client()` 的参数绑定查询实现 `lower(column) like lower(?)`，不修改 `@nocobase/db`；
- 搜索参数必须绑定，不直接拼接用户输入；表名和字段名使用固定白名单；
- 搜索词最长 100 个字符；
- `page` 默认 1，必须为正整数；
- `pageSize` 默认 24，范围 1-100；
- 排序固定为 `createdAt desc, id desc`；
- 超出页码时返回最后一页，空结果返回 `page: 1`；
- 非法参数返回 400；
- Host status 在一次列表请求中只读取一次；
- Release existence 和 pending Deployment 批量查询，避免 N+1 查询；
- 不返回配置正文、Release manifest 和原始敏感错误。

普通 `contains` 搜索不新增索引或全文检索能力。后续如果 App 数量继续增长，再单独评估前缀搜索、搜索字段或全文索引。

### 5.3 Client 数据加载

Applications 页面：

- 搜索 debounce 约 300ms；
- 搜索变化回到第 1 页；
- 请求中保留已有结果；
- 使用请求序号或取消机制，旧响应不能覆盖新查询；
- 区分空数据和搜索无结果；
- Grid/List 两种视图共用同一分页数据；
- 分页控件只在 `total > pageSize` 时显示。

详情页面：

- 根据 `appId` 独立加载详情，不依赖列表是否已加载；
- 详情切换和 Tab 切换由路由驱动；
- 详情刷新不改变当前 Tab；
- Tab 页面按需加载对应 Release、Deployment 或配置数据；
- 删除 App 成功后返回 Applications 父路由；
- App 不存在时展示错误态和返回列表入口。

详情页的操作和弹窗状态只属于当前 `appId`。切换 App 或离开详情时清理上一个 App 的 Release、Deployment、配置和弹窗状态，避免数据串用。

### 5.4 状态和操作可用性

状态展示使用现有字段计算，优先级如下：

| 优先级 | 条件 | 页面状态 |
| --- | --- | --- |
| 1 | `runtime.hostAvailable === false` | Host unavailable |
| 2 | `hasPendingDeployment` 或 Runtime 为 `pending` | Deployment pending |
| 3 | 没有当前成功 Deployment | 未部署 |
| 4 | Runtime 为 `failed` | Failed |
| 5 | Runtime 为 `running` | Running |
| 6 | 已部署、`enabled === true`、启动策略为 lazy、Runtime 未激活 | lazy 未访问 |
| 7 | 已部署、`enabled === false`、Runtime 为 stopped | 用户 Stop |
| 8 | 其他无法判断的组合 | Unknown |

操作不可用原因由页面统一计算，不在每个按钮中重复判断：

- 页面加载或操作提交中：正在处理；
- Host 不可用：无法确认 Runtime 状态；
- Deployment pending：当前 App 有部署操作正在执行；
- 未部署：需要先完成一次 Deploy；
- Start：只有已部署且当前不是 Running 时可用；
- Stop：只有当前 Running 时可用；
- Restart：只有当前 Running 时可用；
- Deploy/Rollback：有活动 Deployment 时不可用。

本 PR 不新增 `Reconciling`、`Needs attention` 等 Operation 状态。Deployment 仍沿用现有 `queued`、`deploying`、`succeeded`、`failed`、`cancelled`。

## 6. 改动范围

### 6.1 `@nocobase/app-plugin-hub`

预计修改：

- `client/routes.ts`
  - 增加 `:appId` 和详情 Tab 子路由。
- `client/pages/hub-page.tsx`
  - 保留为 Applications 父页面；
  - 移除详情状态和 `selectedId` 页面切换逻辑；
  - 接入服务端搜索、分页和列表竞态处理。
- `client/pages/hub/app-page.tsx`
  - 新增详情页面；
  - 读取 `appId`；
  - 管理详情数据、操作状态和弹窗。
- `client/pages/hub/detail.tsx`
  - 调整为详情头部、操作区和 Tab 导航壳；
  - 使用 `Outlet` 渲染当前 Tab。
- `client/pages/hub/tabs/*`
  - 将现有 Deployment、Release、Configuration、Resources、Settings 内容接入子路由；
  - 继续复用现有业务组件，避免重写业务逻辑。
- `client/pages/hub/catalog.tsx`
  - 增加分页参数、分页控件和路由跳转。
- `client/pages/hub/types.tsx`、`utils.ts`
  - 增加分页、路由和统一状态映射类型。
- `client/permissions.ts`
  - 复用现有权限能力计算 Tab 可见性和操作可用性。
- `client/locales`
  - 增加状态、分页、错误和操作不可用原因文案。
- `server/tokens.ts`
  - 增加 `HubAppPage`、`ListHubAppsOptions` 和 `listAppsPage()`。
- `server/services/hub.ts`
  - 实现服务端搜索、分页、稳定排序和批量状态查询。
- `server/routes/index.ts`
  - 解析列表分页参数并返回分页响应。
- `server/routes/responses.ts`
  - 适配分页响应和安全的状态字段。

### 6.2 `@nocobase/app-template-hub`

只补充必要的路由和真实页面测试：

- `/apps` 列表打开；
- `/apps/:appId/deployments` 直接打开和刷新；
- 父级路由、子路由和导航高亮；
- Hub 模板 public base path 下的路由可用。

模板原则上不新增业务逻辑。

### 6.3 不修改模块

- `packages/app/app-host`
- `packages/app/app-client`
- `packages/app/app-server`
- `packages/libs/db`
- `packages/plugins/app-plugin-authentication`
- `packages/plugins/app-plugin-authorization`
- `packages/plugins/app-plugin-users`

不新增数据库表、migration、Operation、消息队列或 Host IPC 协议。

## 7. API 兼容和发布影响

### 7.1 API 兼容

- 新增分页查询方法，不改变 `HubService.listApps()` 的 Service 返回语义；
- HTTP `GET /hub/apps` 的响应从数组调整为分页对象，只由 Hub Client 消费；这是本 PR 唯一需要明确说明的 HTTP 响应结构变化；
- 如果存在外部 HTTP Client 依赖旧数组响应，需要在发布说明中明确这是 API 响应结构调整；
- 详情、Release、Deployment 和生命周期 API 地址保持不变；
- Server Route 继续独立执行认证和 `hub.app` action 鉴权。

### 7.2 发布影响

本 PR 修改 `@nocobase/app-plugin-hub` 生产代码，需要该包的 changeset。若 `app-template-hub` 只增加测试、不改变发布内容，则不需要模板 changeset。

## 8. 测试和验收

### 8.1 Server

- 默认参数、非法参数和边界 `pageSize`；
- App ID/name 搜索；
- 搜索结果的 `total`、页码回退和稳定排序；
- 空数据和搜索无结果；
- Host status、Release existence、pending Deployment 不产生 N+1 查询；
- 匿名用户和无 Hub 权限用户不能读取列表；
- 分页响应不泄露配置正文、Release manifest 和原始敏感错误。

### 8.2 Client Route

- `/apps` 直接打开；
- `/apps/:appId/deployments`、`releases` 等 Tab 直接打开；
- 刷新、复制链接、浏览器前进/后退；
- 父级 `/apps/:appId` 能 replace 到默认可见 Tab；
- 无效 Tab、无权限 Tab 和不存在 App；
- 详情父页面和 Tab 父页面的 `<Outlet />` 正确渲染，列表不会与详情重复显示；
- 动态详情路由不出现在侧边栏；
- Grid/List 视图和列表分页共用同一数据源。

### 8.3 Client 页面

- 搜索 debounce 和快速输入时旧响应不能覆盖新结果；
- 搜索变化重置到第 1 页；
- 切换 App 后不复用上一个 App 的详情或弹窗数据；
- Runtime/Deployment 状态和操作不可用原因；
- 创建 App、Release、Deploy、Rollback、配置和 Start/Stop/Restart 现有行为不回归。

## 9. 验收边界

本 PR 完成后，用户可以：

```text
打开 Applications
  -> 服务端搜索和分页
  -> 打开 /apps/:appId
  -> 直接进入指定 Tab
  -> 刷新或分享链接
  -> 查看清晰的 Runtime/Deployment 状态
  -> 按当前状态执行已有操作
```

本 PR 不承诺解决 IPC 中断、Host 重启、Hub 重启后的部署结果确认。这些能力由后续 Operation 和 Recovery 两个 PR 继续完成。
