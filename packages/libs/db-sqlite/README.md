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

For declarative configurations, register `sqlite` in `drivers`:

```ts
const database = createDatabaseManager({
  drivers: { sqlite },
  connections: {
    main: { dialect: 'sqlite', filename: './data.sqlite' },
  },
});
```
