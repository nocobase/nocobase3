---
title: Enum fields
description: Declare string enum members, use exact filters and strict mutations, and manage additive member changes without silently rewriting stored data.
---

# Enum fields

Enum fields store one stable string member, not a numeric ordinal or a UI label.

```ts
c.enum('status', {
  values: ['draft', 'published', 'archived'],
})
  .notNull()
  .defaultTo('draft');

c.field({
  name: 'visibility',
  type: 'enum',
  values: ['public', 'private'],
  nullable: true,
});
```

Declare 1–256 distinct, non-empty, well-formed strings, each at most 255 UTF-16 units and without NUL. Members match exactly; case, whitespace, quotes, and commas are not normalized. Labels, colors, and localization belong outside the database member identity. `values` is invalid on other scalar field types.

## Storage and metadata

| Database   | Default physical storage                           |
| ---------- | -------------------------------------------------- |
| PostgreSQL | `VARCHAR(255)`                                     |
| MySQL      | `VARCHAR(255)`, using the configured character set |
| SQLite     | `VARCHAR(255)`, TEXT affinity                      |
| Oracle     | `VARCHAR2(255 CHAR)`                               |
| SQL Server | `NVARCHAR(255)`                                    |

An explicit `length` from 1 to 255 must accommodate every member. Native type overrides and native ENUM adoption are not supported in V1. Database encoding and physical capacities still apply; Repository does not change connection character sets.

SQLite retains a VARCHAR length declaration so Inspector can recover a requested shorter capacity; it still uses TEXT affinity, not native length enforcement. Domain validation remains application-owned.

Inspector reports physical strings/text, not a guessed enum. Metadata persists both `type: 'enum'` and `values`. Resolver requires compatible storage and capacity. Supported external string columns can receive enum metadata, but metadata changes do not audit or repair existing rows. Oracle LOB/BYTE-backed external enum storage is not supported in V1.

## Values and queries

```ts
await articles.createOne({ values: { code: 'A', status: 'draft' } });

await articles.updateOne({
  filter: { code: 'A' },
  values: (v) => ({ status: v.variable('$status') }),
  context: { status: 'published' },
  select: (s) => s.fields('status'),
});

await articles.findMany({
  filter: (f) =>
    f.or([f.string('status').eq('draft'), f.string('status').eq('published')]),
  select: (s) => s.fields('code', 'status'),
});
```

Only declared members and nullable SQL NULL are accepted. Unknown literals or variables raise `INVALID_MUTATION`; invalid filter operands raise `INVALID_FILTER`. Invalid stored members raise `INVALID_STORED_VALUE` when read, including nested projections and streamed rows. Do not stringify numbers or silently replace invalid members with NULL.

Use equality shorthand or the string Filter Builder's `eq`, `ne`, `empty`, and `notEmpty`. `empty` means SQL NULL, not an empty string. Compose `or` for membership and `and` for exclusion; ordinary SQL NULL semantics remain in effect. Query comparisons use explicit exact expressions rather than a database's potentially case-insensitive or trailing-space-insensitive default comparison. These expressions can affect index use; no automatic index-performance guarantee is provided.

Supported: create/update/upsert branches, variables, nested mutation values, through payload values, ordinary select/returning, relation filters/projections, streaming, `count`, and logical filter composition. Root upsert still selects by a separate supported identity field.

V1 rejects enum primary/unique keys, relation join keys, pattern/case-insensitive filters, enum sorting/cursors, distinct/group keys, and `sum/avg/min/max`. Ordinary records may still be sorted or paginated by another supported field. Enum declaration order does not define an ordering API. Direct SQL writers are not constrained by generated enum membership CHECKs in this version.

## Member evolution

```ts
await connection.builder.alterField('articles', 'status', {
  values: ['draft', 'published', 'archived', 'scheduled'],
});
```

The complete list replaces the previous definition. Additions and reordering are allowed within current storage capacity; title/description patches preserve members. Metadata changes invalidate cached Collection definitions. Removing or renaming existing members is rejected, including through metadata document replacement. Such changes need an explicit data migration and coordinated write handling, not implicit data cleanup. Normal Builder alterations to/from enum are also rejected.

Defaults must remain allowed members. Changing the list does not widen storage automatically. Widen an explicitly shorter column with a supported physical alteration before adding longer members. Dropping a field removes its field metadata through the normal Builder lifecycle. Historical migrations are never rewritten.

`set`, general array types, and JSON/JSONB improvements are not included in this implementation.
