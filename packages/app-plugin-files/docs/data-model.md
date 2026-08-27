# Data model

File capability is a relation between a business record and a standard file
record. A global `files` table is optional; a module may own a table such as
`profileAvatars` or `orderAttachments`.

## Standard fields

Every standard file table stores these stable values:

| Field       | Suggested database type | Purpose                                          |
| ----------- | ----------------------- | ------------------------------------------------ |
| `id`        | `string(64)`            | Server-generated file record ID                  |
| `disk`      | `string(64)`            | Configured Drive disk name                       |
| `key`       | `string(512)`           | UUID-based object key; never the user basename   |
| `filename`  | `string(255)`           | Sanitized Unicode user-visible name              |
| `mimeType`  | `string(255)`           | Content type supplied to storage                 |
| `size`      | `bigInt`                | Byte count; the API converts it to a safe number |
| `public`    | `boolean`               | Whether content can be read without a Token      |
| `createdAt` | `datetime`              | Record creation time                             |
| `updatedAt` | `datetime`              | Record update time                               |

Use `PRIMARY KEY (id)` and `UNIQUE (disk, key)` in every table. Do not store a
final URL or a Token. A URL depends on the mounted app base path and a Private
URL expires; every content request must still resolve the current record.

## One-to-one

Put the owner foreign key on the file table and make it unique. The business
table owns the inverse logical relation:

```ts
await builder.createCollection('profiles', (table) => {
  table.increments('id');
  table.string('name', { length: 255 }).notNull();
  table.hasOne('avatar', 'profileAvatars').foreignKey('profileId');
});

await builder.createCollection('profileAvatars', (table) => {
  addStandardFileFields(table);
  table
    .belongsTo('profile', 'profiles')
    .foreignKey('profileId')
    .foreignKeyType('integer')
    .constraints(true)
    .unique();
  table.primary('id');
  table.unique(['disk', 'key']);
});
```

The unique owner constraint is the durable one-to-one guarantee. The Route
should also set `maxFiles: 1` so the API rejects a second record atomically and
compensates any preceding object write. Relation names (`avatar`, `profile`) are logical
metadata; `profileId` is the explicit physical foreign-key field.

## One-to-many

Put an indexed owner foreign key on the file table and leave it non-unique:

```ts
await builder.createCollection('orders', (table) => {
  table.increments('id');
  table.string('number', { length: 64 }).notNull();
  table.hasMany('attachments', 'orderAttachments').foreignKey('orderId');
});

await builder.createCollection('orderAttachments', (table) => {
  addStandardFileFields(table);
  table
    .belongsTo('order', 'orders')
    .foreignKey('orderId')
    .foreignKeyType('integer')
    .constraints(true)
    .index();
  table.primary('id');
  table.unique(['disk', 'key']);
});
```

Multiple rows may point to one order. The Route's `maxFiles` is the business
limit; the database index makes scoped list/find/delete queries predictable.

In real migrations, write each standard field explicitly rather than relying
on an untracked helper. The snippets use `addStandardFileFields(table)` only
to keep the relation examples short.

## Constraints and scope

Use the current app-database builder with logical collection and field names:

- `belongsTo(...).foreignKey(...).foreignKeyType(...).constraints(true)` for
  the owner-side database constraint;
- `hasOne` or `hasMany` for inverse relation metadata;
- `unique(['disk', 'key'])` for object identity;
- `unique('ownerId')` for one-to-one;
- `index('ownerId')` for one-to-many.

Build the Store with a hard-coded table and a scope resolver that reads only a
validated server Route parameter:

```ts
const store = files.createDatabaseStore({
  table: 'orderAttachments',
  scope: (context) => {
    const raw = context.req.param('orderId');
    const orderId = Number(raw);
    if (!raw || !Number.isSafeInteger(orderId) || orderId < 1) {
      throw new TypeError('A valid orderId is required.');
    }
    return { orderId };
  },
});
```

The Store must apply every scope equality to list, find, create, and remove.
Find and remove must combine the file ID and scope in the same database
operation. Never fall back to an unscoped query. Never accept table names,
scope field names, disk, key, or raw SQL from a browser request.

The Store is not an authorization layer. The business Route must authenticate
and call the existing authorization system before management operations.
DatabaseManager stays on the server; it is not exposed to browser code.

See [one-to-one](recipes/one-to-one.md) and [one-to-many](recipes/one-to-many.md)
for complete small migrations and acceptance tests.
