# 插件开发快速开始

本文介绍如何在当前 monorepo 中创建一个 NocoBase 插件，并将它注册到指定 App。所有命令都应在仓库根目录执行。

## 1. 创建插件

插件名使用小写 kebab-case，例如 `audit-log`：

```bash
pnpm plugin:create audit-log
```

命令会创建 `packages/app-plugin-audit-log/`，并默认运行 `pnpm install` 同步 workspace 和 `pnpm-lock.yaml`。

生成的主要结构如下：

```text
packages/app-plugin-audit-log/
├── database/
│   ├── README.md
│   ├── migrations/
│   │   └── *_audit_log_create_records.ts.example
│   └── seeds/
│       └── *_audit_log_create_welcome_record.ts.example
├── server/
│   ├── bootstrap.ts
│   └── routes/index.ts
├── tests/
├── eslint.config.js
├── package.json
└── tsconfig.json
```

脚手架不生成 `src/` 目录。它使用 `@nocobase/dev-config`，并提供 bootstrap、HTTP route、数据库示例和对应测试。

可以在创建时指定展示名称和描述：

```bash
pnpm plugin:create audit-log \
  --display-name "Audit Log" \
  --description "Records application operations."
```

## 2. 注册到 App

创建插件包并不会自动让 App 加载它。将插件注册到 `app-template-default`：

```bash
pnpm plugin:register audit-log --app app-template-default
```

`--app` 可以使用 workspace 目录名，也可以使用完整包名，所以下面的命令等价：

```bash
pnpm plugin:register audit-log --app @nocobase/app-template-default
```

如果省略 `--app`，默认也是 `app-template-default`：

```bash
pnpm plugin:register audit-log
```

注册命令会修改目标 App 的 `package.json`：

```json
{
  "nocobase": {
    "plugins": {
      "@nocobase/app-plugin-audit-log": {
        "enabled": true
      }
    }
  },
  "devDependencies": {
    "@nocobase/app-plugin-audit-log": "workspace:^"
  }
}
```

其中：

- `devDependencies` 让目标 App 可以解析插件包。
- `nocobase.plugins` 将插件注册到 App。
- `enabled: true` 让 App 加载插件的 bootstrap、routes、migration 和 seed 来源。

注册但暂时不启用插件：

```bash
pnpm plugin:register audit-log \
  --app app-template-default \
  --disabled
```

注册命令默认也会运行 `pnpm install`。如果希望创建和注册完成后只安装一次，可以这样执行：

```bash
pnpm plugin:create audit-log --no-install
pnpm plugin:register audit-log --app app-template-default
```

## 3. 开发插件

### Bootstrap

编辑 `packages/app-plugin-audit-log/server/bootstrap.ts`，注册插件启动时需要的资源和生命周期清理逻辑。

### HTTP Route

编辑 `packages/app-plugin-audit-log/server/routes/index.ts`。脚手架默认注册：

```text
GET /audit-log
```

启动 App 后，可以使用浏览器或 `curl` 访问该 endpoint。实际主机和端口以 `pnpm app:dev` 的启动输出为准。

### Client Bootstrap、Routes 和 Providers

客户端贡献在插件 `package.json` 中分别声明：

```json
{
  "exports": {
    "./client/bootstrap": {
      "types": "./client/bootstrap.ts",
      "import": "./client/bootstrap.ts"
    },
    "./client/routes": {
      "types": "./client/routes.ts",
      "import": "./client/routes.ts"
    },
    "./client/providers": {
      "types": "./client/providers.ts",
      "import": "./client/providers.ts"
    }
  },
  "nocobase": {
    "plugin": {
      "client": {
        "bootstrap": "./client/bootstrap",
        "routes": "./client/routes",
        "providers": "./client/providers"
      }
    }
  }
}
```

三个入口都是可选的：

- `client/bootstrap.ts` 通过 Refine Registry 处理认证、数据源和其他命令式初始化；
- `client/routes.ts` 使用 `defineClientRoutes()` 声明路由，页面通过
  `componentLoader` 按 URL 访问加载；
- `client/providers.ts` 使用 `defineClientProviders()` 声明同步 Provider。

推荐让三个协议入口保持在 `client/` 根目录，并按职责存放具体实现：

```text
client/
├── bootstrap.ts
├── routes.ts
├── providers.ts
├── components/
│   └── audit-log-provider.tsx
├── contexts/
│   └── audit-log-context.ts
└── pages/
    └── audit-log-list.tsx
```

其中：

- `bootstrap.ts`、`routes.ts` 和 `providers.ts` 是插件协议入口，只负责声明或组装贡献；
- `components/` 存放 Provider 等 React 组件实现；
- `contexts/` 存放 React Context、相关类型和 hooks；
- `pages/` 存放由路由按需加载的页面组件。

路由的 `auth` 可选值为：

