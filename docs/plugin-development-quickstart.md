# 插件开发快速开始

本文介绍如何在当前 monorepo 中创建一个 NocoBase 服务端插件，并将它注册到指定 App。所有命令都应在仓库根目录执行。

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

## 6. 删除插件

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
