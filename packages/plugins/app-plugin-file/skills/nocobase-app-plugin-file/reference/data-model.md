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
Make the standard fields non-null, use an unsigned `size`, and default `public`
to `false`.

## One-to-one

Put the owner foreign key on the file table and make it unique. The business
table owns the inverse logical relation. In addition to the standard fields:

```ts
collection.integer('profileId').unsigned().notNull();
collection.unique('profileId', { name: 'uq_<table>_profile' });
collection
  .belongsTo('profile', 'profiles', { index: false })
  .foreignKey('profileId')
  .targetKey('id')
  .constraints(true)
  .onDelete('cascade');
```

Also register the inverse `hasOne` relation on the business table. The unique
owner constraint is the durable one-to-one guarantee. Relation names are
logical metadata; `profileId` is the explicit physical foreign-key field.

## One-to-many

Put an indexed owner foreign key on the file table and leave it non-unique:

```ts
collection.integer('orderId').unsigned().notNull();
collection.index('orderId', { name: 'idx_<table>_order' });
collection
  .belongsTo('order', 'orders', { index: false })
  .foreignKey('orderId')
  .targetKey('id')
  .constraints(true)
  .onDelete('cascade');
```

Also register the inverse `hasMany` relation on the business table. Multiple
rows may point to one order; the index makes scoped list/find/delete queries
predictable.

Write every standard field and reverse operation explicitly in the migration;
do not import a live collection definition or schema helper.

## Constraints and scope

Build the standard Route with a hard-coded table and a scope resolver that
reads only a validated server Route parameter. Use the assembly pattern in
[quick start](quick-start.md).

The Store must apply every scope equality to list, find, create, and remove.
Find and remove must combine the file ID and scope in the same database
operation. Never fall back to an unscoped query. Never accept table names,
scope field names, disk, key, or raw SQL from a browser request.

The Store is not an authorization layer. The business Route must authenticate
and call the existing authorization system before management operations.
DatabaseManager stays on the server; it is not exposed to browser code.

See [quick start](quick-start.md) for the Route and client assembly pattern.
