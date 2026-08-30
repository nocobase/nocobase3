---
title: 声明 Client 和 Server 插件
description: 使用 defineClientPlugin 和 defineServerPlugin 显式声明插件贡献，并通过 package exports 与 App composition roots 建立 Client 和 Server 运行时契约。
---

# 声明 Client 和 Server 插件

插件声明回答两个问题：插件公开哪些能力，以及目标 App 如何显式启用这些能力。不要通过目录存在、文件命名或 `nocobase.plugins` 猜测运行时状态。

## 契约总览

```text
Client package contract
exports["./client"]
→ client/index.ts
→ client/plugin.ts default AppClientPluginFactory
→ App client/plugins.ts calls plugin(options)

Server package contract
exports["./server/plugin"]
→ server/plugin.ts default AppServerPlugin
→ App server/plugins.ts registers plugin definition
```

Client 和 Server 分别判断、分别注册。一个插件可以只提供其中一边。

## 声明 Client 插件

`client/plugin.ts` 是 Client 注册面：

```ts
import {
  defineClientPlugin,
  type AppClientPluginFactory,
} from '@nocobase/app-client/plugins';

export interface AuditLogClientOptions {
  readonly resourceLabel?: string;
}

const auditLog: AppClientPluginFactory<AuditLogClientOptions> =
  defineClientPlugin({
    packageName: '@nocobase/app-plugin-audit-log',
    bootstrap: () => import('./bootstrap.js'),
    routes: () => import('./routes.js'),
    providers: () => import('./providers.js'),
  });

export default auditLog;
```

只有三类 Client entries：

| Entry       | 用途                                     | 加载方式                                       |
| ----------- | ---------------------------------------- | ---------------------------------------------- |
| `bootstrap` | 命令式配置 Refine resources 或 providers | 动态 import                                    |
| `routes`    | App Routes 和 Settings Routes            | 动态 import                                    |
| `providers` | React Context Providers                  | 动态 import entry；Provider component 同步声明 |

三类 entries 全部可选。删除某类实现时，同时删除 `defineClientPlugin()` 中对应 loader；不要保留返回空数组的无意义模块。

### Client options

Client 注册导出的是 factory，因此目标 App 可以传 options：

```ts
defineClientPlugins([auditLog({ resourceLabel: 'Audit logs' })]);
```

options 可以到达：

```text
bootstrap context.options
routes factory(options)
providers factory(options)
routeComponentOverrides(options)
```

只有 App 需要配置的稳定行为才应成为 option。不要把插件内部实现细节或临时调试开关暴露为公共 options。

### Settings 属于 Routes

`client/routes.ts` 可以同时导出普通页面和 Settings 页面：

```ts
import {
  defineAppRoutes,
  defineSettingsRoutes,
  type AppClientRouteContribution,
} from '@nocobase/app-client/plugins';

const appRoutes = defineAppRoutes([
  {
    name: 'index',
    path: '/audit-log',
    componentLoader: () => import('./pages/audit-log-page.js'),
  },
]);

const settingsRoutes = defineSettingsRoutes([
  {
    name: 'audit-log',
    path: '/audit-log',
    navigation: { title: 'Audit Log' },
    componentLoader: () => import('./pages/settings.js'),
  },
]);

const routes: readonly AppClientRouteContribution[] = [
  appRoutes,
  settingsRoutes,
];

export default routes;
```

路径相对于宿主内置父 Route：

```text
defineAppRoutes() + /audit-log
→ /audit-log

defineSettingsRoutes() + /audit-log
→ /settings/audit-log
```

不要声明独立的 `settings` loader，不要创建 `client/settings.ts` 作为第四类 Client contribution，也不要在 Settings 子路径中重复写 `/settings`。

### Client barrel

App 从 `<package>/client` import 插件，因此 `client/index.ts` 必须 default 重新导出 factory：

```ts
export { default } from './plugin.js';
```

`client/plugin.ts` 会被 App 静态 import。它只应静态 import 轻量类型和注册 API；页面、Provider 工厂和业务实现通过 loader 引用，避免进入 App entry chunk。

## 声明 Server 插件

`server/plugin.ts` 是 Server 注册面：

```ts
import {
  defineServerPlugin,
  type AppServerPlugin,
} from '@nocobase/app-server-kit/plugins';

import providers from './providers/index.js';
import routes from './routes/index.js';

const auditLogPlugin: AppServerPlugin = defineServerPlugin({
  packageName: '@nocobase/app-plugin-audit-log',
  providers,
  routes,
  database: {
    migrations: './database/migrations',
    seeds: './database/seeds',
  },
  queue: {
    jobs: ['./server/jobs'],
  },
});

export default auditLogPlugin;
```

Server contributions：

| Contribution          | 用途                            | 是否可选 |
| --------------------- | ------------------------------- | -------- |
| `providers`           | Service 注册和生命周期          | 是       |
| `routes`              | API 和 Root Route contributions | 是       |
| `database.migrations` | 插件 Migration 目录             | 是       |
| `database.seeds`      | 插件 Seed 目录                  | 是       |
| `queue.jobs`          | Job 文件或目录位置              | 是       |

