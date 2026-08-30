---
title: Application Config
description: NocoBase V3 应用配置的定义、组装、加载、校验、读取、重载与插件扩展方式
---

# Application Config

NocoBase V3 的应用配置由 `AppConfig` 统一管理。它负责把模块声明的默认值、应用选择的配置源和环境变量合并成一份经过校验的配置，并通过 `app.config` 提供给 Service Provider、Route 和其他运行时代码。

```text
Config definitions
  ├── core configs
  └── plugin configs
          │
          ▼
       AppConfig
  defaults → providers → environment
          │
          ▼
      schema validation
          │
          ▼
  app.config.get(...) / subscribe(...)
```

`AppConfig` 只管理配置数据，不创建 logger、database、proxy handler 等运行时对象。运行时转换和资源初始化属于对应的 Service Provider 或模块入口。

## 核心概念

### Config definition

每个模块用 `defineAppConfig()` 声明自己拥有的配置：

```ts
import {
  defineAppConfig,
  envBoolean,
  type AppConfigDefinition,
} from '@nocobase/app-server-kit/config';
import { Type } from '@sinclair/typebox';

export interface HeartbeatConfig {
  readonly enabled: boolean;
  readonly interval: number;
}

export const heartbeatConfig: AppConfigDefinition<HeartbeatConfig> =
  defineAppConfig({
    namespace: 'heartbeat',
    schema: Type.Object(
      {
        enabled: Type.Boolean(),
        interval: Type.Integer({ minimum: 100 }),
      },
      { additionalProperties: false },
    ),
    defaults: {
      enabled: true,
      interval: 5_000,
    },
    envMappings: {
      HEARTBEAT_ENABLED: envBoolean('enabled'),
    },
  });
```

一个 definition 包含四部分：

| 字段          | 作用                                                  |
| ------------- | ----------------------------------------------------- |
| `namespace`   | 配置树中的顶层 key，同时是模块配置的稳定标识          |
| `schema`      | TypeBox/JSON Schema，负责运行时校验和 TypeScript 推导 |
| `defaults`    | 模块默认值，可以是对象，也可以是同步或异步函数        |
| `envMappings` | 把明确的环境变量映射到当前 namespace 下的配置路径     |

namespace 在一个应用中必须唯一。重复注册会在创建 `AppConfig` 时立即报错。

TypeBox schema 中的 `default` 关键字只描述 schema 元数据，不会自动写入配置。实际默认值统一放在 definition 的 `defaults` 中：

```ts
defineAppConfig({
  namespace: 'heartbeat',
  schema: Type.Object({
    enabled: Type.Boolean(),
  }),
  defaults: {
    enabled: true,
  },
});
```

配置 schema 不承载表单 UI 或配置应用策略，因此不使用 `x-ui`、`x-config`。如果以后需要配置表单，应由单独的产品层元数据描述，不改变基础配置协议。

### AppConfig

应用创建一个 `AppConfig`，传入所有 config definitions：

```ts
const config = new AppConfig([...coreConfigs, ...context.configs], {
  context,
  environment: context.environment,
});
```

- `coreConfigs` 是 `app-server-kit` 提供的标准应用配置；
- `context.configs` 是当前 App 注册的服务端插件贡献的配置；
- `context` 供函数式 defaults 读取应用路径、运行模式和插件元数据；
- `environment` 是 Host 或 standalone runtime 传入的环境变量快照。

`AppConfig` 不自行决定配置来自文件、数据库还是远程接口。应用通过 provider 选择配置来源。

### Provider 和 parser

Provider 负责读取配置来源，parser 负责把字节内容解析成配置对象：

```ts
config.load(fileProvider(configPath), yamlParser());
```

`load()` 是同步登记操作，不会立即读取 provider。runtime 在配置来源全部登记后统一执行：

```ts
await config.loadAll();
```

