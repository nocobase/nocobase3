# @nocobase/db-mysql

Mysql dialect package for `@nocobase/db`.

```ts
import mysql from '@nocobase/db-mysql';
import { createDatabaseManager } from '@nocobase/db';

const database = createDatabaseManager({
  connections: {
    main: mysql({
      host: process.env.DB_HOST,
      database: process.env.DB_NAME,
      username: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
    }),
  },
});
```
