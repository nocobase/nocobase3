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
│   ├── bootstrap.ts
│   └── routes/index.ts
├── client/
│   ├── plugin.ts
│   ├── bootstrap.ts
│   ├── routes.ts
│   └── providers.ts
├── tests/
├── package.json
└── tsconfig.json
```

脚手架不生成 `src/`。`client/plugin.ts` 定义注册面，并由 `client/index.ts` 作为 default 重新导出——App 注册这个插件时 import 的是 `<包名>/client`。另外三个入口默认都是空贡献，注册插件后不会自动增加页面或 Provider。可以在创建时指定展示名称和描述：

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

`--app` 可以使用 workspace 目录名或完整包名；省略时默认为 `app-template-default`。注册命令会改动目标 App 的三个地方。

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

`nocobase.plugins` 现在只服务服务端：server 的 bootstrap 和路由、migration / seed / job 的来源、dev 的插件监听范围，以及构建时按哪些包过滤。客户端不再读它。

第二处是 `client/plugins.ts`，命令会插入一条 import 和一个数组项：

```ts
import auditLog from '@nocobase/app-plugin-audit-log/client';

const clientPlugins: AppClientPlugins = defineClientPlugins([
  // ……已有的插件
  auditLog(),
]);
```

数组里出现即启用，数组顺序就是 bootstrap 顺序。命令按包短名转 camelCase 生成本地变量名，追加到数组末尾而不排序，然后用 App 的 prettier 配置格式化。文件里其余内容（注释、手写格式、你调整过的顺序）逐字保留，所以这个文件平时可以放心手改——手改的场景通常是调整顺序，或者给某个插件传配置。

第三处是 `.agents/skills/`，命令会把插件 `.agents/skills/` 下的技能目录同步过来。技能目录名以 `nocobase-<插件包名去掉 scope>` 为前缀，同步时按这个前缀认领：属于已注册插件的目录整个替换，插件上游已删除的目录一并清掉，不以 `nocobase-` 开头的目录一律不碰。上游是唯一真相，所以不要在同步下来的目录里改内容，改了下次同步就没了。要写 App 自己的技能，建一个不以 `nocobase-` 开头的目录。

需要先装依赖但暂不接入客户端时，使用 `--disabled`。它把 `enabled` 记为 `false`，并且不写 `client/plugins.ts`：

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

上面这些是仓库内的命令，靠 workspace 找插件。用户从 npm 拉下模板生成自己的 App 之后，用的是同名的 App 侧命令，插件从 registry 装：

```bash
cd my-crm
pnpm plugin:register audit-log
pnpm plugin:unregister audit-log
```

改动的三处地方完全一样，因为实现是同一份（在 `@nocobase/nb3-cli` 里）。差别只有两点：插件从 `node_modules` 而不是 `packages/` 解析，依赖记的是 registry 上的实际版本而不是 `workspace:^`。没有 `--app` 参数——命令就在这个 App 目录里跑。

参数和完整说明见 [docs/cli](./cli/README.md)。

**纯服务端插件不会写进 `client/plugins.ts`。** 两边都按插件的 `exports["./client"]` 判断：没有这个导出就跳过客户端注册，因为写进去的 import 在构建时解析不到。

## 3. 开发插件

根据插件需要，依次处理 Database、Server 和 Client；不需要的部分可以跳过。

### Database

`database/migrations/` 和 `database/seeds/` 中的示例以 `.ts.example` 结尾，默认不会执行。需要启用时，删除最后的 `.example`，并确保文件导出的 `name` 与 `.ts` 文件名一致。

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

- `server/bootstrap.ts`：注册服务端能力和生命周期清理逻辑；
- `server/routes/index.ts`：注册 HTTP API。

脚手架默认提供：

```text
GET /audit-log
```

启动 App 后即可访问，实际主机、端口和 App base path 以 `pnpm app:dev` 的输出为准。

### Client

客户端分成注册面和实现两层。`client/plugin.ts` 是注册面，`client/index.ts` 把它作为 default 导出，App 从 `<包名>/client` import 插件；另外三个入口是实现：

- `client/plugin.ts`：声明包名、三个入口的 loader，以及插件接受哪些配置项；`client/index.ts` 把它作为 default 导出；
- `client/bootstrap.ts`：注册 Refine 等命令式客户端能力；
- `client/routes.ts`：声明按需加载的页面路由；
- `client/providers.ts`：声明同步 React Provider。

脚手架生成的 `client/plugin.ts` 长这样：

```ts
import {
  defineClientPlugin,
  type AppClientPluginFactory,
} from '@nocobase/app-client/plugins';

export interface AuditLogClientOptions {
  readonly placeholder?: never;
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

三个入口都是可选的，插件没有的能力删掉对应字段即可，不必留空数组。`AuditLogClientOptions` 是配置项的落点，默认的 `placeholder?: never` 表示暂时不接受配置，实际要用时替换成自己的字段。

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

`client/routes.ts` 和 `client/providers.ts` 的 default export 除了数组，也可以是一个接受 options 的函数，运行时会带着 App 传的配置调用它，用来按配置增减路由或给 Provider 传参。不需要配置时保持数组写法，什么都不用改。

`client/plugin.ts` 会经由 `client/index.ts` 被 App 的 `client/plugins.ts` 静态 import，所以它静态 import 的东西都会进入应用的入口 chunk。建议这个文件只 import `defineClientPlugin`、路由 ID 常量这类轻量内容，组件、Provider 工厂、服务类都留在三个实现入口里由 `() => import()` 引用。这是建议而非强制校验。

barrel 里的其他导出（类型、工具函数、组件）不会因此进入入口 chunk：脚手架给每个插件声明了 `sideEffects: false`，打包器据此把 App 没用到的导出摇掉。实测 8 个插件走 `<包名>/client` 与走 `<包名>/client/plugin` 的入口体积逐字节相同。反过来说，如果插件里真的存在模块级副作用（例如 `import './x.css'`），就不能保留这条声明。

脚手架已经在 `package.json` 的 `exports` 和 `publishConfig.exports` 里各开了 `./client` 和 `./client/plugin` 两条，以及另外三个入口。完整协议参见 [app-client README](../packages/app-client/README.md)，可运行的前后端示例参见 [routes example](../packages/app-plugin-routes-example/README.md)。

## 4. 检查和启动

修改插件后，运行插件自己的完整检查：

```bash
pnpm --filter @nocobase/app-plugin-audit-log check
```

它会依次执行 lint、格式检查、类型检查、测试和构建。插件涉及客户端时，还可以检查 App 最终加载的 bootstrap、routes 和 providers：

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

`plugin:unregister` 是注册的逆操作：移除依赖和 `nocobase.plugins` 登记，删掉 `client/plugins.ts` 里的 import 和数组项，并清理 `.agents/skills/` 下属于该插件的目录。它不删除插件源码。仍被 workspace App 引用的插件不能被 `plugin:remove` 删除，这个引用检查同时看依赖字段、`nocobase.plugins` 和各 App 的 `client/plugins.ts`。

创建、注册、解除注册和删除都可以先使用 `--dry-run` 预览；完整参数使用 `--help` 查看。

## 完整流程

```bash
pnpm plugin:create audit-log --no-install
pnpm plugin:register audit-log --app app-template-default
pnpm --filter @nocobase/app-plugin-audit-log check
pnpm app:dev
```
