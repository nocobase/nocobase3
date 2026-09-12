---
title: '配置概览'
description: '了解 @nocobase/config 的配置容器、Provider、Parser、合并顺序和职责边界。'
keywords: 'NocoBase,配置,Config,Provider,Parser,koanf'
---

# 配置概览

`@nocobase/config` 是一个受 koanf 启发的 Node.js 配置包。它把“从哪里读取配置”和“如何解析配置格式”拆成两个独立概念：

- Provider 从对象、环境变量、文件或内存字节中读取配置。
- Parser 把 JSON、YAML、dotenv 等序列化内容转换成配置对象。
- `Config` 按 `load()` 调用顺序合并配置，并提供路径查询、修改、截取和序列化能力。

```text
Object Provider ───────────────────┐
Environment Provider ──────────────┤
File Provider ── JSON/YAML Parser ─┤──> Config
Raw Bytes Provider ─────── Parser ─┘
```

## 基本用法

```ts
import { Config } from '@nocobase/config';
import { yamlParser } from '@nocobase/config/parsers/yaml';
import { environmentProvider } from '@nocobase/config/providers/env';
import { fileProvider } from '@nocobase/config/providers/file';
import { objectProvider } from '@nocobase/config/providers/object';

const config = new Config();

await config.load(
  objectProvider({
    server: { host: '127.0.0.1', port: 3000 },
  }),
);
await config.load(fileProvider('config.yaml'), yamlParser());
await config.load(environmentProvider(process.env, { prefix: 'NOCOBASE_' }));

const host = config.string('server.host');
const port = config.integer('server.port');
```

后加载的 Provider 优先级更高。上例的顺序是：

```text
代码默认值 < config.yaml < 环境变量
```

配置包不规定固定的文件、环境变量或命令行优先级，由应用决定加载顺序。

## 合并规则

- object 与 object 递归合并。
- 数组整体替换，不做追加或按下标合并。
- string、number、boolean 和 `null` 由后加载值覆盖。
- 配置键大小写敏感。

```ts
const config = new Config();

await config.load(
  objectProvider({
    server: { host: '127.0.0.1', port: 3000 },
    transports: ['console'],
  }),
);
await config.load(
  objectProvider({
    server: { port: 4000 },
    transports: ['file'],
  }),
);
```

最终结果：

```ts
{
  server: { host: '127.0.0.1', port: 4000 },
  transports: ['file'],
}
```

启用严格合并后，不允许已有值被不同类型覆盖：

```ts
const config = new Config({ strictMerge: true });
```

## 职责边界

配置包不负责：

- 选择应用配置文件路径；
- 读取命令行参数；
- 规定配置源优先级；
- 监听文件变化；
- 自动重新加载配置；
- 定义应用配置 Schema；
- 修改已根据旧配置创建的 logger、database 等运行时对象。

这些行为由应用或 app-host 编排。Provider 只负责读取数据，Parser 只负责格式转换。

## 下一步

- [快速开始](./quick-start.md)
- [Provider 与 Parser](./providers-and-parsers.md)
- [Config API](./config-api.md)
