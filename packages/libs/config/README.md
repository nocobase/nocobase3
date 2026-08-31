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