- `required`：默认值，只允许已登录用户访问；
- `guest`：只允许匿名用户访问，适合登录、注册等认证页面；
- `optional`：登录和匿名用户均可访问。

`/login`、`/register`、`/forgot-password` 和 `/reset-password` 是认证协议路径，
插件声明这些路径时必须显式使用 `auth: 'guest'`；应用根路径 `/` 不允许由插件覆盖。

不要同时使用 `client/providers.ts` 和 `client/providers/`。虽然内核会校验入口必须是文件，
但同名文件和目录容易让人混淆，也可能给文件解析工具带来歧义。

Bootstrap 中的 `refine` 为每个可配置的 Refine Prop 提供对应的 `setXxx()`。例如：

```ts
import type { AppClientPluginBootstrap } from '@nocobase/app-client/plugins';

const bootstrap: AppClientPluginBootstrap = ({ refine }) => {
  refine.setChildren(customAppContent);
  refine.setAuthProvider(authProvider);
  refine.setDataProvider(dataProvider);
  refine.setRouterProvider(routerProvider);
  refine.setLiveProvider(liveProvider);
  refine.setNotificationProvider(notificationProvider);
  refine.setAccessControlProvider(accessControlProvider);
  refine.setAuditLogProvider(auditLogProvider);
  refine.setI18nProvider(i18nProvider);
  refine.setOnLiveEvent(onLiveEvent);
  refine.setOptions({ mutationMode: 'optimistic' });
  refine.setResources([{ name: 'auditLogs' }]);
};

export default bootstrap;
```

默认使用 App 路由树作为 Refine `children`；显式调用 `setChildren()` 会替换它。同一个
Refine Prop 只能由一个插件调用 `setXxx()`；重复注册会显示已有插件和冲突插件。多个插件
需要追加资源或 live event 处理器时，分别使用 `addResources()` 和
`addLiveEventHandler()`。bootstrap 全部完成后，配置会固化为 `runtime.refine`，并直接传给
App client。

默认 App 不在自身的 runtime 中硬编码 `dataProvider`，而是启用独立的
`@nocobase/app-plugin-data-provider`：

```json
{
  "nocobase": {
    "plugins": {
      "@nocobase/app-plugin-data-provider": {
        "enabled": true
      }
    }
  },
  "devDependencies": {
    "@nocobase/app-plugin-data-provider": "workspace:^"
  }
}
```

该插件只有客户端 bootstrap，负责调用
`refine.setDataProvider(dataProvider)`；它不管理数据库连接、schema 或服务端数据源。

通知也由独立的客户端插件提供：

```json
{
  "nocobase": {
    "plugins": {
      "@nocobase/app-plugin-notification-provider": {
        "enabled": true
      }
    }
  },
  "devDependencies": {
    "@nocobase/app-plugin-notification-provider": "workspace:^"
  }
}
```

它的 `client/bootstrap.ts` 注册 Refine `notificationProvider`，
`client/providers.ts` 挂载 Sonner 通知宿主；Undoable mutation 的通知 UI
由插件内部负责，不依赖 `client-old/`。插件还通过 `client/routes.ts` 提供
`/notification-provider` 测试页面，可以触发 success、error 和 undoable 通知。

路由示例：

```ts
import {
  defineClientRoutes,
  type AppClientRouteDefinition,
} from '@nocobase/app-client/plugins';

const routes: readonly AppClientRouteDefinition[] = defineClientRoutes([
  {
    name: 'list',
    path: '/audit-log',
    auth: 'required',
    componentLoader: () => import('./pages/audit-log-list.js'),
  },
]);

export default routes;
```

### App 自定义插件路由页面

一个 App 只想改变某个插件路由的页面 UI 时，不应注册同一路径的新路由。插件继续拥有
route ID、path 和 auth，App 只覆盖 `componentLoader`：

```ts
import {
  defineClientRouteComponentOverrides,
  type AppClientRouteComponentOverrideDefinition,
} from '@nocobase/app-client/plugins';

const overrides: readonly AppClientRouteComponentOverrideDefinition[] =
  defineClientRouteComponentOverrides([
    {
      routeId: '@nocobase/app-plugin-audit-log:list',
      componentEntry: './client/audit-log/pages/list-page',
      componentLoader: () => import('./audit-log/pages/list-page'),
    },
  ]);

export default overrides;
```

默认 App 在 `client/route-overrides.ts` 集中声明覆盖。覆盖会在插件路由规范化之后、
`React.lazy()` 之前应用；目标不存在、重复覆盖或 loader 无效都会在启动阶段报错。
`componentEntry` 不参与运行时加载，但应填写，方便 `app:client:inspect` 和 Agent 判断
最终组件归属。

认证 UI 还有一个带稳定 route ID 映射的便捷 API：

```ts
import { defineAuthenticationPageOverrides } from '@nocobase/app-plugin-authentication/client/ui';

export default defineAuthenticationPageOverrides({
  login: {
    componentEntry: './client/auth/pages/login-page',
    componentLoader: () => import('./pages/login-page'),
  },
});
```

