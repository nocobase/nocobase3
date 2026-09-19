---
title: Enum and set field types
description: Proposed enum and set contracts, five-database string/array/JSON mappings, metadata and Inspector responsibilities, member changes, and query boundaries.
---

# Enum and set field types

Status: design proposal, not an implemented API contract. Recorded on 2026-09-06. This document consolidates the selected direction; remaining decisions are marked explicitly. No runtime changes accompany it.

## Decision summary

| State                           | Contract                                                                                                                                                  |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Selected direction              | Logical `enum/set`, stable string members in `values`, enum stored as strings, PostgreSQL set stored as TEXT arrays and other sets through JSON           |
| Recommended baseline, not final | Reject duplicates and unknown members; declaration-order canonical output; exact member matching; explicit NULL predicates; replacement-only set mutation |
| Implementation gates            | Member comparison/collation, enum ordering, metadata revision protocol, resource budgets, Oracle JSON representation, and physical array inspection       |

Storage and generic JSON encoding rules belong to the [JSON proposal](./json-field-type.md). This document owns enum membership, set semantics, and member evolution. Neither document grants blanket query support to the other.

## Shared contract and scope

| Logical type | Public value | Meaning                                                             | Selected default storage direction                                  |
| ------------ | ------------ | ------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `enum`       | String       | One member of a finite declared domain                              | Variable-length string on all five databases                        |
| `set`        | String array | Zero or more distinct members of a finite domain; no business order | PostgreSQL `TEXT[]`; JSON array storage on the other four databases |

`values` declares allowed stable string values. Labels, colors, localization, and control layout belong to upper layers, not the database member identity. Dynamic entities with independent attributes and lifecycle should use relations, not static allowed-value lists.

Proposed definitions, not runnable current APIs:

```javascript
c.field({
  name: 'status',
  type: 'enum',
  values: ['draft', 'published', 'archived'],
  nullable: false,
  defaultValue: 'draft',
});

c.field({
  name: 'channels',
  type: 'set',
  values: ['email', 'sms', 'push'],
  nullable: false,
  defaultValue: [],
});
```

Proposed record shape:

```javascript
{
  status: 'published',
  channels: ['email', 'push'],
}
```

Require a non-empty list of unique, non-empty string members. Defaults must satisfy the same validation as writes. No automatic number/boolean coercion, trimming, or case folding is proposed. Unicode, maximum member length, member-count budgets, and collation policy need final specification using the [string proposal](./string-field-types.md). Do not inherit MySQL native SET's 64-member limit or comma restriction merely because the logical type is named `set`.

## Enum behavior

- Accept exactly one declared member, or SQL NULL when nullable. Omission follows the normal create/update/default contract and is not an implicit empty string.
- Preserve stable member identity independently of labels or declaration position. Do not store a numeric ordinal.
- Equality and membership must agree with validation. A case-insensitive or trailing-space-insensitive database comparison must not silently collapse distinct logical members. Choose matching comparison expressions/collations or reject unsupported configurations before promising exact semantics.
- Sorting remains a decision: string order follows collation; declaration order requires explicit rank semantics. Do not inherit native ENUM ordinal sorting accidentally. Range operators, ordering, grouping, and cursor behavior must be specified consistently before support is advertised.
- A string CHECK may reinforce allowed values, but does not replace NOT NULL or Repository validation. Check enforcement and comparison semantics vary by database/version.

## Set behavior

- Accept only one-dimensional arrays of declared string members. Reject duplicates, unknown members, nested arrays, and NULL elements rather than silently cleaning input.
- `[]` is the empty set. SQL NULL is a distinct state allowed only by nullability. A non-nullable field can still contain `[]`; a minimum-selection constraint is a separate future option.
- Recommended normalization: store and return members in `values` declaration order. This is a deterministic representation, not business ordering. Reordering the declaration must not change member identity or set equality.
- PostgreSQL arrays allow duplicates, NULL elements, multiple dimensions, and nonstandard bounds. JSON validity does not prove array shape, element type, allowed membership, or uniqueness. Apply the same logical validation to both backends, including external stored values; do not flatten invalid arrays or silently discard members.
- Ordinary assignment replaces the set. Incremental add/remove operations and their concurrency semantics are outside the initial scope; do not reuse relation mutation syntax without a separate design.
- Generic scalar sorting, min/max, whole-set distinct/grouping, or cursors must not become supported merely because an underlying array/JSON type has an ordering. Define capabilities explicitly or reject unsupported operations.

### Query semantics to implement

Exact Builder method names and AST operators remain to be designed. The semantic contract should distinguish:

| Operation    | Meaning                               | Recommended empty-operand rule           |
| ------------ | ------------------------------------- | ---------------------------------------- |
| Contains one | The field contains a specified member | Requires one valid member                |
| Contains any | At least one requested member exists  | Empty request is false for non-null sets |
| Contains all | Every requested member exists         | Empty request is true for non-null sets  |
| Set equality | Same members, independent of order    | Empty request matches only `[]`          |
| Empty        | No members                            | Matches `[]`, not NULL                   |
| Is null      | Missing set value                     | Matches SQL NULL, not `[]`               |