Server Routes 是直接 contributions：

```ts
import routes from './routes/index.js';

defineServerPlugin({
  packageName: '@nocobase/app-plugin-audit-log',
  routes,
});
```

不要写成 loader：

```ts
// 不属于当前协议
routes: () => import('./routes/index.js');
```

声明的 Database 或 Job 路径必须是以 `./` 开头的安全 package-relative path。当前 resolver 会依次尝试源码位置和 `dist` 位置；可选目录不存在时不产生 contribution。

## Package exports

source workspace 的开发入口：

```json
{
  "exports": {
    "./client": {
      "types": "./client/index.ts",
      "import": "./client/index.ts"
    },
    "./server/plugin": {
      "types": "./server/plugin.ts",
      "import": "./server/plugin.ts"
    },
    "./package.json": "./package.json"
  }
}
```

npm 发布入口应在 `publishConfig.exports` 中指向 `dist`：

```json
{
  "publishConfig": {
    "access": "public",
    "exports": {
      "./client": {
        "types": "./dist/client/index.d.ts",
        "import": "./dist/client/index.js"
      },
      "./server/plugin": {
        "types": "./dist/server/plugin.d.ts",
        "import": "./dist/server/plugin.js"
      },
      "./package.json": "./package.json"
    }
  }
}
```

注册命令使用实际要写入 App 的 export 作为判据：

```text
exports["./client"] exists
→ write <package>/client to client/plugins.ts

exports["./server/plugin"] exists
→ write <package>/server/plugin to server/plugins.ts
```

只有 `./client/plugin` 而没有 `./client` 不足以注册 Client，因为 App 实际 import 的是 `<package>/client`。

## App 显式注册

Client 导出 factory，所以在 App 中调用：

```ts
import auditLog from '@nocobase/app-plugin-audit-log/client';

const clientPlugins: AppClientPlugins = defineClientPlugins([auditLog()]);
```

Server 导出 definition，所以在 App 中直接注册，不调用：

```ts
import auditLog from '@nocobase/app-plugin-audit-log/server/plugin';

const serverPlugins: AppServerPlugins<AppConfig> =
  defineServerPlugins<AppConfig>([auditLog]);
```

Client 数组顺序是 bootstrap 顺序。Client 和 Server 都拒绝同一包重复注册。

## `nocobase.plugins` 的边界

App `package.json` 中的：

```json
{
  "nocobase": {
    "plugins": {
      "@nocobase/app-plugin-audit-log": {
        "enabled": true
      }
    }
  }
}
```

用于：

- CLI 插件管理；
- workspace 构建过滤；
- 开发监听；
- Skills 查找和同步；
- 已安装插件状态记录。

它不承担 Client 或 Server 运行时发现。运行时状态分别由 `client/plugins.ts` 和 `server/plugins.ts` 决定。

## Runtime 声明与 Plugin Skills

三者解决不同问题：

```text
defineClientPlugin()
→ Browser runtime contract

defineServerPlugin()
→ Server runtime contract

skills/
→ 向 App 说明如何使用这些以及其他公共能力
```

Plugin Skills 不属于 `defineClientPlugin()` 或 `defineServerPlugin()`，也不控制运行时启用。内部实现或私有 declaration 变化不必机械更新 Skill；只有变化影响 App 的发现、集成、输入、权限、约束或验证方式时，才更新对应 Plugin Skills。

## 声明检查清单

完成 Client 或 Server 声明修改后检查：

- `packageName` 与 `package.json#name` 一致；
- Client 使用 factory，Server 使用 definition；
- Client 只有 `bootstrap`、`routes`、`providers` 三类 entries；
- Settings 通过 `defineSettingsRoutes()` 并入 `routes`；
- Server Routes 是直接 contributions；
- source exports 和 `publishConfig.exports` 成对更新；
- 删除的 entry 不再被 export 或测试引用；
- Client entry 保持 lazy；
- `sideEffects: false` 只在包确实没有模块级副作用时保留；
- 插件声明测试覆盖实际 contributions；
- 目标 App 的显式注册与 exports 一致。
- export 或 contribution 变化影响 App 集成时，对应 Plugin Skills 已更新。

## 验证

插件：

```bash
pnpm --filter <plugin-package> typecheck
pnpm --filter <plugin-package> test
pnpm --filter <plugin-package> build
```

目标 App：

```bash
pnpm --filter <target-app> client:inspect --json
pnpm --filter <target-app> typecheck
pnpm --filter <target-app> build
```

纯 Server 插件没有 Client contributions 时，不要求 Client inspect 中出现该插件。

## 相关内容

- [开发一个完整插件](./development-workflow.md)
- [设计插件公共契约](./public-contracts.md)
- [插件结构和文件所有权](./plugin-structure.md)
- [安装和注册插件](./plugin-registration.md)
- [创建并接入插件](./quick-start.md)