这样 defaults、所有 provider 和环境变量只经过一次完整的合并与校验，然后原子地成为当前配置。

## 应用如何组装配置

Default App 在 `server/config/index.ts` 中完成配置组装：

```ts
import { coreConfigs } from '@nocobase/app-server-kit';
import { AppConfig } from '@nocobase/app-server-kit/config';
import { yamlParser } from '@nocobase/config/parsers/yaml';
import { fileProvider } from '@nocobase/config/providers/file';

export function createAppConfig(context) {
  const config = new AppConfig([...coreConfigs, ...context.configs], {
    context,
    environment: context.environment,
  });

  const configuredPath =
    context.configPath ?? context.environment.APP_CONFIG_FILE;
  const configPath = context.paths.root(configuredPath ?? 'config.yml');

  config.load(
    fileProvider(configPath, { optional: configuredPath === undefined }),
    yamlParser(),
  );

  return config;
}
```

应用 runtime 只引用这个工厂：

```ts
export default defineAppRuntime({
  config: createAppConfig,
  plugins,
  providers,
  apiRoutes,
  rootRoutes,
});
```

`resolveAppRuntime()` 获得 `AppConfig` 后调用 `loadAll()`。应用代码不需要重复初始化。

## 加载顺序

配置按以下优先级合并，后面的值覆盖前面的值：

```text
1. definitions 的 defaults
2. config.load() 登记的 providers，按登记顺序
3. definitions 的 envMappings
```

例如：

```ts
const config = new AppConfig([serverConfig], {
  environment: { APP_SERVER_PORT: '14000' },
});

config.load(objectProvider({ server: { port: 13500 } }));
await config.loadAll();

config.get('server.port'); // 14000
```

如果登记多个 provider，后登记的 provider 优先：

```ts
config
  .load(fileProvider('base.yml'), yamlParser())
  .load(objectProvider({ logging: { level: 'debug' } }));
```

`AppConfig` 不限制 provider 类型。文件、数据库、HTTP API 或 Host IPC 都可以实现 `ConfigProvider` 后接入。

## 配置文件路径

Default App 的配置路径优先级是：

```text
Host 传入的 context.configPath
→ APP_CONFIG_FILE 环境变量
→ <app root>/config.yml
```

- Host 托管 App 时可以通过 scope 的 `configPath` 指定路径；
- standalone App 可以设置 `APP_CONFIG_FILE`；
- 两者都没有时使用 App 根目录下的 `config.yml`；
- 默认路径不存在时允许启动，只使用 defaults 和环境变量；
- 显式指定的配置文件不存在时加载失败，避免静默使用错误配置。

仓库提供 `config.example.yml` 作为可复制的示例：

```bash
cp config.example.yml config.yml
```

`.env` 和 `.env.example` 不属于当前应用配置协议。

## 插件贡献配置

插件定义自己的 config，并在服务端插件定义中贡献：

```ts
export const heartbeatConfig = defineAppConfig({
  namespace: 'heartbeat',
  schema: Type.Object({
    enabled: Type.Boolean(),
  }),
  defaults: {
    enabled: true,
  },
});

export default defineServerPlugin({
  packageName: '@nocobase/app-plugin-heartbeat',
  config: heartbeatConfig,
  providers: [HeartbeatProvider],
});
```

插件也可以贡献多个 definition：

```ts
export default defineServerPlugin({
  packageName: '@nocobase/app-plugin-example',
  config: [featureConfig, workerConfig],
});
```

runtime 收集已注册插件的配置贡献，放入 `context.configs`。应用不需要在 `server/config/index.ts` 中硬编码每个插件。

通常插件定义自己的 namespace。应用级配置值覆盖应放在配置 provider 中，不应通过插件修改其他 definition 的 defaults。

### 为动态配置集合贡献 Variant

当一个模块允许插件扩展动态实现时，基础 definition 只声明公共结构。例如 caching 的每个 provider 都有 `driver`，但 Redis 参数不属于 caching 核心包：

