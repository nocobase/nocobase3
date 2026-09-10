# @nocobase/db-oracle

Oracle dialect package for `@nocobase/db`.

```ts
import oracle from '@nocobase/db-oracle';
import { createDatabaseManager } from '@nocobase/db';

const database = createDatabaseManager({
  connections: {
    main: oracle({
      host: process.env.DB_HOST,
      serviceName: process.env.DB_SERVICE_NAME ?? 'FREEPDB1',
      username: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
    }),
  },
});
```
