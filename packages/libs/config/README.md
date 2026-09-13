# @nocobase/config

Composable configuration for Node.js applications, inspired by koanf. The
package keeps providers independent from parsers and merges sources in load
order. Applications own configuration lifecycle and hot-reload behavior.

```ts
import { Config } from '@nocobase/config';
import { objectProvider } from '@nocobase/config/providers/object';

const config = new Config();
await config.load(objectProvider({ port: 3000 }));
console.log(config.integer('port'));
```

## TypeScript defaults and YAML

`objectProvider` accepts code configuration, including callbacks and class instances. Plain objects and arrays are copied; functions and non-plain objects retain their references. Ordinary objects merge recursively, while arrays and callbacks are replaced by later sources.

Use `yamlParser()` from `@nocobase/config/parsers/yaml` with `fileProvider` for deployment settings. An absent optional file contributes an empty map. A parser is applied only when a provider returns bytes. Keep code values in TypeScript rather than serializing them into deployment files.
