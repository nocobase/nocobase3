# 插件开发快速开始

本文介绍如何在当前 monorepo 中创建一个插件、注册到指定 App，并完成最基本的开发和验证。所有命令都在仓库根目录执行。

## 1. 创建插件

插件名使用小写 kebab-case，例如 `audit-log`：

```bash
pnpm plugin:create audit-log
```

命令会创建 `packages/app-plugin-audit-log/`，并同步 workspace 和 `pnpm-lock.yaml`。主要结构如下：

```text
packages/app-plugin-audit-log/
├── database/
│   ├── README.md
│   ├── migrations/
│   └── seeds/
├── server/
│   ├── plugin.ts
│   ├── providers/
│   │   ├── audit-log.ts
│   │   └── index.ts
│   ├── routes/
│   │   └── index.ts
│   ├── services/
│   │   └── audit-log.ts
│   └── tokens.ts
├── client/
│   ├── bootstrap.ts
│   ├── components/
│   │   └── provider.tsx
│   ├── pages/
│   │   ├── index.tsx
│   │   └── settings.tsx
│   ├── contexts.ts
│   ├── index.ts
│   ├── plugin.ts
│   ├── providers.ts
│   ├── routes.ts
│   └── settings.ts
├── tests/
├── package.json
└── tsconfig.json
```

脚手架不生成 `src/`。`client/plugin.ts` 定义注册面，并由 `client/index.ts` 作为 default 重新导出——App 注册这个插件时 import 的是 `<包名>/client`。默认 Client 示例包含一个 Refine resource、普通页面、设置页和 React Context Provider，注册插件后可直接作为前后端联通示例使用。不需要的贡献可以删除。可以在创建时指定展示名称和描述：

```bash
pnpm plugin:create audit-log \
  --display-name "Audit Log" \
  --description "Records application operations."
```

## 2. 注册到 App

创建插件后，将它注册到目标 App：

```bash
pnpm plugin:register audit-log --app app-template-default
```

`--app` 可以使用 workspace 目录名或完整包名；省略时默认为 `app-template-default`。注册命令会改动目标 App 的四个地方。

第一处是 `package.json`，加入依赖和插件登记：

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

客户端和服务端分别由 `client/plugins.ts` 与 `server/plugins.ts` 显式注册。过渡期内
`nocobase.plugins` 仍供 CLI、构建过滤、开发监听和 skills 同步使用，但服务端运行时
不再从中发现 Provider、Route、migration、seed 或 job。

第二处是 `client/plugins.ts`，命令会插入一条 import 和一个数组项：

```ts
import auditLog from '@nocobase/app-plugin-audit-log/client';

const clientPlugins: AppClientPlugins = defineClientPlugins([
  // ……已有的插件
  auditLog(),
]);
```

数组里出现即启用，数组顺序就是 bootstrap 顺序。命令按包短名转 camelCase 生成本地变量名，追加到数组末尾而不排序，然后用 App 的 prettier 配置格式化。文件里其余内容（注释、手写格式、你调整过的顺序）逐字保留，所以这个文件平时可以放心手改——手改的场景通常是调整顺序，或者给某个插件传配置。

第三处是 `server/plugins.ts`。插件声明 `exports["./server/plugin"]` 时，命令会插入 Server import 和数组项：

```ts
import auditLog from '@nocobase/app-plugin-audit-log/server/plugin';

const serverPlugins: AppServerPlugins<AppConfig> =
  defineServerPlugins<AppConfig>([
    // ……已有的插件
    auditLog,
  ]);
```

Server 数组里放的是插件定义本身，不调用它。命令同样按现有顺序追加，并保留文件中的泛型、注释和其他手写内容。

第四处是 `.agents/skills/`，命令会把插件 `.agents/skills/` 下的技能目录同步过来。技能目录名以 `nocobase-<插件包名去掉 scope>` 为前缀，同步时按这个前缀认领：属于已注册插件的目录整个替换，插件上游已删除的目录一并清掉，不以 `nocobase-` 开头的目录一律不碰。上游是唯一真相，所以不要在同步下来的目录里改内容，改了下次同步就没了。要写 App 自己的技能，建一个不以 `nocobase-` 开头的目录。

需要先装依赖但暂不启用时，使用 `--disabled`。它把 `enabled` 记为 `false`，并且不写 `client/plugins.ts` 和 `server/plugins.ts`：

```bash
pnpm plugin:register audit-log --app app-template-default --disabled
```

不需要同步技能时用 `--no-skills`：

```bash
pnpm plugin:register audit-log --app app-template-default --no-skills
```

