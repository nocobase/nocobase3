# @nocobase/db-mssql

Mssql dialect package for `@nocobase/db`.

```ts
import mssql from '@nocobase/db-mssql';
import { createDatabaseManager } from '@nocobase/db';

const database = createDatabaseManager({
  connections: {
    main: mssql({
      host: process.env.DB_HOST,
      database: process.env.DB_NAME,
      username: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
    }),
  },
});
```

For declarative configurations, register `mssql` in `drivers`:

```ts
const database = createDatabaseManager({
  drivers: { mssql },
  connections: {
    main: { dialect: 'mssql', host: process.env.DB_HOST },
  },
});
```
