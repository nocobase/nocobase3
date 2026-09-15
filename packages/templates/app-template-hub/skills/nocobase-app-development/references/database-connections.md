# Database connections and dialects

This page is about which database the application talks to: switching it, adding a second one, and what each dialect needs. For schema changes read [migrations and seeds](migrations.md); for reading and writing rows at runtime read [database and data access](database-and-data.md).

An application starts on SQLite, declared in `server/config/database.ts`. Nothing asks which database to use when the project is generated, because the answer is code rather than a setting.

## A dialect is registered in code, not configured

`server/config/database.ts` declares the dialects the application has:

```ts
import sqlite from '@nocobase/db-sqlite';

drivers: { sqlite },
```

A connection may only use a dialect listed there. `config.yml` can change a connection's host, credentials and database name, but it cannot introduce a dialect — the driver is an imported module, and configuration has no way to import one. Setting `dialect: postgres` in `config.yml` without the registration fails at startup:

```
Database dialect "postgres" is not registered.
Install and register the corresponding @nocobase/db-postgres package.
```

The key in `drivers` has to be the dialect name, and it has to match the dialect the package declares. `{ pg: postgres }` is rejected, and so is `{ mysql: postgres }`.

## Switching the default connection

Four steps, PostgreSQL as the example.

**1. Install the dialect package.**

```bash
pnpm add @nocobase/db-postgres
```

It must land in `dependencies`, not `devDependencies`. `pnpm build` generates `dist/package.json` from `dependencies` alone, so a server import declared as a devDependency resolves in development and is missing exactly once — on the deployed server. The native driver comes with the dialect package; there is nothing else to install.

**2. Register it** in `server/config/database.ts`:

```ts
import postgres from '@nocobase/db-postgres';

drivers: { postgres },
```

**3. Point the connection at it,** in the same file. Change `dialect`, and remove the fields that belonged to the old one — SQLite's `filename` in particular, since `config.yml` deep-merges into these defaults rather than replacing them, and a leftover key stays for the life of the application:

```ts
connections: {
  main: {
    dialect: 'postgres',
    schemaManagement: 'managed',
    debug: false,
  },
},
```

**4. Put the host and credentials in `config.yml`,** under `database.connections.main`. Each dialect fills in its own defaults, so only what differs has to be written:

```yaml
database:
  connections:
    main:
      dialect: postgres
      host: db.internal
      database: crm
      username: crm_app
      password: ...
```

Credentials belong here rather than in `server/config/database.ts` because `config.yml` is gitignored and the TypeScript file is not.

## The dialects

| Dialect     | Package                  | Driver           | Default port | Names the database with            | Other defaults                                          |
| ----------- | ------------------------ | ---------------- | ------------ | ---------------------------------- | ------------------------------------------------------- |
| `sqlite`    | `@nocobase/db-sqlite`    | `better-sqlite3` | —            | `database` (file under `storage/`) |                                                         |
| `postgres`  | `@nocobase/db-postgres`  | `pg`             | 5432         | `database`                         | `postgres`, `schema: [public]`, `ssl: false`            |
| `mysql`     | `@nocobase/db-mysql`     | `mysql2`         | 3306         | `database`                         | `root`, `charset: utf8mb4`                              |
| `oracle`    | `@nocobase/db-oracle`    | `oracledb`       | 1521         | `serviceName`                      | `nocobase`, service `FREEPDB1`, Thin mode               |
| `mssql`     | `@nocobase/db-mssql`     | `tedious`        | 1433         | `database`                         | `sa`, `encrypt: false`, `trustServerCertificate: false` |
| `kingbase`  | `@nocobase/db-kingbase`  | `pg`             | 54321        | `database`                         | `nocobase`, `schema: [public]`                          |
| `oceanbase` | `@nocobase/db-oceanbase` | `mysql2`         | 2881         | `database`                         | `root`, `charset: utf8mb4`                              |
| `dameng`    | `@nocobase/db-dameng`    | `dmdb`           | 5236         | `schema`                           | `SYSDBA`; `connectString` replaces host and port        |

MariaDB runs on the `mysql` dialect. MySQL and OceanBase also accept `socketPath` instead of `host` and `port`.

## Native drivers

Two of the drivers install a platform binary: `better-sqlite3` and `oracledb`. The other four are plain JavaScript — `pg`, `mysql2`, `tedious` and `dmdb`, which between them cover PostgreSQL, MySQL, SQL Server, KingbaseES, OceanBase and Dameng. Dameng in particular looks like it should be native and is not.

pnpm 11 runs a dependency's install script only when the package appears under `allowBuilds` in `pnpm-workspace.yaml`, and a package left undecided stops the install outright with `ERR_PNPM_IGNORED_BUILDS`. The generated file already decides both of the drivers that have one, so **switching dialects needs no change there**. A package with an install script that the application adds for its own reasons still does.

`ignore-scripts=true` in an npm configuration is the exception worth knowing: it suppresses install scripts globally and outranks `allowBuilds`, so the addon is not compiled and `pnpm install` reports success anyway. `pnpm rebuild better-sqlite3` is the remedy — re-running `pnpm install` does nothing, because the package is already in the store.

A native addon is compiled for one platform and Node version at a time, so a build made on a Mac installs binaries a Linux server cannot load. `pnpm build --target linux-x64` and the rest of the deployment story are in the README; a forgotten `--target` produces a `dist/` that fails only on the server. On any dialect but SQLite and Oracle the application has no native module at all, and none of this applies.

## Dialects outside the built-in connection types

`@nocobase/db` ships strict connection types for `sqlite`, `postgres`, `mysql`, `oracle` and `mssql`. `kingbase`, `oceanbase` and `dameng` work at runtime — the registration is looked up by name — but their connection objects do not satisfy `AppDatabaseConnectionConfig`, so `pnpm typecheck` rejects them:

```
Type '"kingbase"' is not assignable to type '"mssql"'.
```

Until the type is widened, such a connection needs an assertion, and the comment saying why belongs next to it:

```ts
import kingbase from '@nocobase/db-kingbase';
import type { AppDatabaseConnectionConfig } from '@nocobase/app-server/database';

connections: {
  // @nocobase/db's ConnectionConfig union does not yet include this dialect.
  // The registration below resolves by name at runtime.
  main: {
    dialect: 'kingbase',
    database: 'crm',
  } as unknown as AppDatabaseConnectionConfig,
},
```

## Adding a second connection

A second connection is the same four steps under another name, plus its own migration and seed directories at `database/<connectionName>/`. [Migrations and seeds](migrations.md) covers the directory layout, `autoRun` per connection, `pnpm migrate --connection <name>`, and `schemaManagement: external` for a database another system owns.

One managed connection per physical database or schema. Two connections pointing at the same target are rejected before anything runs, and distinct history table names do not make them independent.

## What switching does not do

It does not move data. A connection pointed at a new database starts from an empty schema, which migrations then build; the rows in the old SQLite file stay there.

So the target database or schema has to exist first — NocoBase creates tables, never the database itself. Once it does, migrations run at startup while `database.connections.main.migrations.autoRun` is `true`, or on demand:

```bash
pnpm migrate
```

## Verify

```bash
pnpm typecheck
pnpm migrate
pnpm dev
```

`pnpm migrate` is the one that proves the connection: it fails with the driver's own error if the host, credentials or database name are wrong, before the application has started.
