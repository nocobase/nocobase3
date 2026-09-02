# Migrations and seeds

Migrations under `database/migrations/` are the application's schema history. Seeds under `database/seeds/` insert records the application requires to run.

Migrations create structure. Seeds never do.

## Writing a migration

Name the file with a sortable timestamp prefix. The exported `name` must match the filename:

```ts
// database/migrations/202609020001_create_orders.ts
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

This applies pending migrations from this application and from every registered plugin, ordered by name across all sources. Migrations also run on startup while `database.migrations.autoRun` is `true` in `config.yml`.

`pnpm server:config` prints the resolved migration directory and which plugins contribute their own.

## Seeds

Seeds are for records the application cannot run without — a default configuration row, a fixed system record. Not demo data, and not test fixtures.

```ts
// database/seeds/202609020002_seed_order_statuses.ts
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
