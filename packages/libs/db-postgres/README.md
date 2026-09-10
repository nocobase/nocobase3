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

The factory also exposes `postgres.driver` for declarative configurations.
