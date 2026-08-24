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
├── tests/
├── package.json
└── tsconfig.json
```

脚手架不生成 `src/` 和客户端目录。可以在创建时指定展示名称和描述：

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

`--app` 可以使用 workspace 目录名或完整包名；省略时默认为 `app-template-default`。注册命令会在目标 App 的 `package.json` 中添加：

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

需要先注册但暂不加载时，使用 `--disabled`：

```bash
pnpm plugin:register audit-log --app app-template-default --disabled
```

创建和注册默认都会运行 `pnpm install`。如果连续执行两步，可以只安装一次：

```bash
pnpm plugin:create audit-log --no-install
pnpm plugin:register audit-log --app app-template-default
```

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

### Client（可选）

脚手架默认不生成客户端代码。需要浏览器能力时，可以按需添加：

- `client/bootstrap.ts`：注册 Refine 等命令式客户端能力；
- `client/routes.ts`：声明按需加载的页面路由；
- `client/providers.ts`：声明同步 React Provider。

三个入口彼此独立，使用哪个就在插件 `package.json` 中声明对应的 export 和 `nocobase.plugin.client` 配置。完整协议参见 [app-client README](../packages/app-client/README.md)，可运行的前后端示例参见 [routes example](../packages/app-plugin-routes-example/README.md)。

## 4. 检查和启动

修改插件后，运行插件自己的完整检查：

```bash
pnpm --filter @nocobase/app-plugin-audit-log check
```

它会依次执行 lint、格式检查、类型检查、测试和构建。插件涉及客户端时，还可以检查 App 最终加载的 bootstrap、routes 和 providers：

```bash
pnpm app:client:inspect --app app-template-default
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

`plugin:unregister` 只删除目标 App 中的依赖和插件配置，不删除插件源码。仍被 workspace App 引用的插件不能被 `plugin:remove` 删除。

创建、注册、解除注册和删除都可以先使用 `--dry-run` 预览；完整参数使用 `--help` 查看。

## 完整流程

```bash
pnpm plugin:create audit-log --no-install
pnpm plugin:register audit-log --app app-template-default
pnpm --filter @nocobase/app-plugin-audit-log check
pnpm app:dev
```
