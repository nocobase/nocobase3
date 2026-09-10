# @nocobase/db-sqlite

Sqlite dialect package for `@nocobase/db`.

```ts
import sqlite from '@nocobase/db-sqlite';
import { createDatabaseManager } from '@nocobase/db';

const database = createDatabaseManager({
  connections: {
    main: sqlite({ filename: './data.sqlite' }),
  },
});
```