NULL behavior under negation must be explicit and consistent with Repository's SQL three-valued logic. Empty-operand rules above are recommendations pending the query contract. Validate query operands as well as writes. Raw array equality is order-sensitive, and JSON textual equality is not set equality; neither is a sufficient portable implementation. Canonicalization alone does not repair older rows after declaration reordering.

Recommended predicate baseline: ordinary membership/equality predicates on SQL NULL yield UNKNOWN; negation remains UNKNOWN, and WHERE excludes both. With an empty request, contains-any returns false and contains-all returns true only for non-null sets. This requires an explicit NULL guard on JSON implementations based on EXISTS/NOT EXISTS; those constructs otherwise often collapse NULL into false/true. Dedicated empty-set and null tests remain separate predicates. These are proposed semantics, not final AST names.

### JSON-backed set is not a generic JSON field

| Input/property                   | Logical `set`                             | Logical `json`                                       |
| -------------------------------- | ----------------------------------------- | ---------------------------------------------------- |
| `['email', 'email']`             | Invalid duplicate                         | Valid JSON array unless separately constrained       |
| `['sms', 'email']`               | Same members as `['email', 'sms']`        | Different array order                                |
| `[null]`, nested arrays, objects | Invalid                                   | JSON structures; public top-level policy is separate |
| `[]`                             | Empty set                                 | Empty JSON array                                     |
| Public `null`                    | SQL NULL when nullable                    | Public SQL-NULL/JSON-null distinction still pending  |
| `jsonb` parameter                | Reject, even where storage is JSON-backed | JSON-only preference                                 |

Reuse serialization/binding infrastructure, not ordinary JSON array equality or implicit null coercion. For JSON-backed sets, a stored top-level JSON null is invalid set data; do not normalize it into SQL NULL. Drivers that collapse the two must preserve an SQL-null indicator or use a projection/codec that distinguishes them before validating. PostgreSQL array shape and lower bounds also need checks before a driver flattens or discards that information. An empty PostgreSQL array is a valid empty set even though array-dimension functions may report no dimensions.

Validate physical contents before producing canonical output. Reads may return valid members in current declaration order without rewriting old rows; merely reading must not mutate storage. Query correctness must not depend on every row already having that order.

## Five-database mappings

| Database   | Enum storage                                       | Set storage                                                                                |
| ---------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| PostgreSQL | `VARCHAR(n)`                                       | `TEXT[]`, not a native ENUM array                                                          |
| MySQL      | `VARCHAR(n)`                                       | `JSON`, containing an array                                                                |
| SQLite     | `TEXT`                                             | `TEXT`, containing JSON array data                                                         |
| Oracle     | `VARCHAR2(n CHAR)` under the chosen Unicode policy | Native JSON or a supported JSON text/LOB representation; version and driver policy pending |
| SQL Server | `NVARCHAR(n)`                                      | SQL Server 2022 baseline: JSON in `NVARCHAR(MAX)`                                          |

The length unit/defaults and physical character capacities follow the string proposal and must accommodate every allowed enum member. Adding longer members may require DDL even without native ENUM. JSON validity and top-level-array enforcement are separate checks, with version-specific syntax/support. Native JSON null is not the portable nullable-set representation: logical null maps to SQL NULL.

Default expressions such as an empty array must be compiled and validated per dialect, not copied as a universal SQL literal. Full CHECK generation, direct-SQL enforcement, and maximum payload budgets remain implementation decisions. Repository validation alone does not constrain external writers.

Native MySQL ENUM/SET and PostgreSQL ENUM are not default targets. Native SET uses a finite bitmask, imposes member restrictions, and commonly returns comma-separated strings. PostgreSQL ENUM has an independent type lifecycle and ordinal ordering. Such native columns need explicit adapters before they can satisfy the portable contract; no implicit adoption or automatic migration is proposed.

## Inspector, metadata, and Resolver

Inspector reports actual storage, not guessed enum/set semantics. String columns remain string/text categories, JSON remains its physical representation, and PostgreSQL arrays need physical array/element information. Do not infer allowed members by sampling data or arbitrarily parsing a string CHECK into a logical type.

The PostgreSQL Inspector currently lacks an array category and element metadata. Its extension must identify the element through catalog relationships, preserving schema/native type and relevant domain information rather than stripping a leading underscore from a type name. Declared dimensions alone do not guarantee runtime array shape. Supporting physical inspection does not require exposing a general Collection `array` type.

Metadata must persist both logical type and allowed values, for example:

```json
{
  "fields": {
    "status": {
      "type": "enum",
      "values": ["draft", "published", "archived"]
    },
    "channels": {
      "type": "set",
      "values": ["email", "sms", "push"]
    }
  }
}
```

