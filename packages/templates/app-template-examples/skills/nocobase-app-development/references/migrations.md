# Migrations and seeds

Migrations under `database/main/migrations/` are the application's schema history. Seeds under `database/main/seeds/` insert records the application requires to run.

Migrations create structure. Seeds never do.

`database/tsconfig.json` extends the server configuration so editor tooling and ESLint recognize migrations and seeds as Node source. Keep it in place when adding connection directories.

## Writing a migration

Name the file with a sortable timestamp prefix. The exported `name` must match the filename:

```ts
// database/main/migrations/202609020001_create_orders.ts
import { defineMigration, type MigrationDefinition } from '@nocobase/db';

const migration: MigrationDefinition = defineMigration({
  name: '202609020001_create_orders',

  async up({ builder }) {
    await builder.createCollection('orders', (collection) => {
      collection.increments('id');
      collection.string('reference', { length: 64, nullable: false });
      collection.string('status', { length: 32, nullable: false });
      collection.datetime('createdAt', { nullable: false });
      collection.unique('reference');
      collection.index('status');
    });
  },

  async down({ builder }) {
    await builder.dropCollection('orders');
  },
});

export default migration;
```

## A migration is immutable and self-contained

**Spell out the exact structure.** Declare every field, index, and constraint in the migration itself.

**Never import an evolving definition into a migration** — not a collection schema, not a model, not a registry, not a constant shared with runtime code. Those keep changing, and a migration that reads one silently means something different after it has already been applied. This is the rule that matters most on this page.

**Once the branch that introduced a migration is merged, never edit it.** Check with `git log -- <file>` if you are unsure. Before the merge you may correct it in place; after, every change is a new migration. Never hard-code a previous checksum to make an edited migration look untouched.

Write `down` as the explicit reverse in a safe dependency order. If an operation truly cannot be reversed, say so in the migration and in its test rather than writing a `down` that quietly does nothing.

## Field builders

`increments`, `integer`, `bigInt`, `string`, `text`, `boolean`, `decimal`, `datetime`, `json`, `blob`, `uuid`, and `native` for a dialect-specific type. Options include `nullable`, `length`, `defaultValue`, `precision`, and `scale`.

Relations: `belongsTo`, `hasOne`, `hasMany`, `belongsToMany`. Constraints and indexes: `primary`, `unique`, `foreignKey`, `index`.

## Changing an existing table

Use explicit alter operations rather than dropping and recreating:

```ts
async up({ builder }) {
  await builder.alterCollection('orders', (collection) => {
    collection.string('customerReference', { length: 64, nullable: true });
    collection.index('customerReference');
  });
},

async down({ builder }) {
  await builder.alterCollection('orders', (collection) => {
    collection.dropField('customerReference');
  });
},
```

Dropping the field also drops the index on it, so `down` does not name that index. It could not anyway: index names are generated, not the string you passed to `index()`.

Adding a non-nullable column to a populated table needs a default, or three migrations: add nullable, backfill, then tighten.

## Logical names, physical names

You write logical names and the naming strategy derives the physical ones: a `customerReference` field becomes a `customer_reference` column, and `index('status')` on `orders` becomes `idx_orders_status`. Field and collection names in migrations stay camelCase — the snake_case conversion is automatic.

Runtime queries keep using the camelCase names, because the query builder converts them the same way — see [database and data access](database-and-data.md). The one place the physical name is required is a generated index or constraint name: `dropIndex` takes `idx_orders_status`, not `status`.

Set `tableName` or `columnName` explicitly when you need to override the derivation.

## Running

```bash
pnpm migrate
```

This applies pending migrations for `database.default`, including registered plugins, ordered by name across all sources. The template defaults to `main`. Plugin migrations, seeds and runtime default reads/writes always use this same connection; changing `database.default` changes the application system database.

## Multiple connections

Use `database/<connectionName>/migrations` and `database/<connectionName>/seeds`. Each name must match a configured connection and contain only letters, digits, underscores or hyphens. Directories do not register connections. A connection without application-owned database source needs no empty directory.

Configure `connections.<name>.migrations` and `.seeds` in the database section. Each accepts `autoRun`, `directory` or `sources`, `packageName`, `tableName`, `lockTableName`, and `extensions`. Explicit paths resolve relative to the application root and must exist when executed. Without an explicit path the application resolves the per-connection directory under its runtime database directory, including `dist/database` after compilation. Custom sources replace the application's conventional source; registered plugin sources are still added only on the default connection.

