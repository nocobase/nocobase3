# @nocobase/db-kingbase-postgres

KingbaseES dialect for `@nocobase/db` using Kingbase's PostgreSQL-compatible
mode (`DB_MODE=pg`) and the `pg` Node.js driver.

```ts
import kingbasePostgres from '@nocobase/db-kingbase-postgres';
import { createDatabaseManager } from '@nocobase/db';

const database = createDatabaseManager({
  connections: {
    main: kingbasePostgres({
      host: process.env.DB_HOST,
      port: 54321,
      database: process.env.DB_NAME,
      username: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
    }),
  },
});
```

The package has its own `kingbase-postgres` dialect identity. It reuses the
PostgreSQL-compatible SQL and schema inspection paths where the Kingbase mode
is compatible, while keeping room for Kingbase-specific behavior as the
integration suite discovers it.