Provider 示例：

```ts
import {
  defineClientProviders,
  type AppClientProviderDefinition,
} from '@nocobase/app-client/plugins';

import { AuditLogProvider } from './components/audit-log-provider.js';

const providers: readonly AppClientProviderDefinition[] = defineClientProviders(
  [
    {
      name: 'audit-log',
      component: AuditLogProvider,
    },
  ],
);

export default providers;
```

Provider 数组按“外层到内层”解释。存在依赖关系时使用完整 ID：

```ts
const providers: readonly AppClientProviderDefinition[] = defineClientProviders(
  [
    {
      name: 'audit-log',
      component: AuditLogProvider,
      after: ['@nocobase/app-plugin-foundation:foundation'],
    },
  ],
);

export default providers;
```

内核会检查重复名称、缺失引用和循环依赖，并执行稳定拓扑排序。
默认 App 的应用级 ThemeProvider 位于所有插件 Provider 外层，所以插件 Provider 和
插件路由页面会自动继承 `light`、`dark` 或 `system` 主题，不需要把主题写入插件间的
`before`/`after` 依赖。

### Migration 和 Seed

脚手架生成的数据库文件以 `.ts.example` 结尾，因此默认不会被 NocoBase 加载或执行：

```text
database/migrations/202608220001_audit_log_create_records.ts.example
database/seeds/202608220002_audit_log_create_welcome_record.ts.example
```

需要使用示例时，只删除最后的 `.example`：

```text
202608220001_audit_log_create_records.ts.example
202608220001_audit_log_create_records.ts

202608220002_audit_log_create_welcome_record.ts.example
202608220002_audit_log_create_welcome_record.ts
```

文件中导出的 `name` 必须与 `.ts` 文件名一致。修改正式文件名时，也要同步修改 `name`。

启用示例后，在目标 App 上执行 migration 和 seed：

```bash
pnpm --filter @nocobase/app-template-default migrate
pnpm --filter @nocobase/app-template-default seed
```

## 4. 启动和验证

启动默认 App：

```bash
pnpm app:dev
```

修改插件后，至少运行插件自己的完整检查：

```bash
pnpm --filter @nocobase/app-plugin-audit-log check
```

这个命令依次执行：

```text
lint → format:check → typecheck → test → build
```

插件注册或目标 App 集成发生变化后，再检查目标 App：

```bash
pnpm --filter @nocobase/app-template-default typecheck
pnpm --filter @nocobase/app-template-default test
pnpm --filter @nocobase/app-template-default build
```

## 5. 预览命令

创建、注册和解除注册都支持 `--dry-run`。它们只进行校验并显示将要执行的操作，不写入文件：

```bash
pnpm plugin:create audit-log --dry-run
pnpm plugin:register audit-log --app app-template-default --dry-run
pnpm plugin:unregister audit-log --app app-template-default --dry-run
```

查看完整参数：

```bash
pnpm plugin:create --help
pnpm plugin:register --help
pnpm plugin:unregister --help
pnpm plugin:remove --help
```

## 6. 检查 App 客户端贡献

读取指定 App 已启用插件的 routes 和最终 Provider 顺序：

```bash
pnpm app:client:inspect --app app-template-default
```

只查看其中一种贡献：

```bash
pnpm app:client:inspect --app app-template-default --type routes
pnpm app:client:inspect --app app-template-default --type providers
```

输出机器可读 JSON：

```bash
pnpm app:client:inspect --app app-template-default --json
```

CLI 与浏览器 runtime 复用相同的路由校验和 Provider 排序逻辑。它不会执行
`bootstrap.ts`，也不会调用路由的 `componentLoader` 或渲染 Provider。

## 7. 删除插件

`plugin:remove` 会拒绝删除仍被 workspace App 引用的插件。先解除指定 App 的注册：

```bash
pnpm plugin:unregister audit-log --app app-template-default
```

这个命令会从目标 App 的 `package.json` 中删除以下两项，并同步 lockfile：

```text
devDependencies.@nocobase/app-plugin-audit-log
nocobase.plugins.@nocobase/app-plugin-audit-log
```

它不会删除插件源码。解除注册后再删除插件：

```bash
pnpm plugin:remove audit-log
```

可以先预览两个操作：

```bash
pnpm plugin:unregister audit-log --app app-template-default --dry-run
pnpm plugin:remove audit-log --dry-run
```

## 完整示例

从零创建、注册、检查并启动 `audit-log` 插件：

```bash
pnpm plugin:create audit-log
pnpm plugin:register audit-log --app app-template-default
pnpm --filter @nocobase/app-plugin-audit-log check
pnpm app:dev
```

如果创建时插件目录已存在，脚本会拒绝覆盖。注册命令可以安全地重复执行；配置已经一致时不会重复修改或重新安装。