后续插件升级带来了技能变化，单独跑同步命令即可，它不改注册关系：

```bash
pnpm plugin:skills:sync --app app-template-default
pnpm plugin:skills:sync --app app-template-default --plugin audit-log
```

省略 `--plugin` 时同步该 App 已注册的全部插件；该命令同样支持 `--dry-run`。

创建和注册默认都会运行 `pnpm install`。如果连续执行两步，可以只安装一次：

```bash
pnpm plugin:create audit-log --no-install
pnpm plugin:register audit-log --app app-template-default
```

### 在独立 App 里注册

上面这些仓库内命令同样由 `nb3 app plugin *` 执行；根 `package.json` 只额外传入 `--workspace-root .`，让 `--app` 可以按 workspace 目录名或完整包名选择目标 App，并让依赖范围默认使用 `workspace:^`。用户从 npm 拉下模板生成自己的 App 之后，仍使用同名命令，插件从 registry 安装：

```bash
cd my-crm
pnpm plugin:register audit-log
pnpm plugin:unregister audit-log
```

改动的四处地方完全一样，因为实现只有 `@nocobase/nb3-cli` 这一份。独立 App 不传 `--workspace-root`，所以没有 workspace 选择过程：命令就在当前 App 目录里运行，插件从 `node_modules` 解析，依赖记录 registry 上安装的实际版本而不是 `workspace:^`。

参数和完整说明见 [docs/cli](./cli/README.md)。

**纯服务端插件不会写进 `client/plugins.ts`。** 两边都按插件的 `exports["./client"]` 判断：没有这个导出就跳过客户端注册，因为写进去的 import 在构建时解析不到。

反过来，纯客户端插件不会写进 `server/plugins.ts`。判据是 `exports["./server/plugin"]`；Client 和 Server 注册面分别判断，互不推测。

## 3. 开发插件

根据插件需要，依次处理 Database、Server 和 Client；不需要的部分可以跳过。

### Database

`database/migrations/` 和 `database/seeds/` 中的示例以 `.ts.example` 结尾，默认不会执行。需要启用时，删除最后的 `.example`，并确保文件导出的 `name` 与 `.ts` 文件名一致。

脚手架生成的 `server/plugin.ts` 已默认声明这两个目录。目录不存在或只有
`.ts.example` 文件时不会产生任何数据库贡献，因此启用示例时不需要再修改插件入口。

```text
202608220001_audit_log_create_records.ts.example
202608220001_audit_log_create_records.ts
```

然后在目标 App 中执行：

```bash
pnpm --filter @nocobase/app-template-default migrate
pnpm --filter @nocobase/app-template-default seed
```

生成插件中的 `database/README.md` 有对应说明；也可以参考 [database example](../packages/app-plugin-database-example/README.md)。

### Server

- `server/plugin.ts`：唯一的服务端注册入口，显式声明 Providers、API Routes、Root Routes、database 和 queue 贡献；
- `server/providers/index.ts`：组合并导出 Provider 集合；具体 Provider 放在同一目录的领域文件中；
- `server/services/*.ts`：放置领域服务的默认实现；
- `server/tokens.ts`：定义稳定的服务接口和 ServiceToken，供 Provider、Route 和其他消费者共享；
- `server/routes/index.ts`：定义并组合默认的 route contributions，通过 `app.container` 和 ServiceToken 解析服务；其他路由模块放在同一目录。

`server/plugin.ts` 还会默认声明 `queue.jobs: ['./server/jobs']`。未创建该目录时不会加载任何 Job；需要队列任务时直接添加 `server/jobs/*.ts` 即可，不需要再次修改插件入口。

普通业务接口使用 `defineApiRoutes()`，由 Application 统一挂载到 `/api`；安装入口、协议回调和 HTML 页面等特殊入口使用 `defineRootRoutes()`。两者都放入同一个 `routes` 数组，不要在 Provider 的 `boot()` 中注册 HTTP 路由。

Service Provider 的概念、五阶段生命周期、Token/Container 用法和完整插件示例参见 [Service Provider](./service-provider.md)。仓库内可运行的实现位于 [`@nocobase/app-plugin-service-provider-example`](../packages/app-plugin-service-provider-example/README.md)。

脚手架默认提供：

```text
GET /api/audit-log
```

启动 App 后即可访问，实际主机、端口和 App base path 以 `pnpm app:dev` 的输出为准。

### Client

客户端分成注册面和实现两层。`client/plugin.ts` 是注册面，`client/index.ts` 把它作为 default 导出，App 从 `<包名>/client` import 插件；另外四个入口是实现：

