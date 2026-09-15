---
'@nocobase/app-server': minor
---

Let `AppDatabaseConfig` accept a connection shape from a dialect package it does not know about.

`@nocobase/db` split its dialects into packages and added `ExtensibleDatabaseConfig<TConnection>` for exactly this, with an overload on `createDatabaseManager` and a compile-time contract test. `AppDatabaseConfig` was left extending the closed `DatabaseConfig`, so an application could register `@nocobase/db-kingbase`, `@nocobase/db-oceanbase` or `@nocobase/db-dameng` and watch it work at runtime while `pnpm typecheck` rejected the configuration: `Type '"kingbase"' is not assignable to type '"mssql"'`.

`AppDatabaseConfig` and `AppDatabaseConnectionConfig` now take the same type parameter, defaulting to the dialects `@nocobase/db` declares. Every existing configuration is unchanged — the bare form still means what it meant — and an application on a contributed dialect names its shape instead of reaching for an assertion:

```ts
type KingbaseConnection = KingbaseOptions & { dialect: 'kingbase' };

const database: AppConfigFactory<
  AppDatabaseConfig<ConnectionConfig | KingbaseConnection>
> = defineAppConfig(() => ({ drivers: { kingbase }, ... }));
```

Widening applies to the named shape alone: a dialect nobody named is still rejected, `sqlite` still requires `filename`, and `serviceName` on a `postgres` connection is still an error. `AppConnectionShape` is exported for annotating code generic over a connection.
