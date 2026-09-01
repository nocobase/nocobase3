---
title: 声明 Client 和 Server 插件
description: 使用 defineClientPlugin 和 defineServerPlugin 显式声明静态插件贡献，并通过 package exports 与 App composition roots 建立 Client 和 Server 运行时契约。
---

# 声明 Client 和 Server 插件

插件声明回答两个问题：插件公开哪些能力，以及目标 App 如何显式启用这些能力。不要通过目录存在、文件命名或 `nocobase.plugins` 猜测运行时状态。

## 契约总览

```text
Client package contract
exports["./client"] → client/index.ts → Client plugin factory
                     → App client/plugins.ts calls plugin(options)

Server package contract
exports["./server"] → server/index.ts → Server plugin definition
                     → App server/plugins.ts registers definition
```

Client 和 Server 分别判断、分别注册。一个插件可以只提供其中一边。

## Client 插件声明

基础 Client contributions 使用静态 import：

```ts
import {
  defineClientPlugin,
  type AppClientPluginFactory,
} from '@nocobase/app-client/plugins';

import locales from './locales/index.js';
import serviceProviders from './providers/index.js';
import reactProviders from './react-providers/index.js';
import routes from './routes.js';

export interface AuditLogClientOptions {
  readonly resourceLabel?: string;
}

const auditLog: AppClientPluginFactory<AuditLogClientOptions> =
  defineClientPlugin({
    packageName: '@nocobase/app-plugin-audit-log',
    config: [auditLogClientConfig],
    serviceProviders,
    reactProviders,
    routes,
    locales,
  });

export default auditLog;
```

| Field              | 用途                                       | 执行边界                          |
| ------------------ | ------------------------------------------ | --------------------------------- |
| `config`           | Browser 公开配置的 namespace、默认值与校验 | Runtime 解析                      |
| `serviceProviders` | Client Service、Refine 配置和生命周期      | `ClientApplication.start()`       |
| `reactProviders`   | React Context 和应用组件树组合             | Browser Host 渲染 `AppClientRoot` |
| `routes`           | App Routes 和 Settings Routes              | Runtime 组合；页面导航时才加载    |
| `locales`          | package namespace 的语言资源 manifest      | 选择或切换语言时加载 messages     |

这些字段都可选。删除某类实现时也删除对应字段和无用 public export。基础声明必须静态可见；动态 import 下沉到 Route page、locale messages、重型 SDK 或真正可选的 Feature。

静态 import 不等于执行：declaration module 顶层不得注册 Service、连接网络、建立 listener、启动 timer 或渲染 React。Service 注册在 Provider `register()` 中完成，Refine/启动配置在生命周期中完成，React Provider 只在 Browser Host 渲染 `AppClientRoot` 后执行。

### Client options

目标 App 通过 factory 参数配置某次 registration：

```ts
defineClientPlugins([auditLog({ resourceLabel: 'Audit logs' })]);
```

同一个 frozen options 会进入该插件的 ServiceProvider context，并参与需要 options 的 Route、Wrapper 或 override 解析。只有 App 需要配置的稳定行为才应成为 option；部署级、跨插件的公开 Browser 配置使用 `config`，secret 必须留在 Server。

### Settings 属于 Routes

```ts
import {
  defineAppRoutes,
  defineSettingsRoutes,
  type AppClientRouteContribution,
} from '@nocobase/app-client/plugins';

const routes: readonly AppClientRouteContribution[] = [
  defineAppRoutes([
    {
      name: 'audit-log',
      path: '/audit-log',
      componentLoader: () => import('./pages/audit-log-page.js'),
    },
  ]),
  defineSettingsRoutes([
    {
      name: 'audit-log',
      path: '/audit-log',
      navigation: { title: 'Audit Log' },
      componentLoader: () => import('./pages/settings.js'),
    },
  ]),
];

export default routes;
```

`defineSettingsRoutes()` 自动挂到 `/settings`；不要重复路径，也不要创建独立 `settings` contribution。

### Client public barrel

```ts
export { default } from './plugin.js';
```

App 固定从 `<package>/client` import factory。需要跨包使用的 Component、Hook 或 Token 才增加有意设计的 subpath export；源码文件存在不等于公共契约。

## Server 插件声明

Server 同样使用明确的 `serviceProviders` 字段：