The default connection runs migrations and seeds automatically unless disabled; other connections default to `autoRun: false`. Startup runs the default connection first, then other names in stable ascending order, migrations before seeds within each connection. A failure stops startup; completed database changes remain committed. No cross-connection transaction or rollback is provided.

```bash
pnpm migrate --connection analytics
pnpm seed --connection analytics
pnpm migrate --all --json
pnpm seed --all --json
```

Manual execution ignores `autoRun`. `--connection` and `--all` are mutually exclusive. `--all` uses the same connection order and stops at the first failure. Its JSON result includes completed, skipped, failed and not-run entries; failures exit nonzero. Single-connection JSON retains `status`, `batch` (migrations), `executed`, and `skipped`, with an added `connection` field.

`schemaManagement: external` describes ownership, not read-only credentials. Startup and `--all` skip external connections; explicitly targeting one for migrations or seeds is an error. Runtime access still requires an explicit metadata store. Seeds also use history and lock tables, so they are not a workaround for external schema ownership.

Use one managed connection per physical database/schema. Identical configured targets are rejected before execution, even when only one is selected. Hostname aliases, symlinks and driver-specific routing can hide a shared target; do not configure these as independent managed databases. Distinct history or lock table names alone do not isolate collection metadata and schema ownership.

## Existing applications

Old top-level `database.migrations` and `database.seeds` remain accepted and apply only to the current default connection, never automatically to `main`. Legacy fields override matching per-connection fields, including existing `DB_MIGRATIONS_*` / `DB_SEEDS_*` environment settings. Connection environment variables such as `DB_DATABASE` retain their existing `main` mapping. Prefer the new connection settings for new configuration; remove old overrides when adopting them.

Different explicit old/new directories, two explicit source arrays, or a combined directory and source array are configuration errors. Without an explicit source, the default connection falls back to `database/migrations` or `database/seeds` when present. If both old and new conventional directories exist, execution fails until you select one explicitly. Non-default connections never use the legacy directory.

No command moves source files or rewrites history. When moving a directory, preserve the target database, package identity, filenames, exported names, file contents and history/lock table configuration. Do not copy already-applied migrations to another database as an upgrade. Verify a repeat run executes nothing. An explicitly configured source missing from a release is an error; an absent conventional source is permitted for applications with no owned tasks. Verify release packaging separately to catch accidental omission of conventional sources.

Checksums are based on file contents. Moving unchanged files preserves them; compiling TypeScript into different JavaScript is not guaranteed to preserve an existing development database's checksums. Verify upgrades against the same execution artifact format, and never rewrite checksums to bypass a mismatch.

`pnpm server:inspect --json` lists the plugins that contribute migrations.

## Seeds

Seeds are for records the application cannot run without — a default configuration row, a fixed system record. Not demo data, and not test fixtures.

```ts
// database/main/seeds/202609020002_seed_order_statuses.ts
import { defineSeed, type SeedDefinition } from '@nocobase/db';

const seed: SeedDefinition = defineSeed({
  name: '202609020002_seed_order_statuses',

  async run({ query }) {
    await query
      .insertInto('orderStatuses')
      .values([{ key: 'open', label: 'Open' }])
      .execute();
  },
});

export default seed;
```

Run with `pnpm seed`. The structure a seed writes into must already exist from an earlier migration.

Keep seed data fixed and reproducible — no current timestamps or random values in identifying fields. Decide explicitly what a repeat run does: skip on a unique key, or update deterministically. Never silently overwrite data a user has edited.

## Testing

Run migrations against a real test database and verify the resulting schema. A test that only imports the file proves nothing.

Check that `up` produces the expected tables, columns, types, indexes, and constraints; that `down` cleans up when the migration is reversible; and that a seed behaves correctly on a first run, against existing data, and when run twice.

## Verify

- The filename and exported `name` match, and the prefix sorts correctly.
- The migration imports no evolving definition.
- `down` reverses `up` in a safe order.
- `pnpm migrate` applies cleanly on an empty database and on an already-migrated one.
- The physical schema matches what the migration declared.
