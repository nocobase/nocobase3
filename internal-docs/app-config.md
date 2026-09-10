---
title: Application Config
description: 应用模块配置、runtime 组装、环境覆盖与重载
---

# Application Config

应用把各模块的默认配置放在 `server/config/*.ts` 和 `client/config/*.ts`，由各自的 `config/index.ts` 统一出口。Runtime 加载静态配置，再执行代码配置并合并默认值。入口随后创建 Application 并绑定 `runtime.app`。服务启动时读取的 `app.config` 与 `runtime.config` 是同一个完整配置对象。

## 模块配置

```ts
// server/config/drive.ts
import { defineAppConfig, type AppConfigFactory } from '@nocobase/app-server/config';
import type { AppDriveConfig } from '@nocobase/drive';

const drive: AppConfigFactory<AppDriveConfig> = defineAppConfig((runtime) => ({
  default: 'local',
  disks: {
    local: {
      driver: 'fs',
      location: runtime.configPaths.storage(),
      visibility: 'private',
    },
  },
}));

export default drive;
```

配置工厂可以使用 `runtime.configPaths`、`runtime.paths` 和 `runtime.plugins` 获取应用路径、路由、环境及已解析的插件信息。需要服务的回调可以捕获 `runtime`，在回调实际执行时通过 `runtime.app?.container` 解析服务；生成配置时 app 尚未创建，服务尚未注册。

```ts
// server/config/index.ts
import { defaultAppConfigs, type AppConfigFactory } from '@nocobase/app-server/config';
import auth from './auth.js';
import drive from './drive.js';

const config: AppConfigFactory<{
  auth: ReturnType<typeof auth>;
  drive: ReturnType<typeof drive>;
}> = defaultAppConfigs({ auth, drive });

export default config;
```

客户端使用 `@nocobase/app-client` 导出的同名辅助函数。runtime 先读取页面注入的公开静态配置，再执行 `client/config/index.ts` 的 TS 工厂并合并默认值，服务统一读取 `runtime.config` / `app.config`。公开静态配置覆盖 TS 默认值。配置可以包含原生库支持的函数、插件和实例。

## 静态来源和覆盖顺序

`server/config.ts` 加载 `config.yml`，随后应用 `server/environment.ts` 的显式环境映射。覆盖优先级为代码默认配置、配置文件、映射环境变量。普通对象按字段递归合并；数组和函数整体替换。

```yaml
database:
  connections:
    main:
      dialect: postgres
      host: db.internal
      database: nocobase
      username: nocobase
      password: replace-with-database-password
auth:
  secret: replace-with-a-unique-secret-at-least-32-characters
```

环境映射用一个扁平对象，一次登记。默认只支持 AUTH_SECRET、SESSION_SECRET、APP_SERVER_HOST、APP_SERVER_PORT、APP_PUBLIC_ORIGIN、SNOWFLAKE_WORKER_ID，以及开发工具注入的 APP_VITE_DEV_URL。其他部署参数写入 YAML；需要自行添加环境映射时，使用明确且不冲突的模块变量名。NODE_ENV 只作为进程模式参与 TS 默认配置计算，具体行为可由 YAML 覆盖。YAML 不提供通用环境变量插值。

Runtime 声明用 `config` 接收静态加载器，`defaultConfig` 接收 `config/index.ts` 导出的工厂。应用入口调用 `createApp(runtime)` 创建应用结构。返回的 runtime 通过 `config` 提供完整配置。代码默认配置由 runtime 合并，Application 构造函数只保存配置引用。

## 读取与重载

```ts
const drive = app.config.get<AppDriveConfig>('drive');

app.config.subscribe<AIApplicationConfig>('ai', ({ current }) => {
  return synchronizeServices(current.llmServices);
});

await app.config.reload();
```

代码配置每个应用只执行一次。`reload()` 重新读取已登记的静态来源，保留代码默认值，返回发生变化的顶层配置 key，并通知订阅者。删除环境覆盖后恢复代码默认值。修改 TS 配置需要重新启动应用。

服务是否支持热更新由它自己决定。AI 的 LLM 服务订阅配置变化；数据库、缓存和认证实例不会因为配置重载而自动重建。配置的 TypeScript 类型用于开发检查，运行时对外部值的约束由实际使用它的模块负责验证。
