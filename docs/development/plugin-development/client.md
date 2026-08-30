---
title: Client 插件开发
description: 在 NocoBase 插件中使用 bootstrap、defineAppRoutes、defineSettingsRoutes 和 defineClientProviders 添加客户端能力，并通过 Client options 和 route component overrides 支持 App 配置。
---

# Client 插件开发

Client 插件只公开 `bootstrap`、`routes`、`providers` 三类可选入口。四类 Route API 和前后端组合见[Route 插件开发](./routes.md)，App/Settings 的完整实现与测试模式见[Client Route 最佳实践示例](./client-routes-examples.md)；本页重点说明 Client contribution wiring、bootstrap、providers 和 options。Settings 属于 routes；Registry 是另一套源码 materialization 能力，不是 Client runtime contribution。

## 选择 contribution

| 任务                                | Entry       | 实现                      |
| ----------------------------------- | ----------- | ------------------------- |
| 注册 Refine resource 或命令式初始化 | `bootstrap` | `client/bootstrap.ts`     |
| 添加普通页面                        | `routes`    | `defineAppRoutes()`       |
| 添加 Settings 页面                  | `routes`    | `defineSettingsRoutes()`  |
| 提供 React Context                  | `providers` | `defineClientProviders()` |

检查顺序：

```text
package.json → client/index.ts → client/plugin.ts
→ bootstrap.ts / routes.ts / providers.ts → pages and components
→ tests/ → target App/client/plugins.ts
```

## Bootstrap 和 Refine

Bootstrap 接收 `refine` 和解析后的 typed options，适合注册 resources 或 access/data providers。它是命令式初始化入口，不用于渲染 React UI。

```ts
const bootstrap: AppClientPluginBootstrap<AuditLogOptions> = ({
  refine,
  options,
}) => {
  refine.addResources([
    {
      name: 'audit-log',
      list: '/audit-log',
      meta: { label: options.label ?? 'Audit log' },
    },
  ]);
};
```

## App Routes

以下仅展示 contribution 形状；`auth` 选择、Settings groups、组件覆盖和分层测试见
[Client Route 最佳实践示例](./client-routes-examples.md)。

```ts
const appRoutes = defineAppRoutes([
  {
    name: 'audit-log',
    path: '/audit-log',
    auth: 'required',
    componentLoader: () => import('./pages/audit-log.js'),
  },
]);
```

页面使用 `componentLoader` 延迟加载。路径相对于 App 内置父 Route，不重复 App public base path。

## Settings Routes

```ts
const settingsRoutes = defineSettingsRoutes([
  {
    name: 'audit-log',
    path: '/audit-log',
    navigation: { title: 'Audit log' },
    access: { resource: 'audit-log.settings', action: 'read' },
    componentLoader: () => import('./pages/settings.js'),
  },
]);
```

最终路径是 `/settings/audit-log`。`navigation` 决定设置中心导航；`access` 被拒绝时，页面不会进入导航也不会加载。不要添加独立 `settings` entry，也不要在子路径重复 `/settings`。

## Provider 和 Context

用 `defineClientProviders()` 声明有稳定名称的 Provider。Provider 顺序应显式、可测试；只有多个页面需要共享状态时才引入 Context，不要用全局变量替代。

## Client options 和组件覆盖

在 `client/plugin.ts` 为 App 需要配置的稳定行为定义 options。options 可传入 bootstrap、routes/providers factory 和 `routeComponentOverrides(options)`。组件覆盖用于替换宿主公开的 route component slot；不要复制宿主 Route 或修改同步文件。

```ts
export default defineClientPlugin({
  packageName: '@nocobase/app-plugin-audit-log',
  bootstrap: () => import('./bootstrap.js'),
  routes: () => import('./routes.js'),
  providers: () => import('./providers.js'),
  routeComponentOverrides: (options) => options.overrides ?? [],
});
```

App 在 `client/plugins.ts` 调用 factory：`auditLog({ label: 'Audit logs' })`。

## Lazy loading 和副作用

`client/plugin.ts` 会被 App 静态 import，应只静态依赖轻量注册 API 和类型。页面及重实现通过 loader 加载。`sideEffects: false` 只适用于所有模块都没有 import-time 副作用的包；若 CSS 或模块初始化必须保留，应精确声明 side effects 或改为显式导入。

## 测试和检查最终结果

测试 descriptor、App/Settings Route、component loader、Provider、bootstrap options 和组件覆盖。再检查 App 合并后的结果：

```bash
pnpm --filter <target-app> client:inspect --json
pnpm --filter <plugin-package> lint
pnpm --filter <plugin-package> typecheck
pnpm --filter <plugin-package> test
pnpm --filter <plugin-package> build
```

常见错误包括第四类 `settings` loader、同步 import 重页面、Settings 路径重复、无 access 的敏感设置页、删除 entry 后遗留 export、把 Registry 副本当 runtime UI。

完成时 Client factory、exports、App composition root、inspect 结果和行为测试一致；App-facing options、入口或权限变化已更新 Plugin Skills。
