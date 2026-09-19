# @nocobase/db-postgres

PostgreSQL dialect package for `@nocobase/db`.

```ts
import postgres from '@nocobase/db-postgres';
import { createDatabaseManager } from '@nocobase/db';

const database = createDatabaseManager({
  connections: {
    main: postgres({
      host: process.env.DB_HOST,
    }),
  },
});
```

For declarative configurations, register the same factory:

```ts
const database = createDatabaseManager({
  drivers: { postgres },
  connections: {
    main: {
      dialect: 'postgres',
      host: process.env.DB_HOST,
      database: process.env.DB_NAME,
    },
  },
});
```

The factory also exposes `postgres.driver` for code that wants to register the
descriptor directly.