- `client/plugin.ts`：声明包名、四个入口的 loader，以及插件接受哪些配置项；`client/index.ts` 把它作为 default 导出；
- `client/bootstrap.ts`：注册 Refine 等命令式客户端能力；
- `client/routes.ts`：声明按需加载的页面路由；
- `client/settings.ts`：声明注册到设置中心的页面；
- `client/providers.ts`：声明同步 React Provider。

脚手架生成的 `client/plugin.ts` 长这样：

```ts
import {
  defineClientPlugin,
  type AppClientPluginFactory,
} from '@nocobase/app-client/plugins';

export interface AuditLogClientOptions {
  /** Label used for the resource registered by the bootstrap entry. */
  readonly resourceLabel?: string;
}

const auditLog: AppClientPluginFactory<AuditLogClientOptions> =
  defineClientPlugin({
    packageName: '@nocobase/app-plugin-audit-log',
    bootstrap: () => import('./bootstrap.js'),
    routes: () => import('./routes.js'),
    settings: () => import('./settings.js'),
    providers: () => import('./providers.js'),
  });

export default auditLog;
```

四个入口都是可选的，插件没有的能力删掉对应字段和文件即可，不必保留空数组。`AuditLogClientOptions` 是配置项的落点；默认的 `resourceLabel` 会覆盖 bootstrap 注册的 Refine resource 标题，例如 App 可以写 `auditLog({ resourceLabel: '审计日志' })`。

默认示例展示了四个入口如何配合：

- `bootstrap.ts` 注册名为 `audit-log` 的 Refine resource，并读取 `resourceLabel`；
- `routes.ts` 注册按需加载的 `/audit-log` 页面，该页面请求同一插件的 `GET /api/audit-log` 服务端接口；
- `settings.ts` 注册按需加载的 `/settings/audit-log` 设置页；
- `providers.ts` 注册 Context Provider，普通页面通过自定义 Hook 读取其中的值。

这些是可运行的最小示例，不是插件必须保留的固定结构。比如纯设置插件可以删除普通页面、对应 route 和 Refine resource；不需要共享客户端状态时可以删除 Provider、Context 和对应 Hook。

配置项有两条通路。命令式的配置走 bootstrap：App 传进来的值会出现在 bootstrap context 的 `options` 上，把 bootstrap 的类型参数指定为自己的 options 接口就能读到。notification-provider 插件用这条通路让 App 定制撤销按钮的文案：

```ts
import type { AppClientBootstrap } from '@nocobase/app-client/plugins';

import type { NotificationProviderClientOptions } from './plugin.js';
import { createNotificationProvider } from './notification-provider.js';

const bootstrap: AppClientBootstrap<NotificationProviderClientOptions> = ({
  refine,
  options,
}) => {
  refine.setNotificationProvider(createNotificationProvider(options));
};

export default bootstrap;
```

声明式的页面替换走 `routeComponentOverrides`。它拿到 options，返回一组路由组件覆盖；option 没传就返回空数组。authentication 插件用这条通路把登录页和注册页开放给 App 替换：

```ts
const authentication: AppClientPluginFactory<AuthenticationClientOptions> =
  defineClientPlugin({
    packageName: '@nocobase/app-plugin-authentication',
    bootstrap: () => import('./bootstrap.js'),
    routes: () => import('./routes.js'),
    routeComponentOverrides: (options) =>
      options.loginPage
        ? [
            {
              routeId: AUTHENTICATION_ROUTE_IDS.login,
              componentLoader: options.loginPage,
            },
          ]
        : [],
  });
```

这类选项的类型声明成 `AppClientRouteComponentLoader`（也就是 `() => import('...')`）而不是组件值，页面才不会被拖进首屏 chunk。App 侧对应写成 `authentication({ loginPage: () => import('./pages/branded-login') })`。同一条路由只能被覆盖一次，插件 option、`route-overrides.ts` 和 source extension 三者选其一，重复覆盖会带着 route ID 报错。

`client/routes.ts`、`client/settings.ts` 和 `client/providers.ts` 的 default export 除了数组，也可以是一个接受 options 的函数，运行时会带着 App 传的配置调用它，用来按配置增减页面或给 Provider 传参。不需要配置时保持数组写法，什么都不用改。

#### 设置中心

`client/settings.ts` 里的每一项会成为 App 设置中心（右上角齿轮，`/settings`）里的内容，插件不需要自己管布局和左侧导航。一项要么是一个页面，要么是一组页面；分组把图标和标题在组这一层写一次，子项不用重复：

