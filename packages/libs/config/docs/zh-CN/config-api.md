---
title: 'Config API'
description: '查询、修改、合并、截取、复制、解码和序列化配置。'
keywords: 'NocoBase,Config API,配置合并,delimiter,strictMerge'
---

# Config API

## 构造配置

```ts
const config = new Config(
  {
    delimiter: '.',
    strictMerge: false,
  },
  {
    server: { port: 3000 },
  },
);
```

第二个参数是可选的初始配置。应用也可以通过 `objectProvider` 加载默认值。

## `load()`

```ts
await config.load(provider);
await config.load(bytesProvider, parser);
await config.load(provider, undefined, {
  mountAt: 'plugins.authorization',
});
```

`mountAt` 把 Provider 的完整结果挂到指定路径下。

每次加载也可以指定自定义合并函数：

```ts
await config.load(provider, undefined, {
  merge({ source, destination }) {
    return customMerge(destination, source);
  },
});
```

## 查询

| 方法            | 返回值                     |
| --------------- | -------------------------- |
| `get(path)`     | `ConfigValue \| undefined` |
| `has(path)`     | 路径是否存在               |
| `keys()`        | 所有嵌套层级的排序路径     |
| `mapKeys(path)` | 指定 object 的直接子键     |
| `raw()`         | 完整嵌套配置副本           |
| `all()`         | flat path 到 value 的映射  |

`get()`、`raw()` 和 `all()` 返回副本。修改返回值不会反向修改 Config。

```ts
const server = config.get('server');
const keys = config.mapKeys('server');
const raw = config.raw();
```

## Typed getter

| 方法             | 接受的配置值             |
| ---------------- | ------------------------ |
| `string(path)`   | string                   |
| `integer(path)`  | 整数 number              |
| `float(path)`    | number                   |
| `boolean(path)`  | boolean                  |
| `strings(path)`  | string array             |
| `duration(path)` | 非负毫秒数或带单位字符串 |

这些方法不做宽松转换。例如字符串 `'3000'` 不能通过 `integer()` 读取，应由 Env mapping 或 Parser 前置转换。

## 修改

```ts
config.set('server.port', 4000);
config.delete('server.host');
```

删除后，空的父 object 会一并清理。空路径传给 `delete('')` 会清空全部配置。

配置值只能是：

- string
- finite number
- boolean
- `null`
- 上述值组成的数组
- 普通 object

Date、class instance、function、`undefined` 和非有限数字不能作为配置值。`__proto__`、`prototype`、`constructor` 路径会被拒绝。

## 合并、截取与复制

```ts
const logging = new Config({}, { level: 'debug' });

config.merge(logging);
config.mergeAt(logging, 'logging');

const loggingConfig = config.cut('logging');
const copiedConfig = config.copy();
```

- `merge()` 把另一份 Config 合并到根节点。
- `mergeAt()` 把另一份 Config 挂载并合并到指定路径。
- `cut()` 返回从指定 object 路径截取的新 Config。
- `copy()` 返回完整独立副本。

## 解码与序列化

```ts
const appConfig = config.parse(appConfigDecoder);
const databaseConfig = config.parse(databaseConfigDecoder, 'database');

const json = config.serialize(jsonParser());
const yaml = config.serialize(yamlParser());
```

Decoder 由应用实现，适合连接 Zod、Valibot 或其他 Schema 工具。Parser 的 `serialize()` 用于把完整配置写成对应格式。

## 手动热更新

配置包不自动监听和重载。应用可以复用 Provider，并在收到外部变更通知时创建新 Config：

```ts
const defaults = objectProvider(defaultConfig);
const file = fileProvider(configFile);
const environment = environmentProvider(process.env, envOptions);

async function loadConfig(): Promise<Config> {
  const next = new Config();
  await next.load(defaults);
  await next.load(file, yamlParser());
  await next.load(environment);
  return next;
}

let currentConfig = await loadConfig();

async function reload(): Promise<void> {
  const next = await loadConfig();
  appConfigSchema.parse(next.raw());
  currentConfig = next;
}
```

应整体替换 Config 引用，不要在旧 Config 上重复加载发生变化的单个 Provider，否则被删除的旧键可能残留，Provider 优先级也可能改变。
