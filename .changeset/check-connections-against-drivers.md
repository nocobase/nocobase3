---
'@nocobase/db': minor
'@nocobase/app-server': minor
'@nocobase/app-template-default': patch
'@nocobase/app-template-examples': patch
'@nocobase/app-template-hub': patch
---

Check an application's database connections against the drivers it registers.

A connection may only use a dialect the application registered — a driver is looked up by the connection's own dialect, and a missing one fails the start with `Database dialect "postgres" is not registered.`. Nothing said so while the configuration was being written, so the first sign was an application that would not boot.

`defineDatabaseConfig` in `@nocobase/app-server/database` takes the drivers and returns the factory:

```ts
const database: AppConfigFactory<AppDatabaseConfig> = defineDatabaseConfig({ sqlite })(
  (runtime) => ({
    default: 'main',
    connections: {
      main: { dialect: 'sqlite', filename: runtime.configPaths.storage('app.sqlite') },
    },
  }),
);
```

An unregistered dialect is now `Type '"postgres"' is not assignable to type '"sqlite"'`, and because each connection resolves to its own dialect's type rather than to a union, a mistyped key gets TypeScript's own diagnostic: `'fileName' does not exist in type 'AppDatabaseConnectionConfig<SqliteConnectionConfig>'. Did you mean to write 'filename'?`

The drivers are taken in a call of their own rather than declared inside the factory, and the shape is load-bearing rather than stylistic. TypeScript infers from arguments and not from a function's return type, so drivers declared inside the factory are never resolved and every connection is accepted; passing them alongside it is no better, because the connection type stays a deferred conditional that cannot contextually type the literal and each `dialect` widens to `string`. Binding them first makes the second call's parameter concrete, which is also what restores the excess-property check.

The type parameter stays in the parameter position and never reaches the return type, so an application keeps annotating with plain `AppConfigFactory<AppDatabaseConfig>` and `isolatedDeclarations` has nothing to infer.

`@nocobase/db` exports `ConnectionsOfDrivers` and `ConnectionOfRegistration` for this. A factory is matched by its `driver` property rather than by `DatabaseDriverFactory`: a factory narrows its own options — `(options?: SqliteOptions)` — which under contravariance does not satisfy that interface's call signature, so matching against it fell through and resolved every dialect to the default.

The three templates use the new helper. `defineAppConfig` still accepts a database configuration, so an application on the previous shape keeps working without the checking.
