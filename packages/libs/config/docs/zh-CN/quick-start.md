---
title: '配置快速开始'
description: '使用默认值、YAML 文件和环境变量构造并读取 NocoBase 配置。'
keywords: 'NocoBase,配置快速开始,YAML,环境变量,Config'
---

# 配置快速开始

## 加载默认值

```ts
import { Config } from '@nocobase/config';
import { objectProvider } from '@nocobase/config/providers/object';

const config = new Config();

await config.load(
  objectProvider({
    server: {
      host: '127.0.0.1',
      port: 3000,
    },
    logging: {
      level: 'info',
    },
  }),
);
```

`objectProvider` 接收已经结构化的 JavaScript 对象，不需要 Parser。

## 加载 YAML 文件

```ts
import { yamlParser } from '@nocobase/config/parsers/yaml';
import { fileProvider } from '@nocobase/config/providers/file';

await config.load(fileProvider('/etc/nocobase/config.yaml'), yamlParser());
```

`fileProvider` 只读取文件字节，文件格式由 `yamlParser()` 决定。配置包不会根据扩展名自动选择 Parser。

配置文件路径应由应用决定，通常采用下面的优先级：

```text
--config 命令行参数
> NOCOBASE_CONFIG_FILE 环境变量
> 应用约定的默认路径
```

## 加载环境变量

正式应用推荐显式声明环境变量与配置路径的映射：

```ts
import {
  environmentProvider,
  envBoolean,
  envInteger,
  envString,
  envStrings,
} from '@nocobase/config/providers/env';

await config.load(
  environmentProvider(process.env, {
    mappings: {
      APP_HOST: envString('server.host'),
      APP_PORT: envInteger('server.port'),
      APP_DEBUG: envBoolean('server.debug'),
      DB_SCHEMAS: envStrings('database.schemas'),
    },
  }),
);
```

例如：

```dotenv
APP_HOST=0.0.0.0
APP_PORT=13010
APP_DEBUG=true
DB_SCHEMAS=public,tenant
```

会生成：

```ts
{
  server: {
    host: '0.0.0.0',
    port: 13010,
    debug: true,
  },
  database: {
    schemas: ['public', 'tenant'],
  },
}
```

## 读取配置

```ts
config.get('server');
config.string('server.host');
config.integer('server.port');
config.float('limits.rate');
config.boolean('server.debug');
config.strings('database.schemas');
config.duration('cache.ttl');
```

`duration()` 返回毫秒，支持 `ms`、`s`、`m`、`h` 和 `d`：

```ts
const config = new Config({}, { cache: { ttl: '30s' } });
config.duration('cache.ttl'); // 30000
```

键不存在时 typed getter 返回 `undefined`；键存在但类型错误时抛出 `ConfigTypeError`。

## 解码成应用配置

核心包不依赖 Zod 或其他 Schema 库。应用可以提供自己的 Decoder：

```ts
interface AppConfig {
  server: {
    host: string;
    port: number;
  };
}

const appConfig = config.parse<AppConfig>({
  decode(value): AppConfig {
    return appConfigSchema.parse(value);
  },
});
```

## 自定义路径分隔符

默认使用 `.` 表示嵌套路径：

```ts
config.integer('server.http.port');
```

如果键本身包含点号，可以改用其他 delimiter：

```ts
const config = new Config({ delimiter: '::' });

await config.load(
  objectProvider({
    labels: {
      'nocobase.io/name': 'main',
    },
  }),
);

config.string('labels::nocobase.io/name');
```