```ts
export const cachingConfig = defineAppConfig({
  namespace: 'caching',
  schema: Type.Object({
    default: Type.String(),
    providers: Type.Record(
      Type.String(),
      Type.Object({ driver: Type.String() }, { additionalProperties: true }),
    ),
  }),
});
```

Redis 插件使用 `defineAppConfigVariant()` 为集合中的 Redis 条目贡献详细 schema：

```ts
export const redisCachingConfig = defineAppConfigVariant({
  target: 'caching.providers',
  discriminator: 'driver',
  value: 'redis',
  schema: Type.Object(
    {
      driver: Type.Literal('redis'),
      url: Type.String({ format: 'uri' }),
      database: Type.Optional(Type.Integer({ minimum: 0 })),
    },
    { additionalProperties: false },
  ),
});

export default defineServerPlugin({
  packageName: '@nocobase/app-plugin-caching-redis',
  config: redisCachingConfig,
  providers: [RedisCachingProvider],
});
```

Variant 是纯配置贡献，不修改 `cachingConfig`，也不创建运行时实现：

- `target` 是动态集合的完整配置路径，第一段必须是已注册的 namespace；
- `discriminator` 指定用于选择 variant 的字段；
- `value` 是当前 variant 匹配的字段值；
- `schema` 校验匹配到的完整集合条目。

例如下面的 `primary` 会由 Redis variant 校验：

```yaml
caching:
  default: primary
  providers:
    primary:
      driver: redis
      url: redis://localhost:6379
      database: 0
```

普通 definition 先校验公共结构，随后 `AppConfig` 遍历 `caching.providers`，根据 `driver` 选择 variant。没有注册对应 variant、同一 variant 重复注册或详细 schema 校验失败都会阻止配置提交。reload 时只要 target namespace 变化，也会重新执行相应 variant 校验。

Variant 不代表独立配置值，因此不支持 `app.config.get(redisCachingConfig)`。可以读取完整模块配置或直接按路径读取：

```ts
const caching = app.config.get(cachingConfig);
const primary = app.config.get('caching.providers.primary');
```

插件的 Service Provider 仍按正常生命周期找到 caching service 并注册 Redis 运行时实现；这条运行时链路与 variant 的配置校验链路相互独立。

## 读取配置

### 使用 definition 读取模块配置

推荐在 Provider 中使用 definition：

```ts
const config = this.app.config.get(heartbeatConfig);

if (config.enabled) {
  // ...
}
```

返回类型由 `AppConfigDefinition<T>` 决定，不需要类型断言。

### 使用路径读取单个值

通用代码也可以按路径读取：

```ts
const enabled = app.config.get<boolean>('heartbeat.enabled');
const missing = app.config.get('heartbeat.missing'); // undefined
```

definition 读取和路径读取来自同一份配置快照。`AppConfig` 不维护 resolved values 或其他隐藏配置层。

### 获取完整配置

```ts
const value = app.config.raw();
```

`raw()` 返回完整配置的副本，适合诊断、导出或管理接口。业务模块通常应读取自己的 definition，避免依赖不属于自己的 namespace。

## 校验

`loadAll()` 会校验所有已注册 namespace。校验失败时，配置不会提交：

```text
Invalid application config: server.port: must be <= 65535
```

关键行为：

- 不做隐式类型转换；字符串 `"13000"` 不会自动变成数字；
- 不自动应用 schema 的 `default`；
- 不自动删除额外字段；是否允许额外字段由 schema 决定；
- schema 可以带第三方自定义关键字，但 `AppConfig` 不解释这些关键字。

环境变量需要使用对应 mapping helper 显式转换：

```ts
envString('host');
envInteger('port');
envBoolean('enabled');
envStrings('trustedOrigins');
```

## Reload 和订阅

`reload()` 会重新读取所有已登记 provider，生成下一份完整配置：

