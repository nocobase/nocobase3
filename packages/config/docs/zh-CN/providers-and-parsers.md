---
title: 'Provider 与 Parser'
description: '使用 object、environment、file、raw bytes Provider，以及 JSON、YAML、dotenv Parser。'
keywords: 'NocoBase,Config Provider,Config Parser,环境变量,dotenv,YAML'
---

# Provider 与 Parser

## 两类 Provider 结果

Provider 可以返回结构化 map，也可以返回原始 bytes：

```ts
type ConfigProviderResult =
  { kind: 'map'; value: ConfigMap } | { kind: 'bytes'; value: Uint8Array };
```

- map Provider 直接加载，不能传 Parser。
- bytes Provider 必须搭配 Parser。

## Object Provider

配置已经是 JavaScript 对象时使用：

```ts
await config.load(
  objectProvider({
    server: { port: 3000 },
  }),
);
```

也可以把 flat map 展开成嵌套对象：

```ts
await config.load(
  objectProvider(
    {
      'server.host': '127.0.0.1',
      'server.port': 3000,
    },
    { flat: true, delimiter: '.' },
  ),
);
```

## Environment Provider

显式 mapping 可以转换路径和类型：

```ts
await config.load(
  environmentProvider(process.env, {
    mappings: {
      APP_NAME: envString('app.name'),
      APP_PORT: envInteger('server.port'),
      APP_DEBUG: envBoolean('server.debug'),
      DB_SCHEMAS: envStrings('database.schemas'),
    },
  }),
);
```

`envStrings()` 默认按逗号切分，并去除每项两端空格和空项：

```dotenv
DB_SCHEMAS=public, tenant, analytics
```

```ts
['public', 'tenant', 'analytics'];
```

可以指定其他分隔符：

```ts
envStrings('database.schemas', ':');
```

未提供 mappings 时，可以通过 prefix 和双下划线自动生成路径：

```ts
await config.load(
  environmentProvider(process.env, {
    prefix: 'NOCOBASE_',
    keyDelimiter: '__',
  }),
);
```

```dotenv
NOCOBASE_SERVER__HOST=127.0.0.1
NOCOBASE_SERVER__PORT=13010
```

结果为：

```ts
{
  server: {
    host: '127.0.0.1',
    port: '13010',
  },
}
```

自动映射不会猜测类型，`port` 仍然是字符串。需要类型转换时使用显式 mappings。

复杂数组或对象可以自定义 `parse`，但应在 `JSON.parse()` 后进行 Schema 校验：

```ts
environmentProvider(process.env, {
  mappings: {
    DATABASE_CONNECTIONS: {
      path: 'database.connections',
      parse(value) {
        return connectionsSchema.parse(JSON.parse(value));
      },
    },
  },
});
```

## File Provider

File Provider 返回文件 bytes 和文件元数据：

```ts
await config.load(fileProvider('config.json'), jsonParser());
await config.load(fileProvider('config.yaml'), yamlParser());
```

File Provider 不监听文件变化。需要热更新时，由应用监听外部事件并重新构造配置。

## Raw Bytes Provider

已经从 HTTP、IPC、数据库或测试 fixture 得到序列化内容时使用：

```ts
const response = await fetch(configUrl);
const bytes = new Uint8Array(await response.arrayBuffer());

await config.load(rawBytesProvider(bytes, 'remote-config'), jsonParser());
```

如果数据已经是结构化对象，应使用 `objectProvider`，不需要先序列化成 bytes。

## JSON 与 YAML Parser

JSON 和 YAML Parser 都支持 parse 和 serialize：

```ts
const bytes = config.serialize(yamlParser());
```

Parser 输出必须是 object。数组、字符串或数字不能作为配置根节点。

## Dotenv Parser

Dotenv Parser 忠实解析 dotenv 的字符串键值，不负责嵌套结构或类型推断：

```dotenv
APP_PORT=13010
DB_SCHEMAS=public,tenant
SERVER.LOGGING.LEVEL=debug
```

解析结果：

```ts
{
  APP_PORT: '13010',
  DB_SCHEMAS: 'public,tenant',
  'SERVER.LOGGING.LEVEL': 'debug',
}
```

它不会自动把逗号值转成数组，也不会把点号键展开成嵌套对象。需要结构化映射时，优先使用 Environment Provider 的 mappings。

## 自定义 Provider

```ts
import type { ConfigProvider } from '@nocobase/config';

const provider: ConfigProvider = {
  name: 'app-host',

  async read({ signal }) {
    const response = await fetch(configUrl, { signal });
    return {
      kind: 'bytes',
      value: new Uint8Array(await response.arrayBuffer()),
      metadata: {
        revision: response.headers.get('etag') ?? undefined,
      },
    };
  },
};
```

## 自定义 Watch

内置 Provider 都只负责读取。应用可以包装某个 Provider，并自行监听 app-host IPC、消息队列或其他事件：

```ts
const source = fileProvider('config.yaml');

const provider: WatchableConfigProvider = {
  name: source.name,
  read: (context) => source.read(context),

  async watch(listener, { signal }) {
    const handler = (message: unknown): void => {
      if (isConfigChangedMessage(message)) {
        Promise.resolve(listener({ type: 'changed' })).catch(reportError);
      }
    };

    process.on('message', handler);
    signal.addEventListener('abort', () => process.off('message', handler), {
      once: true,
    });
  },
};
```

收到事件后，应用负责重新读取配置。多个 Provider 参与合并时，应按原顺序重建新的 `Config`，避免旧键残留或优先级变化。
