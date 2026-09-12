# @nocobase/db-oceanbase-mysql

OceanBase MySQL-compatible dialect package for `@nocobase/db`.

```ts
import oceanbaseMysql from '@nocobase/db-oceanbase-mysql';
import { createDatabaseManager } from '@nocobase/db';

const database = createDatabaseManager({
  connections: {
    main: oceanbaseMysql({
      host: process.env.DB_HOST,
      port: 2881,
      database: process.env.DB_NAME,
      username: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
    }),
  },
});
```

This package targets an OceanBase tenant created in MySQL compatibility mode.
It uses the `mysql2` protocol driver and Knex's MySQL client while keeping the
database dialect identity as `oceanbase-mysql`.