```ts
import {
  defineClientSettings,
  type AppClientSettingDefinition,
} from '@nocobase/app-client/plugins';
import { FileClock, ScrollText } from 'lucide-react';

const settings: readonly AppClientSettingDefinition[] = defineClientSettings([
  {
    id: 'audit-log',
    title: 'Audit Log',
    icon: ScrollText,
    children: [
      {
        id: 'general',
        title: 'General',
        icon: FileClock,
        access: { resource: 'audit-log.settings.general', action: 'read' },
        pageLoader: () => import('./pages/general-page.js'),
      },
    ],
  },
]);

export default settings;
```

id 是单个 URL 段，层级由树结构决定，所以上面这个页面挂在 `/settings/audit-log/general`。只有一个页面的插件不用套分组，直接写 `{ id, title, pageLoader }`，挂在 `/settings/<id>`，导航里就是平铺的一行。分组只支持一层，也就是分组的子项都是页面，不能再套分组。

`icon` 在分组和页面上都可选，是一个接受 `className` 的组件，lucide-react 的图标直接满足；尺寸由 App 统一给，这样不同插件的条目能对齐。

`access` 属于页面，可选。填了就在加载页面前做一次权限检查，没通过的页面既不出现在导航里，直接访问 URL 也会被挡掉；一个分组下的页面全被挡掉时，分组本身也不显示。不填表示只要能进设置中心就能看。

设置中心的左侧导航按分组折叠，行为和主侧边栏一致：默认展开当前页面所在的组，其余收起。

设置和路由共用同一个路径空间：一个页面挂在 `/settings/general`，另一个插件又声明 `path: '/settings/general'` 的路由，启动时会直接报冲突，而不是让两个页面抢同一个地址。

`client/plugin.ts` 会经由 `client/index.ts` 被 App 的 `client/plugins.ts` 静态 import，所以它静态 import 的东西都会进入应用的入口 chunk。建议这个文件只 import `defineClientPlugin`、路由 ID 常量这类轻量内容，组件、Provider 工厂、服务类都留在三个实现入口里由 `() => import()` 引用。这是建议而非强制校验。

barrel 里的其他导出（类型、工具函数、组件）不会因此进入入口 chunk：脚手架给每个插件声明了 `sideEffects: false`，打包器据此把 App 没用到的导出摇掉。实测 8 个插件走 `<包名>/client` 与走 `<包名>/client/plugin` 的入口体积逐字节相同。反过来说，如果插件里真的存在模块级副作用（例如 `import './x.css'`），就不能保留这条声明。

脚手架已经在 `package.json` 的 `exports` 和 `publishConfig.exports` 里各开了 `./client` 和 `./client/plugin` 两条，以及另外四个入口。完整协议参见 [app-client README](../packages/app-client/README.md)，可运行的前后端示例参见 [routes example](../packages/app-plugin-routes-example/README.md)。

## 4. 检查和启动

修改插件后，运行插件自己的完整检查：

```bash
pnpm --filter @nocobase/app-plugin-audit-log check
```

它会依次执行 lint、格式检查、类型检查、测试和构建。插件涉及客户端时，还可以检查 App 最终加载的 bootstrap、routes、settings 和 providers：

```bash
pnpm --filter @nocobase/app-template-default client:inspect
```

插件注册或 App 集成发生变化后，再检查目标 App：

```bash
pnpm --filter @nocobase/app-template-default typecheck
pnpm --filter @nocobase/app-template-default test
pnpm --filter @nocobase/app-template-default build
```

最后启动 App：

```bash
pnpm app:dev
```

## 5. 解除注册和删除

删除插件前，先解除目标 App 的注册：

```bash
pnpm plugin:unregister audit-log --app app-template-default
pnpm plugin:remove audit-log
```

`plugin:unregister` 是注册的逆操作：移除依赖和 `nocobase.plugins` 登记，删掉 `client/plugins.ts` 与 `server/plugins.ts` 里的 import 和数组项，并清理 `.agents/skills/` 下属于该插件的目录。它不删除插件源码。仍被 workspace App 引用的插件不能被 `plugin:remove` 删除，这个引用检查同时看依赖字段、`nocobase.plugins` 和各 App 的两个显式插件入口。

创建、注册、解除注册和删除都可以先使用 `--dry-run` 预览；完整参数使用 `--help` 查看。

## 完整流程

```bash
pnpm plugin:create audit-log --no-install
pnpm plugin:register audit-log --app app-template-default
pnpm --filter @nocobase/app-plugin-audit-log check
pnpm app:dev
```
