# Database examples

The files in `migrations/` and `seeds/` end in `.ts.example`, so NocoBase does
not load or execute them.

To enable an example, remove only the final `.example` suffix:

```text
__NOCOBASE_MIGRATION_NAME__.ts.example
__NOCOBASE_MIGRATION_NAME__.ts

__NOCOBASE_SEED_NAME__.ts.example
__NOCOBASE_SEED_NAME__.ts
```

The exported `name` must match the filename without the executable extension.
If you rename an enabled `.ts` file, update its `name` as well.

Then declare only the enabled directories in `server/plugin.ts`. For example,
when both examples are enabled, add:

```ts
database: {
  migrations: './database/migrations',
  seeds: './database/seeds',
},
```

The default server plugin does not declare these directories because disabled
`.ts.example` files are not emitted into the published package.