```ts
const result = await app.config.reload();

console.log(result.changedNamespaces);
```

reload 的行为是：

1. 复用首次计算并缓存的 defaults；
2. 重新读取所有应用 provider；
3. 复用构造 `AppConfig` 时捕获的 environment 映射；
4. 比较顶层 namespace；
5. 只校验发生变化的 namespace；
6. 校验全部通过后原子替换当前配置；
7. 通知变化 namespace 的订阅者。

如果加载或校验失败，旧配置继续有效。并发调用 `reload()` 会共享同一次 reload promise。

模块可以订阅自己的配置：

```ts
const unsubscribe = app.config.subscribe(
  heartbeatConfig,
  async ({ previous, current }) => {
    if (previous.interval !== current.interval) {
      await heartbeat.reconfigure(current);
    }
  },
);

scope.registerDisposer('heartbeat-config', unsubscribe);
```

配置对象发生变化不会自动重建已经创建的 logger、database manager 或其他服务。需要热更新的模块必须订阅并实现自己的 `reconfigure()`；不支持热更新的配置应通过应用重启生效。

`AppConfig` 不负责监听文件，也不暴露 HTTP/IPC 接口。触发 reload 属于 Host 或应用控制面：

```text
file watcher / HTTP API / IPC message
                 │
                 ▼
        app.config.reload()
```

例如 Host 可以通知 child process 配置已变化，child 收到消息后调用 `reload()`；provider 本身只需要在 reload 时能够再次 `read()`。

## 自定义配置来源

一个 provider 只需要提供稳定名称和 `read()`：

```ts
import type { ConfigMap, ConfigProvider } from '@nocobase/config';

const remoteProvider: ConfigProvider = {
  name: 'remote-app-config',
  async read({ signal }) {
    const response = await fetch('https://config.example.com/apps/main', {
      signal,
    });
    if (!response.ok) {
      throw new Error(`Remote config request failed: ${response.status}`);
    }
    return {
      kind: 'map',
      value: (await response.json()) as ConfigMap,
    };
  },
};

config.load(remoteProvider);
```

如果 provider 返回 YAML、JSON 或其他字节内容，则同时传 parser：

```ts
config.load(fileProvider('config.yml'), yamlParser());
```

写配置不属于 `AppConfig` 或只读 provider 协议。需要管理配置的 Host、Hub 或插件应定义独立的 writable backend，再由对应 provider 读取其结果。这样不会强迫文件、数据库和远程 API 使用同一种写入协议。

## 职责边界

`AppConfig` 负责：

- 收集 config definitions；
- 执行 defaults；
- 按顺序读取并合并 providers；
- 应用显式环境变量映射；
- 使用 schema 校验；
- 提供类型化读取、路径读取、reload 和 subscribe。

`AppConfig` 不负责：

- 监听文件变化；
- 暴露 HTTP 或 IPC 管理接口；
- 写回文件、数据库或远程服务；
- 生成配置表单；
- 创建或重建运行时服务；
- 把配置转换成 `URL`、logger、database manager 等运行时对象。

运行时对象由对应模块处理，例如：

```ts
public override register(): void {
  const config = this.app.config.get(loggingConfig);
  this.app.container.singleton(loggingToken, () =>
    createLogging(createRuntimeLoggingConfig(config, this.app.paths)),
  );
}
```

这条边界保证配置文件、schema、`app.config.get()` 和管理端看到的是同一种纯配置数据。

## 相关实现

- `packages/app-server-kit/src/config/`：`AppConfig`、definition 和环境映射入口；
- `packages/app-server-kit/src/core-configs.ts`：标准 App 配置集合；
- `packages/config/`：通用 Config、provider 和 parser 基础库；
- `packages/app-template-default/server/config/index.ts`：Default App 配置来源选择；
- `packages/app-template-default/config.example.yml`：应用配置文件示例。