This is a proposed metadata extension: current scalar `type` persistence does not include `values`. Resolver checks supported storage, element type, logical constraints, and query capabilities before adopting metadata. Ordinary JSON objects, unrelated arrays, or a narrow string column must not become compatible merely by changing metadata. Preserve physical defaults/constraints and the existing schema-drift and atomicity safeguards.

Shape validation is separate from schema compatibility: Resolver can establish that a JSON column has a supported codec, but cannot establish that all existing rows are arrays without a data audit. Validate each decoded row or run an explicitly requested audit before enabling the contract. Report malformed data rather than silently rewriting it.

Recommended definition rules: require `values` for enum/set; reject it on unrelated scalar types; replace the complete list on a values patch rather than append implicitly. A title-only patch preserves the list. Switching away from enum/set must clear obsolete member metadata through the explicit type-change workflow; it must not leave stale constraints active. Removing `values` while keeping enum/set is invalid. Creation, alteration, deletion, cache invalidation, and metadata validation must share these rules.

Without metadata, Inspector should preserve native facts. Existing native ENUM/SET member catalogs may be exposed through a separately specified physical representation, but do not automatically become the portable logical contract. The current open string `FieldType` does not constitute runtime enum/set support.

## Member changes and existing data

| Change               | Required handling                                                                                                        |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Add a member         | Validate uniqueness and capacity; update metadata and relevant physical checks; widen storage if necessary               |
| Remove a member      | Detect references in rows/defaults; reject unsafe changes or require an explicit data migration policy                   |
| Rename a member      | Treat as an identity/data change, not a label edit; update scalar values or set elements explicitly and check collisions |
| Reorder members      | Identity and membership unchanged; canonical output may change, and enum rank sorting is not implicitly enabled          |
| Change labels/colors | Upper-layer metadata only; no stored member rewrite                                                                      |

Do not silently drop removed set members, convert old enum values to NULL, or overwrite invalid defaults. Specify revision/concurrency handling so validation and mutation cannot use inconsistent domain versions. Cross-database DDL and metadata atomicity must be respected; do not promise rollback where a driver/database cannot provide it. Historical migrations remain immutable.

The member-change workflow must preflight data/defaults/capacity, exclude concurrent writes against the obsolete domain, perform the supported data/DDL changes, and publish metadata with cache invalidation. A metadata revision check alone does not exclude an in-flight write already validated against an older domain. Specify locking, write gating, or an equivalent protocol before implementing removals. Where DDL and metadata cannot be coordinated safely, require an explicit migration/maintenance workflow rather than a misleading all-or-nothing metadata update.

## Query implementation and performance

PostgreSQL containment and overlap can use `@>` and `&&` on parameterized text arrays. Appropriate GIN indexes can accelerate supported predicates. Set equality still needs order-independent semantics. Index creation is explicit, not automatic for every set field.

Other dialects need JSON-specific membership implementations. MySQL multi-valued indexes and Oracle/SQL Server JSON indexing are version- and expression-dependent; SQLite member expansion has no equivalent general-purpose GIN index. JSON storage does not guarantee indexed member lookup. Never interpolate member strings into SQL or JSON paths.

Fixed small domains and bounded scans are suitable set-field workloads. Frequent high-volume member search, member-level statistics, or independently managed options should prefer explicit relation tables with member/owner indexes. No hidden relation-table creation is part of this proposal; that would require separate identity, migration, transaction, and loading design.

## Implementation order and verification

1. Finalize member identity/collation, resource limits, enum ordering, set query/NULL semantics, Oracle JSON policy, and Inspector array representation. Recommended V1 scope is enum equality/membership plus set membership/equality/empty/null, with whole-set sorting, distinct, grouping, and cursor use rejected until separately designed. This does not disable already supported operations on unrelated types.
2. Implement shared domain validation and metadata lifecycle, then enum storage, Resolver compatibility, values/filters/returning, and member-change safeguards.
3. Implement set storage and codecs for PostgreSQL arrays and the other four JSON paths, then equivalent membership/equality queries and explicit index capabilities.
4. Verify Builder-to-Inspector-to-Resolver round trips and Repository contracts, then update formal usage documentation.

Use one shared logical test matrix plus dialect-specific physical tests. Cover invalid/duplicate definitions and defaults; unknown members; omitted/null/empty values; Unicode, quotes and commas; array shape and duplicate rejection; operand-order permutations; declaration reordering; empty query operands and negation; member migrations; concurrency; relation projections; variables; bulk returning; and rollback where supported. Performance tests must inspect real query plans rather than assume an index is used. Report live five-database results separately from mocks and SQL-generation checks.

No numeric precision redesign, automatic native ENUM/SET conversion, general array API, or relational storage engine is included. This proposal documents the direction without starting implementation.