```ts
import {
  defineServerPlugin,
  type AppServerPlugin,
} from '@nocobase/app-server/plugins';

import serviceProviders from './providers/index.js';
import routes from './routes/index.js';

const auditLogPlugin: AppServerPlugin = defineServerPlugin({
  packageName: '@nocobase/app-plugin-audit-log',
  locales: () => import('./locales/index.js'),
  serviceProviders,
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

内部文件和变量仍可叫 `providers`，但 Runtime/Plugin 公共字段始终叫 `serviceProviders`。

| Contribution          | 用途                            |
| --------------------- | ------------------------------- |
| `serviceProviders`    | Service 注册和生命周期          |
| `routes`              | API 和 Root Route contributions |
| `database.migrations` | 插件 Migration 目录             |
| `database.seeds`      | 插件 Seed 目录                  |
| `queue.jobs`          | Job 文件或目录位置              |
| `locales`             | package namespace 的翻译资源    |

Server Routes 和 ServiceProviders 都是直接静态 contributions，不写成 module loader。Database/Job location 必须是以 `./` 开头的安全 package-relative path。

## Package exports

Source workspace 与 npm publish exports 必须成对存在：

```json
{
  "exports": {
    "./client": {
      "types": "./client/index.ts",
      "import": "./client/index.ts"
    },
    "./server": {
      "types": "./server/index.ts",
      "import": "./server/index.ts"
    },
    "./package.json": "./package.json"
  },
  "publishConfig": {
    "access": "public",
    "exports": {
      "./client": {
        "types": "./dist/client/index.d.ts",
        "import": "./dist/client/index.js"
      },
      "./server": {
        "types": "./dist/server/index.d.ts",
        "import": "./dist/server/index.js"
      },
      "./package.json": "./package.json"
    }
  }
}
```

注册命令按真实 `./client` 与 `./server` export 独立修改对应 composition root。

## App 显式注册

```ts
import auditLogClient from '@nocobase/app-plugin-audit-log/client';
import { defineClientPlugins } from '@nocobase/app-client/plugins';

export default defineClientPlugins([auditLogClient()]);
```

```ts
import auditLogServer from '@nocobase/app-plugin-audit-log/server';
import { defineServerPlugins } from '@nocobase/app-server/plugins';

export default defineServerPlugins([auditLogServer]);
```

Client 数组顺序是静态 contribution 和 ServiceProvider lifecycle 的组合顺序。Client 和 Server 都拒绝同一包重复注册。

`package.json#nocobase.plugins` 用于 CLI 插件管理、workspace build、dev watch、Skill 查找与同步；它不承担 Runtime 发现。

## Inspector 边界

Inspector 导入 `client/runtime.ts`、`client/plugins.ts` 或 Server declarations，读取静态装配计划：

- Client 不创建 Application、不实例化 ServiceProvider、不运行 lifecycle、不渲染 React Provider、不加载页面或语言 messages；
- Server 不启动 ServiceProvider、不执行 Route factory、Job 或数据库操作；
- `consistent: true` 只表示观察到的装配没有静态冲突，不代表业务行为正确。

## 声明检查清单

- `packageName` 与 `package.json#name` 一致；
- Client 使用 factory，Server 使用 definition；
- Client 公共字段只使用明确的 `config`、`serviceProviders`、`reactProviders`、`routes`、`locales`；
- 不保留旧 `bootstrap` 或含义模糊的 `providers` Runtime field；
- Settings 通过 `defineSettingsRoutes()` 并入 `routes`；
- Server 使用 `serviceProviders` 和直接 Route contributions；
- source exports 与 publish exports 成对；
- 删除的 entry 不再被 export、测试或文档引用；
- declaration 顶层无副作用，lazy loading 位于叶子节点；
- 测试覆盖声明及其实际 lifecycle/render/route 行为；
- 目标 App 显式注册与 exports 一致；
- 公共集成方式变化时同步 Plugin Skills。

## 验证

```bash
pnpm --filter <plugin-package> lint
pnpm --filter <plugin-package> typecheck
pnpm --filter <plugin-package> test
pnpm --filter <plugin-package> build
pnpm --filter <target-app> typecheck
pnpm --filter <target-app> build
```

只有 composition 发生变化或需要诊断时，再运行对应 Inspector。

## 相关内容

- [Client 模块选择](./client.md)
- [Client ServiceProviders](./client-service-providers.md)
- [Client React Providers](./client-react-providers.md)
- [插件结构和文件所有权](./plugin-structure.md)
- [安装和注册插件](./plugin-registration.md)
